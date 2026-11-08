"use client";

// Khung code cột giữa: hàng tab file (.ftab), dòng đường dẫn (.fpath), Monaco của bước đang xem.
// docs/spec/30_UI.md Mục 5, docs/prototype.html `.ftabs` / `.fpath`.
import { ExternalLink } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SelectionPopover } from "@/components/code/SelectionPopover";
import { buildFileTabs, findStep, type CodeSelection } from "@/components/code/slice-model";
import { RepoOverview } from "@/components/learn/RepoOverview";
import { explanationKey } from "@/lib/selection-explain";
import { LoadingAnimation } from "@/components/ui/LoadingAnimation";
import { useWorkbenchStore } from "@/store/workbench";

// Monaco chỉ tải khi vào /learn và mở một bài (chunk riêng, không SSR).
const MonacoPane = dynamic(() => import("@/components/code/MonacoPane"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[300px] w-full items-center justify-center bg-[var(--code-bg)]">
      <LoadingAnimation size={150} text="Đang tải khung code…" />
    </div>
  ),
});

const BASE_FONT_SIZE = 13;

const MONO = "font-mono";

export function CodeSnippetViewer() {
  const result = useWorkbenchStore((s) => s.result);
  const activeNodeId = useWorkbenchStore((s) => s.active_node_id);
  const analyses = useWorkbenchStore((s) => s.analyses);
  const storeStep = useWorkbenchStore((s) => s.active_step);
  const hl = useWorkbenchStore((s) => s.ui.hl);
  const xrayStage = useWorkbenchStore((s) => s.ui.xray_stage);
  const activeTab = useWorkbenchStore((s) => s.active_tab);
  const setActiveStep = useWorkbenchStore((s) => s.setActiveStep);
  const setXrayStage = useWorkbenchStore((s) => s.setXrayStage);

  const [dtoKey, setDtoKey] = useState<string | null>(null);
  const [selection, setSelection] = useState<CodeSelection | null>(null);
  const closeSelection = useCallback(() => setSelection(null), []);

  const node = useMemo(() => result?.nodes.find((n) => n.id === activeNodeId) ?? null, [result, activeNodeId]);
  const analysis = activeNodeId ? analyses[activeNodeId] : undefined;
  const tabs = useMemo(() => (node ? buildFileTabs(node, analysis) : []), [node, analysis]);

  // Lắng nghe sự kiện thử mẫu từ Duolingo Tour bước 3
  useEffect(() => {
    const handleTourSample = (e: Event) => {
      const ce = e as CustomEvent<{ sample: string }>;
      const sample = ce.detail?.sample || "productService.listProducts";
      const codeContainer = document.getElementById("colMid");
      const rect = codeContainer?.getBoundingClientRect() ?? new DOMRect(200, 200, 100, 20);
      setSelection({
        range: { line_start: 1, col_start: 1, line_end: 1, col_end: sample.length + 1 },
        selected_text: sample,
        step_number: storeStep ?? 1,
        rect: new DOMRect(rect.left + 80, rect.top + 120, 180, 22),
        invalid_reason: null,
      });
    };
    window.addEventListener("sf:tour-sample-select", handleTourSample);
    return () => window.removeEventListener("sf:tour-sample-select", handleTourSample);
  }, [storeStep]);

  // Lắng nghe sự kiện mở bước gợi ý: chuyển ngay về file code của bước đó (thoát tab DTO)
  useEffect(() => {
    const handleOpenHint = () => {
      setDtoKey(null);
    };
    window.addEventListener("sf:open-hint-step", handleOpenHint);
    return () => window.removeEventListener("sf:open-hint-step", handleOpenHint);
  }, []);

  if (!node) {
    return <RepoOverview />;
  }
  if (node.trace_steps.length === 0) {
    return <p className="p-4 text-sm text-[var(--muted)]">Bài này chưa có code để hiển thị.</p>;
  }

  const step = findStep(node, storeStep) ?? node.trace_steps[0];
  const stateKey = `${node.id}:${step.step_number}`;
  const showDto = dtoKey === stateKey;
  const activeTabKey = showDto
    ? "dto"
    : (tabs.find((t) => t.kind === "FILE" && t.steps.includes(step.step_number))?.key ?? null);

  const openTab = (key: string) => {
    const tab = tabs.find((t) => t.key === key);
    if (!tab) return;
    if (tab.kind === "DTO") {
      setDtoKey(stateKey);
      return;
    }
    if (tab.first_step === null) return;
    setDtoKey(null);
    setActiveStep(tab.first_step);
    if (activeTab === "XRAY") setXrayStage("TOUR");
  };

  const beforeLines = showDto ? 0 : step.line_start - 1;

  // Link file thật trên GitHub, ghim đúng commit của phiên (zip không có GitHub ⇒ null).
  const snap = result?.snapshot;
  const githubUrl = (anchor: string): string | null =>
    !showDto && snap?.source === "GITHUB" && snap.snapshot_id_kind === "COMMIT_SHA"
      ? `https://github.com/${snap.repo_key}/blob/${snap.snapshot_id}/${step.file_path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}${anchor}`
      : null;
  const beforeUrl = githubUrl(`#L1-L${beforeLines}`);
  const afterUrl = githubUrl(`#L${step.line_end + 1}`);
  const fontSize = BASE_FONT_SIZE;

  return (
    <div className="mid-frame sf-code flex h-full min-h-0 flex-col bg-[var(--code-bg)] text-[var(--code-text)]">
      {/* Thanh File Tabs (.ftabs) */}
      <div className="ftabs flex flex-none items-stretch bg-[var(--panel2)] overflow-x-auto">
        <div role="tablist" aria-label="Các file trong bài" className="flex min-w-0 flex-1 overflow-x-auto">
          {tabs.map((t) => {
            const selected = t.key === activeTabKey;
            const disabled = t.kind === "FILE" && t.first_step === null;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-disabled={disabled || undefined}
                title={t.kind === "FILE" ? t.path : t.name}
                onClick={() => openTab(t.key)}
                className={`ftab ${MONO} inline-flex flex-none items-center gap-2 whitespace-nowrap px-4 py-2.5 text-[12.5px] transition-all ${
                  selected
                    ? "bg-[var(--code-bg)] text-[var(--accent)] font-semibold shadow-sm"
                    : "bg-transparent text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel3)]"
                } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <span>{t.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dòng File Path (.fpath) */}
      <div
        className={`fpath ${MONO} flex flex-none items-center gap-2 bg-[var(--code-bg)] px-4 py-1.5 text-[11.5px] text-[var(--muted)]`}
      >
        <span className="text-[10px] font-bold text-[var(--faint)] tracking-wider uppercase">FILE:</span>
        <span className="text-[var(--text)]">{showDto ? "Kiểu dữ liệu mà các bước dùng" : step.file_path}</span>
        {!showDto && step.origin_note ? <span className="text-[var(--faint)]">· {step.origin_note}</span> : null}
      </div>

      {beforeLines > 0 ? (
        <p className={`${MONO} flex-none bg-[var(--code-bg)] py-0.5 pl-14 text-xs italic text-[var(--gutter)]`}>
          {beforeUrl ? (
            <a
              href={beforeUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Mở đoạn này trên GitHub (đúng commit của phiên)"
              className="inline-flex items-center gap-1 underline-offset-2 transition-colors hover:text-[var(--accent)] hover:underline"
            >
              ⋯ dòng 1–{beforeLines} không thuộc bài học
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          ) : (
            <>⋯ dòng 1–{beforeLines} không thuộc bài học</>
          )}
        </p>
      ) : null}

      <div
        id="codeScroll"
        className="code-scroll min-h-0 flex-1 relative overflow-auto bg-[var(--code-bg)]"
        role="region"
        aria-label={`Code của ${step.file_path.split("/").pop()}`}
      >
        <MonacoPane
          node={node}
          analysis={analysis}
          activeStep={step.step_number}
          hl={hl}
          showDto={showDto}
          fontSize={fontSize}
          onSelect={setSelection}
          tourTint={xrayStage === "TOUR"}
        />
      </div>

      {!showDto ? (
        <p className={`${MONO} flex-none bg-[var(--code-bg)] py-0.5 pl-14 text-xs italic text-[var(--gutter)]`}>
          {afterUrl ? (
            <a
              href={afterUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Mở phần còn lại trên GitHub (đúng commit của phiên)"
              className="inline-flex items-center gap-1 underline-offset-2 transition-colors hover:text-[var(--accent)] hover:underline"
            >
              ⋯ phần còn lại của file
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          ) : (
            <>⋯ phần còn lại của file</>
          )}
        </p>
      ) : null}

      {/* Portal vào document.body: không nằm trong khung có transform/filter */}
      {selection && selection.step_number === step.step_number ? (
        <SelectionPopover
          key={`${node.id}:${explanationKey(node.id, selection.step_number, selection.range)}`}
          node={node}
          selection={selection}
          onClose={closeSelection}
        />
      ) : null}
    </div>
  );
}
