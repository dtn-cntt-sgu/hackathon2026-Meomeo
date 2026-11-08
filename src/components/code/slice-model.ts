// Model code theo bước cho khung Monaco — docs/spec/30_UI.md Mục 5 (D-81, UI-31, UI-32, UI-34).
// Thuần hàm, không phụ thuộc Monaco hay DOM nên test được bằng vitest (môi trường node).
import type { ExecutionTraceStep, HybridArchitecturalNode, NodeAnalysisView } from "@/contracts";
import { CONFIG } from "@/contracts/config";
import type { HighlightRange } from "@/store/workbench";

/** Code của MỘT bước: `lineMap[i]` = số dòng gốc của dòng `i + 1` trong `text` (0 = dòng đánh dấu, không có số). */
export interface StepModel {
  text: string;
  lineMap: number[];
}

export interface FileTab {
  key: string;
  kind: "FILE" | "DTO";
  /** Đường dẫn đầy đủ (tooltip); tab DTO là "". */
  path: string;
  /** basename (tab DTO: "Kiểu dữ liệu"). */
  name: string;
  /** Bước đầu thuộc file; null với tab DTO hoặc file không có bước. */
  first_step: number | null;
  steps: number[];
  /** Có bước trong `analysis.weak_points` ⇒ chấm đỏ. */
  has_weak: boolean;
}

export interface SelectionRange {
  line_start: number;
  col_start: number;
  line_end: number;
  col_end: number;
}

export interface CodeSelection {
  range: SelectionRange; // Số dòng gốc, cột từ 1, col_end loại trừ
  selected_text: string;
  step_number: number;
  rect: DOMRect;
  /** null = hợp lệ. Có chuỗi ⇒ vẫn phát, nút Giải thích hiện nhưng tắt kèm lý do (ghi chú 4). */
  invalid_reason: string | null;
}

