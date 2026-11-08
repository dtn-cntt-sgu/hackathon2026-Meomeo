"use client";

// Khung Monaco chỉ đọc — docs/spec/30_UI.md Mục 5. File này kéo theo gói `monaco-editor` (nặng),
// nên CHỈ được nạp qua `next/dynamic` (ssr: false) từ CodeSnippetViewer, không import tĩnh ở nơi khác.
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { HybridArchitecturalNode, NodeAnalysisView } from "@/contracts";
import type { HighlightRange } from "@/store/workbench";
import { LoadingAnimation } from "@/components/ui/LoadingAnimation";
import {
  buildDtoModel,
  buildStepModel,
  findStep,
  hlToModelRanges,
  toOriginalSelection,
  weakPointHl,
  type CodeSelection,
  type StepModel,
} from "./slice-model";

// ---------- Tự host Monaco: không tải CDN ----------

type MonacoGlobal = { MonacoEnvironment?: monaco.Environment };

if (typeof self !== "undefined") {
  (self as unknown as MonacoGlobal).MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === "typescript" || label === "javascript") {
        return new Worker(new URL("monaco-editor/languages/features/typescript/ts.worker.js", import.meta.url), {
          type: "module",
        });
      }
      return new Worker(new URL("monaco-editor/editor/editor.worker.js", import.meta.url), { type: "module" });
    },
  };
  // Lát cắt thiếu ngữ cảnh ⇒ mọi chẩn đoán TS/JS đều là báo sai: tắt hết.
  for (const defaults of [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]) {
    defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true, noSuggestionDiagnostics: true });
  }
  loader.config({ monaco });
}

const LANGUAGE_BY_ID: Record<string, string> = {
  TYPESCRIPT: "typescript",
  TSX: "typescript",
  JAVASCRIPT: "javascript",
  JSX: "javascript",
  PYTHON: "python",
  DART: "dart",
  KOTLIN: "kotlin",
  SWIFT: "swift",
  JAVA: "java",
  GO: "go",
  RUST: "rust",
  RUBY: "ruby",
  PHP: "php",
  CSHARP: "csharp",
  C_SHARP: "csharp",
  CPP: "cpp",
  C: "c",
  SCALA: "scala",
};

export function monacoLanguage(languageId: string | undefined): string {
  return (languageId && LANGUAGE_BY_ID[languageId.toUpperCase()]) || "plaintext";
}

// ---------- Chủ đề ----------

type ThemeName = "simplifey-dark" | "simplifey-light";

function defineThemes(m: typeof monaco) {
  m.editor.defineTheme("simplifey-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "ff8f85" },
      { token: "string", foreground: "9fd0ff" },
      { token: "comment", foreground: "5f6c80" },
    ],
    colors: {
      "editor.background": "#0b1016",
      "editor.foreground": "#d6deea",
      "editorLineNumber.foreground": "#5f6c80",
      "editorGutter.background": "#0b1016",
    },
  });
  m.editor.defineTheme("simplifey-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "c4261f" },
      { token: "string", foreground: "0b4f9e" },
      { token: "comment", foreground: "8a95a6" },
    ],
    colors: {
      "editor.background": "#f8f9fb",
      "editor.foreground": "#1f2733",
      "editorLineNumber.foreground": "#8a95a6",
      "editorGutter.background": "#f8f9fb",
    },
  });
}

