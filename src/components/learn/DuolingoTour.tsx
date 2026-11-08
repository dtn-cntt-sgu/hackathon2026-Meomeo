"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

export interface DuolingoTourProps {
  open: boolean;
  onClose: () => void;
  onEnsureColumnsOpen?: () => void;
}

interface TourStepDef {
  targetId: string;
  tag: string;
  title: string;
  text: string;
  btnNext: string;
  btnPrev?: string;
  prefer: "left" | "right";
  allowSelect?: boolean;
  /** Bước có animation minh họa: tô sáng 1 dòng code rồi bật ô giải thích (chỉ vẽ sóng, không có chữ). */
  demoSelect?: boolean;
}

/** Vị trí dòng code được chọn để minh họa (tọa độ màn hình). */
interface DemoRect {
  left: number;
  top: number;
  width: number;
  height: number;
  cardLeft: number;
  cardWidth: number;
}

const DEMO_CARD_WIDTH = 280;
const DEMO_WAVE_PERIOD = 40;

/** Đường lượn sóng dài hơn ô một chu kỳ để trượt ngang liền mạch. */
function wavePath(width: number, amp: number): string {
  const total = width + DEMO_WAVE_PERIOD * 2;
  let d = `M 0 ${amp}`;
  for (let x = 0; x < total; x += DEMO_WAVE_PERIOD) {
    d += ` q ${DEMO_WAVE_PERIOD / 4} ${-amp} ${DEMO_WAVE_PERIOD / 2} 0 t ${DEMO_WAVE_PERIOD / 2} 0`;
  }
  return d;
}