/** Vùng chọn theo hệ tọa độ của model Monaco (dòng, cột từ 1; `endColumn` loại trừ). */
export interface ModelSelection {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface OriginalSelection {
  range: SelectionRange;
  selected_text: string;
  invalid_reason: string | null;
}

/** Khoảng dòng của model (số dòng model, từ 1) cần tô. */
export interface ModelHlRange {
  start_line: number;
  end_line: number;
  kind: HighlightRange["kind"];
}

export const REASON_EMPTY = "Chưa chọn đoạn code nào";
export const REASON_MARKER = "Vùng chọn có dòng không thuộc bài học (dòng đã lược)";
export const REASON_DISCONTINUOUS = "Vùng chọn gồm các dòng không liền nhau";
export const REASON_TOO_LONG = "Đoạn bạn chọn hơi dài, chọn vài dòng thôi để giải thích kỹ hơn nhé";
export const REASON_NO_WORD = "Chọn một tên hàm, tên biến hoặc một dòng code có chữ để mình giải thích nhé";

const EMPTY_MODEL: StepModel = { text: "", lineMap: [] };

export function findStep(node: HybridArchitecturalNode, activeStep: number | null): ExecutionTraceStep | null {
  if (activeStep === null) return null;
  return node.trace_steps.find((s) => s.step_number === activeStep) ?? null;
}

/** Chỉ `snippet` của bước đang xem, không nối các bước. Bước không có ⇒ model rỗng (không ném lỗi). */
export function buildStepModel(node: HybridArchitecturalNode, activeStep: number | null): StepModel {
  const step = findStep(node, activeStep);
  if (!step) return EMPTY_MODEL;
  return { text: step.snippet, lineMap: [...step.snippet_line_map] };
}

/** Tab "Kiểu dữ liệu": không số dòng ⇒ mọi dòng là 0. */
export function buildDtoModel(node: HybridArchitecturalNode): StepModel {
  const text = node.dto_snippet;
  if (text.trim() === "") return EMPTY_MODEL;
  return { text, lineMap: text.split("\n").map(() => 0) };
}

export function buildFileTabs(
  node: HybridArchitecturalNode,
  analysis: NodeAnalysisView | "PENDING" | "FAILED" | null | undefined,
): FileTab[] {
  const weakFiles = new Set<string>();
  if (analysis && typeof analysis === "object") {
    for (const w of analysis.weak_points) weakFiles.add(w.file_path);
  }
  const files = [...new Set(node.files)];
  const tabs: FileTab[] = files.map((path) => {
    const steps = node.trace_steps.filter((s) => s.file_path === path).map((s) => s.step_number);
    return {
      key: `file:${path}`,
      kind: "FILE",
      path,
      name: path.split("/").pop() || path,
      first_step: steps.length > 0 ? Math.min(...steps) : null,
      steps,
      has_weak: weakFiles.has(path),
    };
  });
  if (node.dto_snippet.trim() !== "") {
    tabs.push({ key: "dto", kind: "DTO", path: "", name: "Kiểu dữ liệu", first_step: null, steps: [], has_weak: false });
  }
  return tabs;
}

/** Cả bước (từ dòng gốc nhỏ nhất đến lớn nhất có số), dùng cho T-UI-07 "cả bước". */
export function stepHl(step: ExecutionTraceStep, kind: HighlightRange["kind"]): HighlightRange {
  const real = step.snippet_line_map.filter((n) => n > 0);
  return {
    step: step.step_number,
    line_start: real.length > 0 ? Math.min(...real) : step.line_start,
    line_end: real.length > 0 ? Math.max(...real) : step.line_end,
    kind,
  };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function lineHasSymbol(line: string, symbol: string): boolean {
  if (symbol === "") return false;
  return new RegExp(`(?<![\\w$])${escapeRegExp(symbol)}(?![\\w$])`).test(line);
}

/**
 * Điểm dở: dòng gốc đầu tiên trong `snippet` chứa `symbol` (AI-18); không thấy ⇒ cả bước.
 * `OrderService.checkout` không có nguyên văn thì thử phần sau dấu chấm / `::` (`checkout`).
 */
export function weakPointHl(step: ExecutionTraceStep, symbol: string): HighlightRange {
  const candidates = [symbol.trim(), symbol.trim().split(/\.|::/).pop() ?? ""];
  const lines = step.snippet.split("\n");
  for (const cand of candidates) {
    const idx = lines.findIndex((l, i) => (step.snippet_line_map[i] ?? 0) > 0 && lineHasSymbol(l, cand));
    if (idx >= 0) {
      const n = step.snippet_line_map[idx];
      return { step: step.step_number, line_start: n, line_end: n, kind: "BAD" };
    }
  }
  return stepHl(step, "BAD");
}

/** Đổi `ui.hl` (số dòng gốc) sang khoảng dòng model qua `lineMap`; dòng gốc không có trong model bị bỏ. */
export function hlToModelRanges(model: StepModel, hl: HighlightRange[]): ModelHlRange[] {
  const out: ModelHlRange[] = [];
  for (const h of hl) {
    let start = 0;
    let prev = 0;
    for (let i = 0; i < model.lineMap.length; i++) {
      const orig = model.lineMap[i];
      const inside = orig > 0 && orig >= h.line_start && orig <= h.line_end;
      const line = i + 1;
      if (inside && start === 0) start = line;
      if (inside) prev = line;
      if (!inside && start !== 0) {
        out.push({ start_line: start, end_line: prev, kind: h.kind });
        start = 0;
      }
    }
    if (start !== 0) out.push({ start_line: start, end_line: prev, kind: h.kind });
  }
  return out;
}

/**
 * Đổi vùng chọn của model sang số dòng gốc (cột từ 1, `col_end` loại trừ).
 * KHÔNG trả null: vùng chạm dòng đánh dấu, không liền nhau, rỗng hay quá `EXPLAIN_SELECTION_MAX_CHARS`
 * vẫn trả kết quả kèm `invalid_reason` để nút Giải thích hiện ở trạng thái tắt (ghi chú 4).
 */
export function toOriginalSelection(model: StepModel, selection: ModelSelection): OriginalSelection {
  const lines = model.text.split("\n");
  let { startLineNumber: sl, startColumn: sc, endLineNumber: el, endColumn: ec } = selection;
  if (sl > el || (sl === el && sc > ec)) [sl, sc, el, ec] = [el, ec, sl, sc];

  // Chọn nguyên dòng (ba lần bấm / kéo tới đầu dòng sau) ⇒ kết thúc ở cuối dòng trước, không chạm dòng sau.
  if (ec === 1 && el > sl) {
    el -= 1;
    ec = (lines[el - 1]?.length ?? 0) + 1;
  }

  const clampLine = (n: number) => Math.min(Math.max(n, 1), Math.max(lines.length, 1));
  sl = clampLine(sl);
  el = clampLine(el);

  const picked: string[] = [];
  for (let n = sl; n <= el; n++) {
    const text = lines[n - 1] ?? "";
    const from = n === sl ? sc - 1 : 0;
    const to = n === el ? ec - 1 : text.length;
    picked.push(text.slice(Math.max(from, 0), Math.max(to, 0)));
  }
  const selectedText = picked.join("\n");

  const origStart = model.lineMap[sl - 1] ?? 0;
  const origEnd = model.lineMap[el - 1] ?? 0;
  const range: SelectionRange = {
    line_start: origStart,
    col_start: sc,
    line_end: origEnd,
    col_end: ec,
  };

  let invalid: string | null = null;
  if (selectedText.trim() === "") {
    invalid = REASON_EMPTY;
  } else {
    let touchesMarker = false;
    let continuous = true;
    for (let n = sl; n <= el; n++) {
      const orig = model.lineMap[n - 1] ?? 0;
      if (orig <= 0) touchesMarker = true;
      else if (n > sl && model.lineMap[n - 2] > 0 && orig !== model.lineMap[n - 2] + 1) continuous = false;
    }
    if (touchesMarker) invalid = REASON_MARKER;
    else if (!continuous) invalid = REASON_DISCONTINUOUS;
    else if (selectedText.length > CONFIG.EXPLAIN_SELECTION_MAX_CHARS) invalid = REASON_TOO_LONG;
    // Chỉ có dấu ngoặc, dấu câu (VD "{ {") ⇒ không có gì để giải thích, không gọi AI.
    else if (!/[\p{L}\p{N}]/u.test(selectedText)) invalid = REASON_NO_WORD;
  }

  return { range, selected_text: selectedText, invalid_reason: invalid };
}
