"use client";

// Tab X-Ray (D-81): `ui.xray_stage` = ROLE ⇒ TOUR ⇒ SUMMARY. docs/spec/30_UI.md Mục 6.1.
// Không khóa người dùng: chưa có phân tích thì tour vẫn đi từ `trace_steps` (kèm shimmer), lỗi có "Thử lại phân tích".
// Đảm bảo min-w-0 và break-words để không bao giờ tràn khung.
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/common";
import { RoleCard } from "@/components/learn/RoleCard";
import { LessonSummary } from "@/components/learn/LessonSummary";
import { SkillChips } from "@/components/learn/SkillChips";
import { TourStep } from "@/components/learn/TourStep";
import { LoadingAnimation } from "@/components/ui/LoadingAnimation";
import { analysisOf, buildRoleCard, buildTourSteps, skillsAtStep } from "@/lib/role-card";
import { useWorkbenchStore } from "@/store/workbench";

const TYPING_TARGET = "input, textarea, select, [contenteditable='true'], [contenteditable='']";
const ARROW_OWNER = "[role='tab'], [role='radio'], [role='tablist'], [role='radiogroup'], [role='menu'], [role='listbox']";

function stepTour(direction: 1 | -1) {
  const s = useWorkbenchStore.getState();
  if (s.ui.hl.length > 0) s.setHl([]);
  if (direction > 0) s.tourNext();
  else s.tourPrev();
  requestAnimationFrame(() => document.getElementById("rp-title")?.focus({ preventScroll: true }));
}

function onArrowKey(e: KeyboardEvent) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  const s = useWorkbenchStore.getState();
  if (s.active_tab !== "XRAY" || !s.active_node_id || s.ui.overview_open) return;
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest(TYPING_TARGET) || target?.closest(ARROW_OWNER)) return;
  if (document.querySelector("[role='dialog'][aria-modal='true']")) return;
  e.preventDefault();
  stepTour(e.key === "ArrowRight" ? 1 : -1);
}