function subscribeTheme(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
const themeSnapshot = (): ThemeName =>
  document.documentElement.dataset.theme === "light" ? "simplifey-light" : "simplifey-dark";
const themeServerSnapshot = (): ThemeName => "simplifey-dark";

// ---------- Kiểu dáng của dòng tô (token từ globals.css, prototype `.ln.hl-*`) ----------

const PANE_CSS = `
.sf-code{--code-bg:#0b1016;--code-text:#d6deea;--gutter:#5f6c80}
html[data-theme="light"] .sf-code{--code-bg:#f8f9fb;--code-text:#1f2733;--gutter:#8a95a6}
.sf-code .sf-step{background:var(--hl-step)}
.sf-code .sf-bar-step{box-shadow:inset 3px 0 0 var(--accent)}
.sf-code .sf-focus{background:var(--hl-focus)}
.sf-code .sf-bar-focus{box-shadow:inset 3px 0 0 var(--amber)}
.sf-code .sf-good{background:var(--hl-good)}
.sf-code .sf-bar-good{box-shadow:inset 3px 0 0 var(--green)}
.sf-code .sf-bad{background:var(--hl-bad)}
.sf-code .sf-bar-bad{box-shadow:inset 3px 0 0 var(--red)}
.sf-code .sf-marker{opacity:.55;font-style:italic}
.sf-code .sf-glyph-weak{display:flex;align-items:center;justify-content:center;cursor:help}
.sf-code .sf-glyph-weak::before{content:"";display:block;width:6px;height:6px;border-radius:50%;background:var(--amber)}
@keyframes sfFlash{0%,100%{background:transparent}25%,75%{background:rgba(56,189,248,0.35)}50%{background:rgba(56,189,248,0.15)}}
.sf-code .sf-flash-line{animation:sfFlash .5s ease-in-out 3}
.sf-code .sf-bar-flash{box-shadow:inset 4px 0 0 var(--accent)}
`;

const HL_CLASS = {
  FOCUS: { line: "sf-focus", bar: "sf-bar-focus" },
  GOOD: { line: "sf-good", bar: "sf-bar-good" },
  BAD: { line: "sf-bad", bar: "sf-bar-bad" },
} as const;

export const REASON_DTO = "Phần Kiểu dữ liệu không dùng được nút Giải thích";

// ---------- Component ----------

export interface MonacoPaneProps {
  node: HybridArchitecturalNode;
  analysis: NodeAnalysisView | "PENDING" | "FAILED" | null | undefined;
  activeStep: number | null;
  hl: HighlightRange[];
  showDto: boolean;
  fontSize: number;
  onSelect: (selection: CodeSelection | null) => void;
  /** `ui.xray_stage = "TOUR"` ⇒ tô nền cả code của bước (`--hl-step`); `hl` vẽ đè lên. */
  tourTint?: boolean;
}

export default function MonacoPane({
  node,
  analysis,
  activeStep,
  hl,
  showDto,
  fontSize,
  onSelect,
  tourTint = false,
}: MonacoPaneProps) {
  const theme = useSyncExternalStore(subscribeTheme, themeSnapshot, themeServerSnapshot);
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const flashDecorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFlashStep = useRef<number | null>(null);

  // Model chỉ đổi khi node / bước / tab DTO đổi — dựng lại mỗi lần vẽ sẽ xóa vùng chọn đang có.
  const model: StepModel = useMemo(
    () => (showDto ? buildDtoModel(node) : buildStepModel(node, activeStep)),
    [node, activeStep, showDto],
  );
  const language = monacoLanguage(node.languages[0]);

  // Số dòng gốc (UI-31): marker (0) không có số. Giữ nguyên tham chiếu để thư viện không gọi updateOptions mỗi lần vẽ.
  const options = useMemo<monaco.editor.IStandaloneEditorConstructionOptions>(
    () => ({
        readOnly: true,
        domReadOnly: true,
        glyphMargin: true,
        minimap: { enabled: false },
        contextmenu: false,
        scrollBeyondLastLine: false,
        folding: false,
        automaticLayout: true,
        renderLineHighlight: "none",
        occurrencesHighlight: "off",
        selectionHighlight: false,
        lineNumbersMinChars: 4,
        lineDecorationsWidth: 6,
        fontSize,
        lineHeight: Math.round(fontSize * 1.75),
        fontFamily: 'Consolas, "Cascadia Mono", "SFMono-Regular", Menlo, monospace',
        padding: { top: 8, bottom: 8 },
        quickSuggestions: false,
        parameterHints: { enabled: false },
        codeLens: false,
        links: false,
        stickyScroll: { enabled: false },
        renderValidationDecorations: "off",
        ariaLabel: "Code của bước đang xem",
        lineNumbers: (n: number) => (model.lineMap[n - 1] > 0 ? String(model.lineMap[n - 1]) : ""),}),
    [fontSize, model],
  );

  // Giá trị mới nhất cho handler đăng ký một lần (tránh đăng ký lại mỗi lần vẽ).
  const live = useRef({ model, activeStep, showDto, onSelect });
  useEffect(() => {
    live.current = { model, activeStep, showDto, onSelect };
  });

  const emitSelection = useCallback(() => {
    if (!editor) return;
    const { model: m, activeStep: step, showDto: dto, onSelect: cb } = live.current;
    const sel = editor.getSelection();
    const textModel = editor.getModel();
    if (!sel || !textModel || sel.isEmpty()) {
      cb(null);
      return;
    }
    const original = toOriginalSelection(m, {
      startLineNumber: sel.startLineNumber,
      startColumn: sel.startColumn,
      endLineNumber: sel.endLineNumber,
      endColumn: sel.endColumn,
    });
    const host = editor.getDomNode()?.getBoundingClientRect();
    const a = editor.getScrolledVisiblePosition(sel.getStartPosition());
    const b = editor.getScrolledVisiblePosition(sel.getEndPosition());
    let rect: DOMRect;
    if (host && a && b) {
      const left = host.left + Math.min(a.left, b.left);
      const top = host.top + Math.min(a.top, b.top);
      const right = host.left + Math.max(a.left, b.left);
      const bottom = host.top + Math.max(a.top + a.height, b.top + b.height);
      rect = new DOMRect(left, top, Math.max(right - left, 1), bottom - top);
    } else {
      rect = host ?? new DOMRect(0, 0, 0, 0);
    }
    // Luôn phát, kể cả vùng không hợp lệ: nút Giải thích hiện ở trạng thái tắt kèm lý do (ghi chú 4).
    cb({
      range: original.range,
      selected_text: textModel.getValueInRange(sel),
      step_number: step ?? 0,
      rect,
      invalid_reason: dto ? REASON_DTO : original.invalid_reason,
    });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const subs = [
      editor.onDidChangeCursorSelection(emitSelection),
      editor.onDidScrollChange(() => {
        if (!editor.getSelection()?.isEmpty()) emitSelection();
      }),
    ];
    return () => subs.forEach((s) => s.dispose());
  }, [editor, emitSelection]);

  // Tô sáng (UI-32): tint cả bước (tour), FOCUS / GOOD / BAD theo ui.hl, ⚠ ở dòng điểm dở, mờ dòng marker.
  useEffect(() => {
    if (!editor) return;
    const step = showDto ? null : findStep(node, activeStep);
    const lineCount = model.lineMap.length;
    const decs: monaco.editor.IModelDeltaDecoration[] = [];

    if (tourTint && !showDto && lineCount > 0) {
      decs.push({
        range: new monaco.Range(1, 1, lineCount, 1),
        options: { isWholeLine: true, className: "sf-step", linesDecorationsClassName: "sf-bar-step" },
      });
    }
    if (!showDto) {
      model.lineMap.forEach((orig, i) => {
        if (orig === 0) decs.push({ range: new monaco.Range(i + 1, 1, i + 1, 1), options: { isWholeLine: true, className: "sf-marker" } });
      });
    }

    const mine = showDto ? [] : hl.filter((h) => h.step === activeStep);
    const ranges = hlToModelRanges(model, mine);
    for (const r of ranges) {
      const cls = HL_CLASS[r.kind];
      decs.push({
        range: new monaco.Range(r.start_line, 1, r.end_line, 1),
        options: { isWholeLine: true, className: cls.line, linesDecorationsClassName: cls.bar },
      });
    }

    if (step && analysis && typeof analysis === "object") {
      for (const w of analysis.weak_points.filter((p) => p.step === step.step_number)) {
        const line = hlToModelRanges(model, [weakPointHl(step, w.symbol)])[0]?.start_line;
        if (line) {
          decs.push({
            range: new monaco.Range(line, 1, line, 1),
            options: {
              glyphMarginClassName: "sf-glyph-weak",
              glyphMarginHoverMessage: { value: `Nhận định của AI: ${w.what}` },
            },
          });
        }
      }
    }

    decorations.current?.clear();
    decorations.current = editor.createDecorationsCollection(decs);
    if (ranges.length > 0) editor.revealLineInCenterIfOutsideViewport(ranges[0].start_line);
  }, [editor, node, analysis, activeStep, showDto, hl, tourTint, model]);

  // Thực thi hiệu ứng cuộn tới dòng đầu bước và nháy sáng 1.5 giây
  const executeFlashStep = useCallback(() => {
    if (!editor) return;
    const firstIndex = model.lineMap.findIndex((orig) => orig > 0);
    const targetLine = firstIndex >= 0 ? firstIndex + 1 : 1;
    editor.revealLineInCenter(targetLine);

    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashDecorations.current?.clear();

    const flashDecs: monaco.editor.IModelDeltaDecoration[] = [];
    for (let i = 0; i < model.lineMap.length; i++) {
      if (model.lineMap[i] > 0) {
        flashDecs.push({
          range: new monaco.Range(i + 1, 1, i + 1, 1),
          options: {
            isWholeLine: true,
            className: "sf-flash-line",
            linesDecorationsClassName: "sf-bar-flash",
          },
        });
      }
    }
    if (flashDecs.length === 0 && model.lineMap.length > 0) {
      for (let i = 0; i < model.lineMap.length; i++) {
        flashDecs.push({
          range: new monaco.Range(i + 1, 1, i + 1, 1),
          options: {
            isWholeLine: true,
            className: "sf-flash-line",
            linesDecorationsClassName: "sf-bar-flash",
          },
        });
      }
    }

    flashDecorations.current = editor.createDecorationsCollection(flashDecs);
    flashTimeoutRef.current = setTimeout(() => {
      flashDecorations.current?.clear();
      flashDecorations.current = null;
    }, 1500);
  }, [editor, model]);

  // Lắng nghe sự kiện sf:open-hint-step
  useEffect(() => {
    const onHintStep = (e: Event) => {
      const ce = e as CustomEvent<{ step: number }>;
      const step = ce.detail?.step;
      if (typeof step !== "number") return;
      pendingFlashStep.current = step;
      if (editor && activeStep === step) {
        pendingFlashStep.current = null;
        executeFlashStep();
      }
    };
    window.addEventListener("sf:open-hint-step", onHintStep);
    return () => window.removeEventListener("sf:open-hint-step", onHintStep);
  }, [editor, activeStep, executeFlashStep]);

  // Khi model hoặc activeStep thay đổi tới step đang chờ flash
  useEffect(() => {
    if (pendingFlashStep.current !== null && pendingFlashStep.current === activeStep) {
      pendingFlashStep.current = null;
      executeFlashStep();
    }
  }, [activeStep, model, executeFlashStep]);

  // Dọn dẹp timeout khi unmount
  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      flashDecorations.current?.clear();
    };
  }, []);

  // Đổi bước ⇒ về đầu code (trừ khi là bước hint đang cần cuộn tới dòng đầu).
  useEffect(() => {
    if (pendingFlashStep.current === activeStep) return;
    editor?.setScrollTop(0);
  }, [editor, model.text, activeStep]);

  return (
    <div className="sf-code relative h-full min-h-0 w-full bg-[var(--code-bg)]">
      <style>{PANE_CSS}</style>
      <Editor
        height="100%"
        language={language}
        value={model.text}
        theme={theme}
        beforeMount={defineThemes}
        onMount={(ed) => setEditor(ed)}
        loading={
          <div className="flex h-full min-h-[300px] w-full items-center justify-center bg-[var(--code-bg)]">
            <LoadingAnimation size={150} text="Đang tải khung code…" />
          </div>
        }
        options={options}
      />
    </div>
  );
}