/** Tìm 1 dòng code đang hiện trong Monaco ở cột giữa, lấy khung chữ (bỏ khoảng trắng đầu dòng). */
function measureDemoLine(): DemoRect | null {
  const col = document.getElementById("colMid");
  if (!col) return null;
  const colRect = col.getBoundingClientRect();
  const lines = Array.from(col.querySelectorAll<HTMLElement>(".monaco-editor .view-line"))
    .map((el) => ({ el, r: el.getBoundingClientRect(), text: (el.textContent ?? "").replace(/ /g, " ").trim() }))
    .filter((x) => x.text.length > 3 && x.r.height > 0 && x.r.top >= colRect.top && x.r.bottom <= colRect.bottom)
    .sort((a, b) => a.r.top - b.r.top);
  if (lines.length === 0) return null;
  const pick = lines[Math.min(2, lines.length - 1)];

  // Dùng Range để lấy đúng bề rộng phần chữ, bỏ thụt đầu dòng.
  let left = pick.r.left;
  let width = pick.r.width;
  const walker = document.createTreeWalker(pick.el, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  const first = nodes.find((n) => /[^\s ]/.test(n.data));
  const last = nodes[nodes.length - 1];
  if (first && last) {
    const range = document.createRange();
    range.setStart(first, first.data.search(/[^\s ]/));
    range.setEnd(last, last.data.length);
    const rr = range.getBoundingClientRect();
    if (rr.width > 0) {
      left = rr.left;
      width = rr.width;
    }
  }
  width = Math.min(width, colRect.right - left - 12);

  const cardWidth = Math.min(DEMO_CARD_WIDTH, colRect.width - 32);
  const cardLeft = Math.max(colRect.left + 16, Math.min(left + 24, colRect.right - cardWidth - 16));
  return { left: left - 3, top: pick.r.top, width: width + 6, height: pick.r.height, cardLeft, cardWidth };
}

const DEMO_BTN_W = 96;
const DEMO_BTN_H = 26;

const DEMO_STYLES = `
.tour-demo { position: fixed; inset: 0; z-index: 1008; pointer-events: none; }
.tour-demo-hl {
  position: fixed; border-radius: 3px;
  background: rgba(56, 139, 253, 0.32);
  box-shadow: 0 0 0 1px rgba(56, 139, 253, 0.55), 0 0 14px rgba(56, 139, 253, 0.35);
  transform-origin: left center;
  animation: tourDemoHl 6.5s linear infinite;
}
.tour-demo-btn {
  position: fixed; display: flex; align-items: center; justify-content: center; gap: 5px;
  width: ${DEMO_BTN_W}px; height: ${DEMO_BTN_H}px; border-radius: 8px;
  font-size: 12px; font-weight: 700; color: #04130a;
  background: var(--done, #22c55e); box-shadow: 0 6px 16px rgba(34, 197, 94, 0.35);
  animation: tourDemoBtn 6.5s ease-out infinite;
}
.tour-demo-ripple {
  position: fixed; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.85);
  animation: tourDemoRipple 6.5s ease-out infinite;
}
.tour-demo-cursor {
  position: fixed; left: 0; top: 0; width: 18px; height: 22px;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.6));
  animation: tourDemoCursor 6.5s ease-in-out infinite;
}
.tour-demo-card {
  position: fixed; border-radius: 12px; padding: 14px 14px 12px;
  background: #111827; border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
  transform-origin: 24px -8px;
  animation: tourDemoCard 6.5s cubic-bezier(.2,.9,.3,1.2) infinite;
}
html[data-theme="light"] .tour-demo-card { background: #ffffff; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18); }
.tour-demo-card::before {
  content: ""; position: absolute; top: -7px; left: 18px; width: 12px; height: 12px;
  background: inherit; border-left: inherit; border-top: inherit; transform: rotate(45deg);
}
.tour-demo-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.tour-demo-dot { width: 10px; height: 10px; border-radius: 999px; background: var(--done, #22c55e); animation: tourDemoPulse 1.2s ease-in-out infinite; }
.tour-demo-bar { height: 8px; border-radius: 999px; background: rgba(148, 163, 184, 0.25); }
.tour-demo-wave { display: block; overflow: hidden; }
.tour-demo-wave path {
  fill: none; stroke-width: 2.4; stroke-linecap: round;
  stroke-dasharray: 1200; stroke-dashoffset: 1200;
  animation: tourDemoDraw 6.5s ease-out infinite;
}
.tour-demo-flow { animation: tourDemoFlow 1.3s linear infinite; }
/* Kịch bản 1 vòng: 0-8% con trỏ hiện ở đầu dòng; 8-26% kéo bôi đen; 30% nút hiện;
   32-44% con trỏ tới nút; 46-50% bấm; 52% ô giải thích bật ra; 56-78% vẽ sóng; 92-100% mờ dần. */
@keyframes tourDemoCursor {
  0% { opacity: 0; transform: translate(var(--sx), var(--sy)); }
  6%, 8% { opacity: 1; transform: translate(var(--sx), var(--sy)); }
  26%, 32% { opacity: 1; transform: translate(var(--ex), var(--ey)); }
  44% { opacity: 1; transform: translate(var(--bx), var(--by)) scale(1); }
  47% { opacity: 1; transform: translate(var(--bx), var(--by)) scale(0.82); }
  50%, 60% { opacity: 1; transform: translate(var(--bx), var(--by)) scale(1); }
  66%, 100% { opacity: 0; transform: translate(var(--bx), var(--by)) scale(1); }
}
@keyframes tourDemoHl {
  0%, 8% { opacity: 1; transform: scaleX(0); }
  26% { opacity: 1; transform: scaleX(1); }
  92% { opacity: 1; transform: scaleX(1); }
  100% { opacity: 0; transform: scaleX(1); }
}
@keyframes tourDemoBtn {
  0%, 28% { opacity: 0; transform: translateY(6px) scale(0.7); }
  32%, 45% { opacity: 1; transform: translateY(0) scale(1); }
  47% { opacity: 1; transform: translateY(0) scale(0.9); }
  50% { opacity: 1; transform: translateY(0) scale(1); }
  54%, 100% { opacity: 0; transform: translateY(0) scale(1); }
}
@keyframes tourDemoRipple {
  0%, 46% { opacity: 0; transform: scale(0.3); }
  48% { opacity: 1; transform: scale(0.5); }
  58%, 100% { opacity: 0; transform: scale(1.6); }
}
@keyframes tourDemoCard {
  0%, 50% { opacity: 0; transform: translateY(-10px) scale(0.55); }
  58% { opacity: 1; transform: translateY(0) scale(1); }
  92% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-4px) scale(0.96); }
}
@keyframes tourDemoDraw {
  0%, 56% { stroke-dashoffset: 1200; }
  80%, 100% { stroke-dashoffset: 0; }
}
@keyframes tourDemoFlow { from { transform: translateX(0); } to { transform: translateX(-${DEMO_WAVE_PERIOD}px); } }
@keyframes tourDemoPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .tour-demo-hl, .tour-demo-card, .tour-demo-wave path, .tour-demo-flow, .tour-demo-dot { animation: none; opacity: 1; transform: none; stroke-dashoffset: 0; }
  .tour-demo-btn, .tour-demo-ripple, .tour-demo-cursor { display: none; }
}
`;

const DEMO_WAVES = [
  { color: "var(--done, #22c55e)", amp: 5, delay: 0, widthRatio: 1 },
  { color: "rgba(56, 139, 253, 0.9)", amp: 4, delay: 0.25, widthRatio: 0.85 },
  { color: "rgba(148, 163, 184, 0.7)", amp: 3.5, delay: 0.5, widthRatio: 0.95 },
  { color: "rgba(148, 163, 184, 0.5)", amp: 3, delay: 0.75, widthRatio: 0.6 },
];

const TOUR_STEPS: TourStepDef[] = [
  {
    targetId: "colRight",
    tag: "BƯỚC 1 / 4 · BẮT ĐẦU TẠI ĐÂY",
    title: "LUỒNG XỬ LÝ & HỎI ĐÁP FEYNMAN",
    text: "Đây là trái tim của việc học! Tab Học luồng xử lý dẫn dắt bạn qua từng tầng kiến trúc của chức năng (Controller → Service → DB). Sau đó, tab Hỏi đáp Feynman giúp bạn củng cố bằng cách tự giải thích code.",
    btnNext: "Tiếp theo: Khung Code →",
    prefer: "left",
  },
  {
    targetId: "colMid",
    tag: "BƯỚC 2 / 4 · TRỰC QUAN MÃ NGUỒN",
    title: "KHUNG CODE & LIÊN KẾT LUỒNG",
    text: "Mã nguồn thực tế từ repo. Khi bạn bấm từng bước ở X-Ray bên phải, các dòng code liên quan sẽ tự động sáng đèn và cảnh báo điểm sáng hoặc điểm yếu kiến trúc tiềm ẩn.",
    btnNext: "Tiếp theo: Tô chọn code →",
    btnPrev: "← Quay lại",
    prefer: "right",
  },
  {
    targetId: "colMid",
    tag: "BƯỚC 3 / 4 · TƯƠNG TÁC MÃ NGUỒN",
    title: "TÔ CHỌN CODE ĐỂ XEM MÔ TẢ",
    text: "Khi bạn bôi đen một biến, hàm hoặc dòng lệnh, một nút \"Giải thích\" nhỏ sẽ xuất hiện. Bấm vào nút này để mở bảng phân tích vai trò kiến trúc của đoạn mã đó!",
    btnNext: "Tiếp theo: Bản đồ bài học →",
    btnPrev: "← Quay lại",
    prefer: "left",
    allowSelect: true,
    demoSelect: true,
  },
  {
    targetId: "colLeft",
    tag: "BƯỚC 4 / 4 · TIẾN ĐỘ & MỞ KHÓA",
    title: "BẢN ĐỒ BÀI HỌC KIẾN TRÚC",
    text: "Toàn bộ các lát cắt nghiệp vụ của hệ thống được gom nhóm theo thực thể. Hoàn thành từng bài để mở khóa các lát cắt phức tạp hơn tiếp theo!",
    btnNext: "BẮT ĐẦU HỌC NGAY",
    btnPrev: "← Quay lại",
    prefer: "right",
  },
];

export function DuolingoTour({ open, onClose, onEnsureColumnsOpen }: DuolingoTourProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [shake, setShake] = useState(false);
  const [selectedSampleText, setSelectedSampleText] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number; arrowClass: string }>({
    top: 100,
    left: 100,
    arrowClass: "arrow-left",
  });

  const [demoRect, setDemoRect] = useState<DemoRect | null>(null);

  const popupRef = useRef<HTMLDivElement>(null);
  // Giữ callback trong ref: cha tạo hàm mới mỗi lần render, nếu đưa vào deps thì tour bị reset về bước 1.
  const ensureColumnsRef = useRef(onEnsureColumnsOpen);
  ensureColumnsRef.current = onEnsureColumnsOpen;

  // Mở tour ⇒ đảm bảo 2 cột 2 bên được mở để spotlight thấy rõ
  useEffect(() => {
    if (open) {
      setStepIdx(0);
      setSelectedSampleText(null);
      ensureColumnsRef.current?.();
      document.body.classList.add("in-tour");
    } else {
      document.body.classList.remove("in-tour", "tour-allow-select");
      document.querySelectorAll(".col").forEach((col) => col.classList.remove("tour-focused"));
    }
    return () => {
      document.body.classList.remove("in-tour", "tour-allow-select");
      document.querySelectorAll(".col").forEach((col) => col.classList.remove("tour-focused"));
    };
  }, [open]);

  // Cập nhật bước tour và vị trí spotlight
  useEffect(() => {
    if (!open) return;
    const step = TOUR_STEPS[stepIdx];
    if (!step) return;

    if (step.allowSelect) {
      document.body.classList.add("tour-allow-select");
    } else {
      document.body.classList.remove("tour-allow-select");
    }

    // Xóa focused cũ, gắn lên cột mục tiêu
    document.querySelectorAll(".col").forEach((col) => col.classList.remove("tour-focused"));
    const target = document.getElementById(step.targetId);
    if (target) {
      target.classList.add("tour-focused");
    }

    // Tính toán vị trí popup
    const updatePosition = () => {
      const el = document.getElementById(step.targetId);
      if (!el) return;
      const targetRect = el.getBoundingClientRect();
      const popW = 350;
      const popH = popupRef.current?.offsetHeight || 260;
      const margin = 16;
      let top = 100;
      let left = 100;
      let arrow = "arrow-left";

      if (window.innerWidth >= 1024) {
        if (step.prefer === "left") {
          // Không đủ chỗ thì ép sát mép trái (có thể chồng lên cột trái đang bị làm mờ);
          // chỉ quay sang phải khi ô sẽ che quá nửa cột mục tiêu.
          left = Math.max(16, targetRect.left - popW - margin);
          top = targetRect.top + 40;
          if (left + popW - targetRect.left > popW / 2) {
            left = targetRect.right + margin;
            arrow = "arrow-left";
          } else {
            arrow = "arrow-right";
          }
        } else {
          left = targetRect.right + margin;
          top = targetRect.top + 40;
          if (left + popW > window.innerWidth - 16) {
            left = targetRect.left - popW - margin;
            arrow = "arrow-right";
          } else {
            arrow = "arrow-left";
          }
        }
      } else {
        left = Math.max(16, Math.min(window.innerWidth - popW - 16, targetRect.left + (targetRect.width - popW) / 2));
        top = targetRect.bottom + margin;
        if (top + popH > window.innerHeight - 16) {
          top = Math.max(16, targetRect.top - popH - margin);
          arrow = "arrow-bottom";
        } else {
          arrow = "arrow-top";
        }
      }

      setPopupPos({ top, left, arrowClass: arrow });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [open, stepIdx]);

  // Bước có demo: đo dòng code để vẽ animation tô sáng + ô giải thích
  useEffect(() => {
    const step = TOUR_STEPS[stepIdx];
    if (!open || !step?.demoSelect) {
      setDemoRect(null);
      return;
    }
    const update = () => setDemoRect(measureDemoLine());
    // Chờ spotlight và Monaco ổn định layout rồi mới đo; Monaco chưa vẽ dòng thì đo lại vài lần.
    let tries = 0;
    let timer = 0;
    const attempt = () => {
      const rect = measureDemoLine();
      setDemoRect(rect);
      if (!rect && ++tries < 15) timer = window.setTimeout(attempt, 250);
    };
    timer = window.setTimeout(attempt, 250);
    window.addEventListener("resize", update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", update);
    };
  }, [open, stepIdx]);

  // Lắng nghe sự kiện bôi đen code trong tour
  useEffect(() => {
    if (!open) return;
    const handleCustomSelect = (e: Event) => {
      const ce = e as CustomEvent<{ text: string }>;
      if (ce.detail?.text) {
        setSelectedSampleText(ce.detail.text);
      }
    };
    window.addEventListener("sf:code-selected", handleCustomSelect);
    return () => window.removeEventListener("sf:code-selected", handleCustomSelect);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const currentStep = TOUR_STEPS[stepIdx];

  // Nút "Giải thích" minh họa: nằm ngay trên cuối vùng bôi đen, giống nút thật.
  const demoBtn = demoRect
    ? (() => {
        const left = Math.max(demoRect.left, demoRect.left + demoRect.width - DEMO_BTN_W + 10);
        const top = demoRect.top - DEMO_BTN_H - 8;
        return { left, top, cx: left + DEMO_BTN_W * 0.62, cy: top + DEMO_BTN_H * 0.6 };
      })()
    : { left: 0, top: 0, cx: 0, cy: 0 };

  const handleBackdropClick = () => {
    setShake(true);
    setTimeout(() => setShake(false), 360);
  };

  const handleNext = () => {
    if (stepIdx < TOUR_STEPS.length - 1) {
      setStepIdx((i) => i + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (stepIdx > 0) {
      setStepIdx((i) => i - 1);
    }
  };

  const handleSampleSelect = () => {
    window.dispatchEvent(new CustomEvent("sf:tour-sample-select", { detail: { sample: "productService.listProducts" } }));
    setSelectedSampleText("productService.listProducts");
  };

  // Demo và popup đặt NGOÀI #tourOverlay: overlay có z-index 1000 tạo stacking context riêng,
  // con bên trong sẽ luôn nằm dưới cột đang focus (.tour-focused z-index 1005).
  return createPortal(
    <>
      <div id="tourOverlay">
        <div id="tourBackdrop" onClick={handleBackdropClick} title="Chọn Bỏ qua hoặc Tiếp tục" />
      </div>
      {currentStep.demoSelect && demoRect && !selectedSampleText ? (
        <div className="tour-demo" aria-hidden="true">
          <style>{DEMO_STYLES}</style>
          <div
            className="tour-demo-hl"
            style={{ left: demoRect.left, top: demoRect.top, width: demoRect.width, height: demoRect.height }}
          />
          <div
            className="tour-demo-btn"
            style={{ left: demoBtn.left, top: demoBtn.top, transformOrigin: "50% 100%" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
              <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />
            </svg>
            Giải thích
          </div>
          <div className="tour-demo-ripple" style={{ left: demoBtn.cx, top: demoBtn.cy }} />
          <svg
            className="tour-demo-cursor"
            viewBox="0 0 18 22"
            style={
              {
                "--sx": `${demoRect.left + 3}px`,
                "--sy": `${demoRect.top + demoRect.height * 0.35}px`,
                "--ex": `${demoRect.left + demoRect.width - 3}px`,
                "--ey": `${demoRect.top + demoRect.height * 0.35}px`,
                "--bx": `${demoBtn.cx}px`,
                "--by": `${demoBtn.cy}px`,
              } as CSSProperties
            }
            aria-hidden="true"
          >
            <path d="M1 1 L1 17 L5.2 13.2 L8.2 20 L11 18.8 L8.1 12.2 L13.8 12.2 Z" fill="#ffffff" stroke="#0b0f17" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
          <div
            className="tour-demo-card"
            style={{ left: demoRect.cardLeft, top: demoRect.top + demoRect.height + 12, width: demoRect.cardWidth }}
          >
            <div className="tour-demo-head">
              <span className="tour-demo-dot" />
              <span className="tour-demo-bar" style={{ width: "42%" }} />
            </div>
            {DEMO_WAVES.map((w, i) => {
              const inner = demoRect.cardWidth - 28;
              const width = Math.round(inner * w.widthRatio);
              return (
                <svg
                  key={i}
                  className="tour-demo-wave"
                  width={width}
                  height={w.amp * 2 + 6}
                  viewBox={`0 -3 ${width} ${w.amp * 2 + 6}`}
                  style={{ marginTop: i === 0 ? 0 : 8 }}
                >
                  <g className="tour-demo-flow" style={{ animationDelay: `${w.delay}s` }}>
                    <path d={wavePath(width, w.amp)} stroke={w.color} style={{ animationDelay: `${w.delay * 0.6}s` }} />
                  </g>
                </svg>
              );
            })}
          </div>
        </div>
      ) : null}
      <div
        ref={popupRef}
        id="tourPopup"
        role="dialog"
        aria-modal="true"
        aria-label="Hướng dẫn tính năng"
        style={{ top: `${popupPos.top}px`, left: `${popupPos.left}px` }}
        className={`duo-popup ${popupPos.arrowClass} ${shake ? "duo-shake" : ""}`}
      >
        <div className="duo-tag">{currentStep.tag}</div>
        <h3 className="duo-title">{currentStep.title}</h3>
        <p className="duo-body">{currentStep.text}</p>

        {currentStep.allowSelect ? (
          <div className="my-2.5">
            <button
              type="button"
              onClick={handleSampleSelect}
              className="duo-btn-sec w-full py-1.5 text-center text-xs font-semibold"
            >
              Tô thử mẫu &quot;productService.listProducts&quot;
            </button>
            <div className="mt-1.5 min-h-[18px] text-[11.5px]">
              {selectedSampleText ? (
                <span className="text-[var(--done)]">
                  Đã nhận diện: <b>{selectedSampleText.length > 25 ? `${selectedSampleText.slice(0, 25)}…` : selectedSampleText}</b>. Bảng mô tả chức năng đã hiện bên cạnh!
                </span>
              ) : (
                <span className="text-[var(--muted)]">
                  Chưa tô chọn đoạn mã. Hãy kéo chuột trên khung code để thử!
                </span>
              )}
            </div>
          </div>
        ) : null}

        <div className="duo-footer mt-4">
          {stepIdx > 0 ? (
            <button type="button" onClick={handlePrev} className="duo-btn-sec">
              {currentStep.btnPrev ?? "← Quay lại"}
            </button>
          ) : (
            <button type="button" onClick={onClose} className="duo-btn-skip">
              Bỏ qua
            </button>
          )}

          <div className="duo-next-group">
            <svg
              className="duo-bounce-arrow"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M3 10.5C3 9.67 3.67 9 4.5 9H13V5.41C13 4.52 14.08 4.08 14.71 4.71L21.29 11.29C21.68 11.68 21.68 12.32 21.29 12.71L14.71 19.29C14.08 19.92 13 19.48 13 18.59V15H4.5C3.67 15 3 14.33 3 13.5V10.5Z" />
            </svg>
            <button type="button" onClick={handleNext} className="duo-btn-primary">
              {currentStep.btnNext}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
