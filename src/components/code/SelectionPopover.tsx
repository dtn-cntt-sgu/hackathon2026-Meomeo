"use client";

// Nút "Giải thích" cạnh vùng bôi đen + popover kết quả — docs/spec/30_UI.md Mục 5 (UI-34), D-82.
// Thiết kế Cockpit IDE + TasteSkill 2.5 theo docs/prototype.html.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ExplainSelectionResponse, HybridArchitecturalNode } from "@/contracts";
import type { ErrorCode } from "@/contracts/errors";
import { CONCEPT_CARDS } from "@/components/how-it-works/concept-cards";
import type { CodeSelection } from "@/components/code/slice-model";
import { explainButtonState, explainErrorText, explanationKey, shortSelection } from "@/lib/selection-explain";
import { useWorkbenchStore } from "@/store/workbench";

export interface SelectionPopoverProps {
  node: HybridArchitecturalNode;
  selection: CodeSelection | null;
  onClose: () => void;
}

type Phase =
  | { kind: "IDLE" }
  | { kind: "LOADING" }
  | { kind: "DONE"; data: ExplainSelectionResponse }
  | { kind: "ERROR"; code: ErrorCode | undefined };

interface FastExplain {
  tag: string;
  title: string;
  desc: string;
  step?: number;
}

function explainCodeFast(rawText: string): FastExplain | null {
  const t = rawText.toLowerCase().replace(/[\s;]/g, "");
  if (t === "router.get" || t.includes("router.get('/products'") || t.includes("router.get")) {
    return {
      tag: "Tầng Controller · Entry Point",
      title: "Định tuyến HTTP GET /products",
      desc: "Điểm tiếp nhận yêu cầu từ client khi người dùng mở trang danh sách sản phẩm. Route mỏng, nhận request và giao việc xử lý cho productService.",
      step: 1,
    };
  }
  if (t === "'/products'" || t === '"/products"' || t === "/products") {
    return {
      tag: "REST Endpoint",
      title: "Đường dẫn tài nguyên /products",
      desc: "Định nghĩa URI endpoint cho tài nguyên danh sách sản phẩm theo quy ước RESTful API chuẩn mực.",
      step: 1,
    };
  }
  if (t.includes("listproducts") || t.includes("productservice")) {
    return {
      tag: "Tầng Service · Business Logic",
      title: "Hàm nghiệp vụ listProducts()",
      desc: "Nơi tập trung logic lấy toàn bộ sản phẩm và bổ sung loại hàng tương ứng cho từng sản phẩm trước khi trả về kết quả.",
      step: 2,
    };
  }
  if (t.includes("res.json")) {
    return {
      tag: "HTTP Response",
      title: "Trả dữ liệu JSON",
      desc: "Tuần tự hóa mảng đối tượng sản phẩm thành chuỗi JSON và trả về cho client với mã HTTP 200 OK.",
      step: 1,
    };
  }
  if (t.includes("findall") || t.includes("productrepo")) {
    return {
      tag: "Tầng Repository · Data Access",
      title: "Lấy tất cả sản phẩm (productRepo.findAll)",
      desc: "Thực thi 1 truy vấn database để đọc toàn bộ các bản ghi trong bảng products.",
      step: 2,
    };
  }
  if (t.includes("findbyid") || t.includes("categoryrepo")) {
    return {
      tag: "Điểm yếu kiến trúc · N+1 Query",
      title: "Hỏi database trong vòng lặp (findById)",
      desc: "Cảnh báo hiệu năng: Gọi categoryRepo.findById lặp lại bên trong vòng for. Nếu có 200 sản phẩm, code sẽ gửi 200 truy vấn DB liên tiếp, khiến trang chậm dần.",
      step: 2,
    };
  }
  if (t.includes("categoryid")) {
    return {
      tag: "Cơ sở dữ liệu · Khóa ngoại",
      title: "Khóa ngoại categoryId",
      desc: "Trường liên kết khóa ngoại (Foreign Key) tham chiếu tới bảng categories để xác định loại hàng của sản phẩm.",
    };
  }
  if (t === "async") {
    return {
      tag: "Cú pháp JavaScript/TypeScript",
      title: "Từ khóa hàm bất đồng bộ (async)",
      desc: "Khai báo một hàm bất đồng bộ, luôn trả về một Promise và cho phép dùng từ khóa await bên trong.",
    };
  }
  if (t === "await") {
    return {
      tag: "Cú pháp JavaScript/TypeScript",
      title: "Từ khóa chờ kết quả (await)",
      desc: "Tạm dừng hàm async cho đến khi Promise trả về kết quả, giúp code bất đồng bộ viết tuần tự như đồng bộ.",
    };
  }
  if (t === "const" || t === "let" || t === "var") {
    return {
      tag: "Cú pháp JavaScript/TypeScript",
      title: `Khai báo biến/hằng số (${rawText})`,
      desc: "Từ khóa khai báo định danh trong phạm vi khối (block-scoped). const không cho phép gán lại giá trị mới.",
    };
  }
  return null;
}