export function XRayPanel() {
  const result = useWorkbenchStore((s) => s.result);
  const activeNodeId = useWorkbenchStore((s) => s.active_node_id);
  const analyses = useWorkbenchStore((s) => s.analyses);
  const overview = useWorkbenchStore((s) => s.overview);
  const progress = useWorkbenchStore((s) => s.progress);
  const profile = useWorkbenchStore((s) => s.profile);
  const clockOffset = useWorkbenchStore((s) => s.server_clock_offset_ms);
  const activeStep = useWorkbenchStore((s) => s.active_step);
  const stage = useWorkbenchStore((s) => s.ui.xray_stage);
  const hl = useWorkbenchStore((s) => s.ui.hl);
  const returnQuestion = useWorkbenchStore((s) => s.ui.return_question);
  const fixture = useWorkbenchStore((s) => s.ui.fixture);
  const setHl = useWorkbenchStore((s) => s.setHl);
  const requestAnalysis = useWorkbenchStore((s) => s.requestAnalysis);

  const node = result?.nodes.find((n) => n.id === activeNodeId) ?? null;
  const slot = activeNodeId ? analyses[activeNodeId] : undefined;
  const analysis = analysisOf(slot);
  const step = activeStep ?? 1;

  useEffect(() => {
    if (activeNodeId) void requestAnalysis(activeNodeId);
  }, [activeNodeId, requestAnalysis]);

  useEffect(() => {
    if (hl.some((h) => h.step !== step)) setHl([]);
  }, [hl, step, setHl]);

  useEffect(() => {
    window.addEventListener("keydown", onArrowKey);
    return () => window.removeEventListener("keydown", onArrowKey);
  }, []);

  if (!node) return null;

  const waiting = !fixture && (slot === undefined || slot === "PENDING");
  const failed = slot === "FAILED";
  const retry = () => void requestAnalysis(node.id, true);
  const steps = buildTourSteps(node, slot);
  const current = steps.find((s) => s.step === step) ?? steps[0];

  const jumpToStep = (targetStep: number) => {
    const s = useWorkbenchStore.getState();
    if (s.ui.hl.length > 0) s.setHl([]);
    s.setActiveStep(targetStep);
    s.setXrayStage("TOUR");
    requestAnimationFrame(() => document.getElementById("rp-title")?.focus({ preventScroll: true }));
  };

  const notice = failed ? (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--fail-bg)] text-[var(--fail)] px-3 py-2 text-sm min-w-0 break-words"
    >
      <span className="min-w-0 break-words">Chưa phân tích được</span>
      <Button variant="small" onClick={retry}>
        Thử lại phân tích
      </Button>
    </div>
  ) : analysis?.skeleton_only ? (
    <p role="status" className="m-0 rounded-lg bg-[var(--panel2)] px-3 py-2 text-sm text-[var(--muted)] min-w-0 break-words">
      AI chưa giải thích được bài này — chỉ hiện khung do code dựng
    </p>
  ) : fixture && !analysis ? (
    <p role="status" className="m-0 text-xs text-[var(--muted)] min-w-0 break-words">
      Chưa có bản phân tích (chế độ fixture): tour dựng từ các bước của engine.
    </p>
  ) : null;

  const banner = returnQuestion ? (
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[10px] bg-[var(--ready-bg)] text-[var(--ready)] px-3 py-2 text-[13px] min-w-0 break-words">
      <span className="min-w-0 break-words">Bạn đang xem lại theo gợi ý.</span>
      <Button
        variant="small"
        onClick={() =>
          useWorkbenchStore.setState((s) => ({ active_tab: "FEYNMAN", ui: { ...s.ui, return_question: false } }))
        }
      >
        Quay lại câu hỏi
      </Button>
    </div>
  ) : null;

  let body: ReactNode;
  if (stage === "ROLE") {
    body = (
      <>
        <RoleCard
          view={buildRoleCard(node, result, slot, overview)}
          hasWarning={progress?.nodes[node.id]?.has_warning ?? false}
          rolePending={waiting}
        />
        <Button variant="primary" className="w-full py-2.5 text-[15px]" onClick={() => stepTour(1)}>
          Bắt đầu tour →
        </Button>
      </>
    );
  } else if (stage === "TOUR") {
    body = current ? (
      <TourStep
        step={current}
        pending={waiting}
        onPrev={() => stepTour(-1)}
        onNext={() => stepTour(1)}
        onJumpStep={jumpToStep}
        chips={
          <SkillChips skills={skillsAtStep(slot, current.step)} profile={profile} serverClockOffsetMs={clockOffset} />
        }
      />
    ) : (
      <div className="grid gap-3 min-w-0">
        <p className="m-0 text-sm text-[var(--muted)] break-words">Bài này chưa có bước nào để dẫn tour.</p>
        <Button onClick={() => stepTour(-1)}>← Thẻ vai trò</Button>
      </div>
    );
  } else if (analysis) {
    body = <LessonSummary node={node} analysis={slot} onBack={() => stepTour(-1)} />;
  } else {
    body = (
      <div className="grid gap-3 min-w-0">
        <h2 id="rp-title" tabIndex={-1} className="m-0 text-base font-bold outline-none text-[var(--text)] break-words">
          Tóm tắt bài
        </h2>
        {waiting ? (
          <div role="status" className="flex flex-col items-center justify-center p-6 min-w-0">
            <LoadingAnimation size={150} text="AI đang phân tích bài học…" subtext="Đang tổng hợp điểm hay và điểm dở" />
          </div>
        ) : (
          <p className="m-0 text-sm text-[var(--muted)] break-words">Cần bản phân tích để có tóm tắt.</p>
        )}
        <div className="flex justify-between">
          <Button onClick={() => stepTour(-1)}>← Về Bước {steps.length}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3.5 min-w-0 break-words overflow-hidden h-full">
      {banner}
      {notice}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        {body}
      </div>
    </div>
  );
}