function checkPartial(text: string, surroundingSnippet?: string): { isPartial: boolean; fullWord: string } {
  const WORD_CHAR = /[a-zA-Z0-9_$]/;
  const t = text.trim();
  if (!t || !surroundingSnippet) return { isPartial: false, fullWord: t };

  const idx = surroundingSnippet.indexOf(t);
  if (idx >= 0) {
    let l = idx;
    while (l > 0 && WORD_CHAR.test(surroundingSnippet.charAt(l - 1))) {
      l--;
    }
    let r = idx + t.length;
    while (r < surroundingSnippet.length && WORD_CHAR.test(surroundingSnippet.charAt(r))) {
      r++;
    }
    const candidate = surroundingSnippet.slice(l, r).trim();
    if (candidate.length > t.length && WORD_CHAR.test(t)) {
      return { isPartial: true, fullWord: candidate };
    }
  }

  if (t.length <= 2 && WORD_CHAR.test(t)) {
    return { isPartial: true, fullWord: t };
  }

  return { isPartial: false, fullWord: t };
}

const BUTTON_W = 90;
const BUTTON_H = 26;
const PANEL_W = 360;
const PANEL_MAX_H = 380;
const MARGIN = 12;

function place(rect: DOMRect, w: number, h: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(MARGIN, Math.min(vw - w - MARGIN, rect.left + (rect.width - w) / 2));
  let top = rect.top - h - 6;
  if (top < 60) {
    top = rect.bottom + 6;
  }
  if (top + h > vh - MARGIN) {
    top = Math.max(MARGIN, vh - h - MARGIN);
  }
  return { left, top };
}

const limitReached = new Set<string>();

export function SelectionPopover({ node, selection, onClose }: SelectionPopoverProps) {
  const offline = useWorkbenchStore((s) => s.is_offline_mode);
  const sessionId = useWorkbenchStore((s) => s.session_id);
  const result = useWorkbenchStore((s) => s.result);
  const progress = useWorkbenchStore((s) => s.progress);
  const explainSelection = useWorkbenchStore((s) => s.explainSelection);
  const openNode = useWorkbenchStore((s) => s.openNode);
  const setActiveStep = useWorkbenchStore((s) => s.setActiveStep);
  const setXrayStage = useWorkbenchStore((s) => s.setXrayStage);

  const [currentText, setCurrentText] = useState(selection?.selected_text ?? "");
  const [opened, setOpened] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "IDLE" });
  const [, bumpLimit] = useState(0);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (selection) {
      setCurrentText(selection.selected_text);
    }
  }, [selection]);

  // Phát hiện lỗi bôi nửa chữ (partial word)
  const step = useMemo(() => {
    if (!selection) return null;
    return node.trace_steps.find((s) => s.step_number === selection.step_number) ?? null;
  }, [node, selection]);

  const partialInfo = useMemo(() => {
    return checkPartial(currentText, step?.snippet);
  }, [currentText, step]);

  const fastExplain = useMemo(() => {
    if (partialInfo.isPartial) return null;
    return explainCodeFast(currentText);
  }, [currentText, partialInfo]);

  const key = selection ? explanationKey(node.id, selection.step_number, selection.range) : null;
  const cached = useWorkbenchStore((s) => (key ? s.ui.explanations[key] : undefined));

  const buttonState = useMemo(() => explainButtonState(selection, offline), [selection, offline]);
  const outOfQuota = !!sessionId && limitReached.has(sessionId);

  const close = useCallback(() => {
    requestSeq.current += 1;
    const target = returnFocus.current;
    returnFocus.current = null;
    onClose();
    if (target && target.isConnected) target.focus({ preventScroll: true });
  }, [onClose]);

  // Phát sự kiện toàn cục thông báo đã chọn code cho Tour nếu đang mở
  useEffect(() => {
    if (selection && selection.selected_text.trim()) {
      window.dispatchEvent(
        new CustomEvent("sf:code-selected", { detail: { text: selection.selected_text } })
      );
    }
  }, [selection]);

  const run = useCallback(async () => {
    if (!selection) return;
    const seq = ++requestSeq.current;
    setPhase({ kind: "LOADING" });
    const res = await explainSelection(node.id, selection.step_number, selection.range, currentText);
    if (seq !== requestSeq.current) return;
    if (!res) {
      setPhase({ kind: "ERROR", code: "ERR_CLIENT_NETWORK" });
    } else if (res.ok) {
      setPhase({ kind: "DONE", data: res.data });
    } else {
      if (res.code === "ERR_EXPLAIN_LIMIT" && sessionId) {
        limitReached.add(sessionId);
        bumpLimit((n) => n + 1);
      }
      setPhase({ kind: "ERROR", code: res.code });
    }
  }, [explainSelection, node.id, selection, currentText, sessionId]);

  const onButtonClick = () => {
    if (buttonState.disabled || (outOfQuota && !cached)) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpened(true);
    if (cached) {
      setPhase({ kind: "DONE", data: cached });
    } else if (!fastExplain && !partialInfo.isPartial) {
      void run();
    }
  };

  const handleExpandWord = () => {
    setCurrentText(partialInfo.fullWord);
  };

  const handleGoStep = (stepNumber: number) => {
    useWorkbenchStore.setState({ active_tab: "XRAY", active_step: stepNumber });
    setXrayStage("TOUR");
    close();
  };

  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!opened) return;
      const t = e.target as Node | null;
      if (t && (panelRef.current?.contains(t) || buttonRef.current?.contains(t))) return;
      close();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [selection, opened, close]);

  useLayoutEffect(() => {
    if (opened) panelRef.current?.focus({ preventScroll: true });
  }, [opened]);

  if (typeof document === "undefined" || !selection || !buttonState.visible) return null;

  // ---- Nút nổi nhỏ "Giải thích" ----
  if (!opened) {
    const disabled = buttonState.disabled || (outOfQuota && !cached);
    const tooltip = buttonState.tooltip ?? (disabled ? explainErrorText("ERR_EXPLAIN_LIMIT") : "Giải thích đoạn đang chọn");
    const pos = place(selection.rect, BUTTON_W, BUTTON_H);

    return createPortal(
      <button
        ref={buttonRef}
        id="codeExplainBtn"
        type="button"
        title={tooltip}
        aria-disabled={disabled || undefined}
        onPointerDown={(e) => e.preventDefault()}
        onClick={onButtonClick}
        style={{ position: "fixed", left: `${pos.left}px`, top: `${pos.top}px` }}
        className="code-float-btn"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.87-3.13-7-7-7zm-2 18c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-1h-4v1z" />
        </svg>
        <span>Giải thích</span>
      </button>,
      document.body
    );
  }

  // ---- Cửa sổ Popover phân tích vai trò kiến trúc ----
  const pos = place(selection.rect, PANEL_W, PANEL_MAX_H);

  return createPortal(
    <div
      ref={panelRef}
      id="codeExplainPop"
      role="dialog"
      aria-label="Giải thích mã nguồn"
      tabIndex={-1}
      style={{ position: "fixed", left: `${pos.left}px`, top: `${pos.top}px` }}
      className="code-pop"
    >
      <div className="flex items-center justify-between gap-2 border-b border-transparent pb-2 mb-2">
        <span className={partialInfo.isPartial ? "code-pop-tag warn" : "code-pop-tag"}>
          {partialInfo.isPartial ? "Gợi ý chọn mã" : fastExplain?.tag ?? "AI Phân Tích Kiến Trúc"}
        </span>
        <button
          type="button"
          aria-label="Đóng"
          onClick={close}
          className="text-sm text-[var(--muted)] hover:text-[var(--text)] px-1.5 py-0.5 rounded"
        >
          ✕
        </button>
      </div>

      {partialInfo.isPartial ? (
        <div>
          <div className="code-pop-title">
            Bạn đang chọn một phần của từ <code>{partialInfo.fullWord}</code>
          </div>
          <div className="code-pop-snippet">{currentText} (chưa trọn vẹn)</div>
          <p className="code-pop-body">
            Để xem phân tích kiến trúc chính xác, hãy bôi trọn vẹn từ <b>{partialInfo.fullWord}</b> hoặc bôi cả một dòng/một hàm.
          </p>
          <div className="code-pop-action">
            <button
              type="button"
              onClick={handleExpandWord}
              className="btn small primary"
            >
              Chọn cả từ &quot;{partialInfo.fullWord}&quot;
            </button>
          </div>
        </div>
      ) : fastExplain ? (
        <div>
          <div className="code-pop-title">{fastExplain.title}</div>
          <div className="code-pop-snippet">
            {currentText.length > 80 ? `${currentText.slice(0, 80)}…` : currentText}
          </div>
          <p className="code-pop-body">{fastExplain.desc}</p>
          <div className="code-pop-action">
            {fastExplain.step !== undefined ? (
              <button
                type="button"
                onClick={() => handleGoStep(fastExplain.step!)}
                className="btn small primary"
              >
                Xem Bước {fastExplain.step} trong X-Ray →
              </button>
            ) : null}
            {!cached && phase.kind === "IDLE" ? (
              <button type="button" onClick={() => void run()} className="btn small">
                AI phân tích sâu
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="min-h-0 overflow-y-auto text-[13px] leading-relaxed">
          <p className="truncate font-mono text-[12.5px] font-semibold mb-2" title={currentText}>
            {shortSelection(currentText)}
          </p>

          {phase.kind === "LOADING" ? <p className="text-[var(--muted)]">Đang giải thích…</p> : null}

          {phase.kind === "ERROR" ? (
            <div className="space-y-2.5">
              <p role="alert" className="text-[var(--fail)]">{explainErrorText(phase.code)}</p>
              {phase.code !== "ERR_EXPLAIN_LIMIT" ? (
                <button type="button" onClick={() => void run()} className="btn small primary">
                  Thử lại
                </button>
              ) : null}
            </div>
          ) : null}

          {phase.kind === "DONE" && !phase.data.explanation ? (
            <p className="text-[var(--muted)]">Chưa giải thích được đoạn này.</p>
          ) : null}

          {phase.kind === "DONE" && phase.data.explanation ? (
            <ExplanationBody
              data={phase.data}
              nodeTitle={(id) => result?.nodes.find((n) => n.id === id)?.title ?? id}
              isLocked={(id) => progress?.nodes[id]?.status === "LOCKED"}
              onOpenReference={(nodeId, refStep) => {
                openNode(nodeId);
                setActiveStep(refStep);
                close();
              }}
            />
          ) : null}
        </div>
      )}
    </div>,
    document.body
  );
}

function ExplanationBody({
  data,
  nodeTitle,
  isLocked,
  onOpenReference,
}: {
  data: ExplainSelectionResponse;
  nodeTitle: (nodeId: string) => string;
  isLocked: (nodeId: string) => boolean;
  onOpenReference: (nodeId: string, step: number) => void;
}) {
  const e = data.explanation;
  if (!e) return null;
  const skill = e.skill ? CONCEPT_CARDS[e.skill] : null;
  return (
    <div className="space-y-2.5 text-[12.5px]">
      <section>
        <h4 className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Là gì</h4>
        <p className="text-[var(--text)]">{e.what}</p>
      </section>
      <section>
        <h4 className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Ở đây</h4>
        <p className="text-[var(--text)]">{e.here}</p>
      </section>
      {e.analogy.trim() !== "" ? (
        <section>
          <h4 className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Ví dụ đời thường</h4>
          <p className="text-[var(--muted)]">{e.analogy}</p>
        </section>
      ) : null}
      {skill ? (
        <p>
          <span
            title={skill.what}
            className="inline-block rounded-full bg-[var(--panel3)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent)]"
          >
            {skill.name_vi}
          </span>
        </p>
      ) : null}
      {data.references.length > 0 ? (
        <section>
          <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Còn dùng ở</h4>
          <div className="flex flex-wrap gap-1.5">
            {data.references.map((r) => {
              const locked = isLocked(r.node_id);
              return (
                <button
                  key={`${r.node_id}:${r.step_number}`}
                  type="button"
                  disabled={locked}
                  title={locked ? "Bài này chưa mở khóa" : undefined}
                  onClick={() => onOpenReference(r.node_id, r.step_number)}
                  className="rounded-lg bg-[var(--panel3)] px-2 py-0.5 text-left text-[11.5px] transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {r.name} · {nodeTitle(r.node_id)} · Bước {r.step_number}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
