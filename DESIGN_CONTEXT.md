# DESIGN_CONTEXT.md — Cẩm Nang Quy Tắc Thiết Kế Giao Diện SimpliFey
> **Bản vẽ quy chiếu chính thức:** `docs/prototype.html`  
> **Đặc tả nghiệp vụ:** `docs/spec/30_UI.md` (D-81)  
> **Trọng tâm phong cách:** Cockpit IDE Standards + TasteSkill 2.5 (Anti-Slop Frontend)

---

## 1. Triết Lý Thiết Kế & Nguyên Tắc "Anti-Slop"

Giao diện học tập của SimpliFey được xây dựng theo tiêu chuẩn **Cockpit IDE** kết hợp triết lý **TasteSkill 2.5 (Anti-Slop Frontend)** — loại bỏ hoàn toàn các lỗi thẩm mỹ generic thường thấy của AI (viền kẻ 1px xám bừa bãi, gradient lòe loẹt, thẻ card vô hồn, nút bấm phẳng đơ thiếu phản hồi xúc giác).

### 4 Trụ cột thẩm mỹ cốt lõi:
1. **Phân tầng bằng Elevation Layering thay vì Border:**
   - **Tuyệt đối không lạm dụng đường viền kẻ (zero hard borders).** Các thành phần giao diện không được bao quanh bởi các đường viền 1px vô tội vạ.
   - Thay vào đó, phân tách các khu vực bằng **4 tầng nền sắc độ (Background Elevation)**:
     - Tầng 0 (Background): Nền sâu nhất của cửa sổ (`--bg`).
     - Tầng 1 (Panel): Nền cột và khung chính (`--panel`).
     - Tầng 2 (Panel2): Nền thẻ, nút phụ, tab bar, header chip, input (`--panel2`).
     - Tầng 3 (Panel3): Nền hover state, scrollbar, progress track (`--panel3`).
     - Vùng soạn thảo mã (`--code-bg`): Luôn tối hơn nền panel để tạo chiều sâu thị giác (visual depth / inset effect).
2. **Hệ màu chức năng sắc nét (Intentional Accent & Semantic Palette):**
   - Màu chủ đạo duy nhất (Single Accent): **Cyan Sky** (`#38bdf8` ở Dark mode, `#0284c7` ở Light mode) tạo cảm giác công nghệ cao, chính xác và dễ chịu cho mắt khi lập trình lâu.
   - Màu gamification & hướng dẫn: **Duolingo Green** (`#22c55e` / `#16a34a`) cho các nút hành động 3D dập nổi và luồng hướng dẫn tour.
   - Màu chỉ báo trạng thái rõ ràng (Ready: Vàng cam, Done: Xanh lá, Fail: Đỏ san hô, Locked: Xám đá).
3. **Cảm giác vật lý & Phản hồi xúc giác (Spring Physics & Haptic Micro-interactions):**
   - Mọi nút bấm và thẻ tương tác đều tuân thủ nguyên tắc:
     - **Hover Lift 2px:** `transform: translateY(-2px)` kèm độ sáng nhẹ.
     - **Active Press:** `transform: translateY(1px) scale(0.98)` tức thì khi nhấn chuột.
     - **Duo 3D Button:** Hiệu ứng nút 3D dập nổi với gờ đáy (`box-shadow: 0 4px 0 var(--duo-green-dark)`), khi ấn sẽ thụt xuống chân gờ (`translateY(3px)`).
   - Easing tự nhiên: Dùng Spring curve `cubic-bezier(0.16, 1, 0.3, 1)` cho mọi popover, modal và tab chuyển đổi.
4. **Mật độ thông tin cao & Bố cục buồng lái (Cockpit 3-Column):**
   - Vừa vặn 100% chiều cao màn hình desktop (`100vh`, `overflow: hidden`), không để xảy ra hiện tượng thanh cuộn kép (double scrollbar) ở cấp độ trang.
   - Từng cột cuộn độc lập, điều chỉnh linh hoạt tỷ lệ lưới `24fr` - `45fr` - `31fr`.

---

## 2. Hệ Thống Design Tokens (CSS Variables)

Toàn bộ các biến CSS chuẩn hóa từ `docs/prototype.html`. Đảm bảo hỗ trợ trọn vẹn cả **Dark Mode** (chủ đạo) và **Light Mode**.

### 2.1. Dark Mode (`html[data-theme="dark"]` - Mặc định)
```css
html[data-theme="dark"] {
  /* Nền và Panel phân tầng */
  --bg: #090d16;
  --panel: #0f172a;
  --panel2: #141f33;
  --panel3: #1a273f;
  --border: transparent;
  --border-strong: transparent;
  --border-focus: transparent;

  /* Màu chữ */
  --text: #f8fafc;
  --muted: #94a3b8;
  --faint: #64748b;

  /* Màu nhấn chủ đạo (Primary Accent) */
  --accent: #38bdf8;
  --accent-hover: #7dd3fc;
  --accent-glow: rgba(56, 189, 248, 0.22);
  --on-accent: #041424;

  /* Màu Duolingo Tour & Hướng dẫn */
  --duo-green: #22c55e;
  --duo-green-dark: #15803d;
  --duo-green-bg: rgba(34, 197, 94, 0.15);

  /* Trạng thái bài học & tiến độ */
  --ready: #fbbf24;
  --ready-bg: rgba(251, 191, 36, 0.12);
  --done: #34d399;
  --done-bg: rgba(52, 211, 153, 0.14);
  --fail: #f87171;
  --fail-bg: rgba(248, 113, 113, 0.14);
  --locked: #64748b;
  --locked-bg: rgba(100, 116, 139, 0.12);

  /* Khung hiển thị Code Studio */
  --code-bg: #060911;
  --code-text: #e2e8f0;
  --kw: #f472b6;       /* Keywords: async, await, const, let, return... */
  --str: #38bdf8;      /* Strings: '...', "...", `...` */
  --fn: #a78bfa;       /* Function calls */
  --gutter: #475569;   /* Số thứ tự dòng code */

  /* Highlight dòng code theo ngữ cảnh */
  --hl-step: rgba(56, 189, 248, 0.14);   /* Dòng thuộc bước đang xem */
  --hl-focus: rgba(251, 191, 36, 0.16);  /* Dòng trọng tâm cần chú ý */
  --hl-good: rgba(52, 211, 153, 0.16);   /* Dòng kiến trúc mẫu mực */
  --hl-bad: rgba(248, 113, 113, 0.18);   /* Dòng điểm dở / anti-pattern */

  /* Đổ bóng & Lớp phủ */
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.35);
  --shadow: 0 12px 30px -4px rgba(0, 0, 0, 0.65), 0 4px 12px rgba(0, 0, 0, 0.5);
  --shadow-hover: 0 8px 22px rgba(0, 0, 0, 0.45);
  --overlay: rgba(4, 7, 13, 0.78);
  --backdrop: blur(10px);
}
```

### 2.2. Light Mode (`html[data-theme="light"]`)
```css
html[data-theme="light"] {
  /* Nền và Panel phân tầng */
  --bg: #f8fafc;
  --panel: #ffffff;
  --panel2: #f1f5f9;
  --panel3: #e2e8f0;
  --border: transparent;
  --border-strong: transparent;
  --border-focus: transparent;

  /* Màu chữ */
  --text: #0f172a;
  --muted: #475569;
  --faint: #94a3b8;

  /* Màu nhấn chủ đạo */
  --accent: #0284c7;
  --accent-hover: #0369a1;
  --accent-glow: rgba(2, 132, 199, 0.18);
  --on-accent: #ffffff;

  /* Màu Duolingo Tour & Hướng dẫn */
  --duo-green: #16a34a;
  --duo-green-dark: #15803d;
  --duo-green-bg: rgba(22, 163, 74, 0.12);

  /* Trạng thái */
  --ready: #d97706;
  --ready-bg: rgba(217, 119, 6, 0.1);
  --done: #059669;
  --done-bg: rgba(5, 150, 105, 0.1);
  --fail: #dc2626;
  --fail-bg: rgba(220, 38, 38, 0.1);
  --locked: #94a3b8;
  --locked-bg: rgba(148, 163, 184, 0.1);

  /* Khung hiển thị Code Studio */
  --code-bg: #f8fafc;
  --code-text: #1e293b;
  --kw: #db2777;
  --str: #0284c7;
  --fn: #7c3aed;
  --gutter: #94a3b8;

  /* Highlight dòng code */
  --hl-step: rgba(2, 132, 199, 0.1);
  --hl-focus: rgba(217, 119, 6, 0.12);
  --hl-good: rgba(5, 150, 105, 0.12);
  --hl-bad: rgba(220, 38, 38, 0.1);

  /* Đổ bóng & Lớp phủ */
  --shadow-sm: 0 2px 6px rgba(15, 23, 42, 0.05);
  --shadow: 0 14px 34px -4px rgba(15, 23, 42, 0.12), 0 4px 12px rgba(15, 23, 42, 0.06);
  --shadow-hover: 0 8px 20px rgba(15, 23, 42, 0.1);
  --overlay: rgba(15, 23, 42, 0.45);
  --backdrop: blur(10px);
}
```

### 2.3. Animation & Timing Tokens
```css
:root {
  --font-sans: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', Consolas, "Cascadia Code", monospace;
  --ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-snap: cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## 3. Typography & Hệ Thống Phông Chữ

| Thành phần | Font Family | Size / Line-height | Weight & Tracking | Màu áp dụng |
| :--- | :--- | :--- | :--- | :--- |
| **Body mặc định** | `var(--font-sans)` | `14px / 1.6` | `400`, `tracking: -0.011em` | `var(--text)` |
| **Tiêu đề cột (`pane-title`)** | `var(--font-sans)` | `12px` | `700`, `uppercase`, `tracking: .06em` | `var(--muted)` |
| **Tên lát cắt bài học** | `var(--font-sans)` | `14px` | `600`, `tracking: -0.01em` | `var(--text)` |
| **Mã route / endpoint** | `var(--font-mono)` | `11.5px` | `400` | `var(--muted)` |
| **Code Editor dòng lệnh** | `var(--font-mono)` | `13px / 1.8` | `400` (Keyword `500`) | `var(--code-text)` |
| **Số dòng (Gutter)** | `var(--font-mono)` | `13px / 1.8` | `400`, `user-select: none` | `var(--gutter)` |
| **Inline code tag (`code`)** | `var(--font-mono)` | `0.88em` | `500` | `var(--accent)` trên `var(--panel2)` |
| **Câu hỏi Feynman** | `var(--font-sans)` | `15px / 1.6` | `600` | `var(--text)` |
| **Tour Step Title** | `var(--font-sans)` | `17px / 1.3` | `800`, `tracking: -0.01em` | `var(--duo-green)` |

---

## 4. Micro-Interactions & Spring Physics

### 4.1. Quy tắc Nút & Thẻ Tương Tác
```css
/* Tối ưu hiệu năng render khi tương tác */
.btn, .tbtn, .chip, .qchip, .slice, .sum-item, .ftab, .rtab, .seg button {
  will-change: transform;
}

/* Hiệu ứng nhấc (Hover lift) */
.btn:hover:not(:disabled),
.tbtn:hover:not(:disabled),
.slice:hover:not([aria-disabled="true"]),
.sum-item:hover,
.qchip:hover:not(:disabled) {
  transform: translateY(-2px);
}

/* Hiệu ứng nhấn (Active press) */
.btn:active:not(:disabled),
.tbtn:active:not(:disabled),
.chip:active:not(:disabled),
.qchip:active:not(:disabled),
.slice:active:not([aria-disabled="true"]),
.sum-item:active {
  transform: translateY(1px) scale(0.98) !important;
}

/* Focus visible chuẩn mực cho bàn phím */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 6px;
}
```

### 4.2. Nút 3D Duolingo (`.duo-btn-primary`)
Nút bấm mang đặc trưng Duolingo với gờ nổi 3D, mang lại cảm giác bấm thỏa mãn:
```css
.duo-btn-primary {
  background: var(--duo-green);
  color: #052e16;
  font-size: 13.5px;
  font-weight: 800;
  padding: 9px 18px;
  border-radius: 999px;
  box-shadow: 0 4px 0 var(--duo-green-dark);
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
}
.duo-btn-primary:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
  box-shadow: 0 5px 0 var(--duo-green-dark);
}
.duo-btn-primary:active {
  transform: translateY(3px) !important;
  box-shadow: 0 1px 0 var(--duo-green-dark) !important;
}
```

### 4.3. Các Keyframe Animations Đặc Trưng
- `duoBounce`: Nảy nhẹ khi popup tour mở ra (`scale(0.92)` -> `scale(1.02)` -> `scale(1)`).
- `duoShake`: Rung lắc 0.35s khi người dùng bấm ra vùng tối để nhắc nhở tiếp tục tour.
- `duoBounceArrow`: Mũi tên nhấp nhô chỉ vào nút "Tiếp theo" (`translateX(0)` -> `translateX(6px)`).
- `codeFloatBtnIn`: Nút giải thích nhỏ trồi lên khi bôi đen code (`translateY(4px) scale(0.9)` -> `translateY(0)`).
- `fadeUp`: Trượt nhẹ lên và mờ dần (`translateY(8px)` -> `0`).
- `pop`: Nhịp thở phóng đại khi mở khóa bài học (`scale(1)` -> `scale(1.03) box-shadow: 0 0 0 4px var(--done-bg)` -> `scale(1)`).
- `prefers-reduced-motion`: Khi người dùng bật cài đặt giảm chuyển động, vô hiệu hóa toàn bộ animation và transform.

---

## 5. Bố Cục Không Gian Buồng Lái (Cockpit 3-Column Layout)

### 5.1. Header Cockpit (`.top`)
- Chiều cao compact: `padding: 8px 16px`, nền `var(--panel)`, `gap: 10px`.
- **Brand Logo:** Khối vuông bo tròn 6px (`22x22px`), gradient `linear-gradient(135deg, var(--accent), #6366f1)` với ký tự trắng "S".
- **Repo Crumb:** Khối monospace bo góc 8px (`12.5px font-mono`), nền `var(--panel2)`, chữ trắng in đậm tên repo (`shop-api`).
- **Metric Chip:** Chấm xanh nhịp sống `live-dot` (`background: var(--done); box-shadow: 0 0 6px var(--done)`).
- **Tool Buttons (`.tbtn`):** Bo góc 8px, padding `6px 12px`, nền `var(--panel2)`, hover lên `var(--panel3)` kèm `translateY(-2px)`.

### 5.2. Lưới 3 Cột Desktop (`@media (min-width: 1024px)`)
```css
body {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.main {
  flex: 1;
  min-height: 0;
  display: grid;
  padding: 12px;
  gap: 12px;
  grid-template-rows: minmax(0, 1fr);
  /* Tỷ lệ 3 cột linh hoạt: */
  grid-template-columns: minmax(0, 24fr) minmax(0, 45fr) minmax(0, 31fr);
}
.col {
  background: var(--panel);
  border-radius: 12px;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  box-shadow: var(--shadow-sm);
}
.col-mid {
  overflow: hidden; /* Cột code không cuộn cả panel mà cuộn trong code-scroll */
}
```

### 5.3. Trạng Thái Thu Gọn (Collapse State)
- Nút Toggle cột trái (`#btnLeft`) và cột phải (`#btnRight`) trên header cho phép người dùng mở rộng không gian đọc mã:
  - Khi ẩn cột trái: `grid-template-columns: minmax(0, 69fr) minmax(0, 31fr);`
  - Khi ẩn cột phải: `grid-template-columns: minmax(0, 24fr) minmax(0, 76fr);`
  - Khi ẩn cả 2: `grid-template-columns: minmax(0, 1fr);`

### 5.4. Responsive Mobile / Tablet (`@media (max-width: 1023.98px)`)
- Chuyển `main` thành Flexbox hướng cột (`flex-direction: column`).
- Cột giữa (`col-mid`) trở thành **Sticky Header**: `position: sticky; top: 0; z-index: 10; height: min(440px, 54vh)`.
- Ẩn text thương hiệu và metric chip để giữ thanh top gọn gàng.

---

## 6. Chi Tiết Từng Module Giao Diện

### 6.1. Cột Trái: Bản Đồ Bài Học (Lesson Map)
- **Nhóm bài học (`.grp`):**
  - Header (`.grp-h`): Nền `var(--panel2)`, hover `var(--panel3)`, mũi tên tam giác `chev` xoay 90 độ mượt mà khi mở rộng.
  - Badge gợi ý (`.badge`): Bo tròn capsule (`999px`), nền `var(--ready-bg)`, chữ vàng `var(--ready)`.
- **Thẻ lát cắt (`.slice`):**
  - Mặc định: Nền `var(--panel)`, padding `10px 12px`, bo góc 10px. Hover chuyển sang `var(--panel2)` và lift 2px.
  - **Trạng thái đang chọn (`.slice.sel`):** Nền `var(--panel2)`, vạch dọc chỉ báo bên trái màu accent (`::before { width: 3px; background: var(--accent); }`).
  - **Chỉ báo trạng thái (`.s-st`):**
    - Sẵn sàng: Chấm tròn vàng cam nhấp nháy quang sai (`box-shadow: 0 0 6px currentColor`).
    - Đã xong: Chấm tròn xanh lục.
    - Chưa đạt: Chấm tròn đỏ san hô.
    - Khóa: Icon ổ khóa SVG xám đá kèm danh sách bài tiên quyết cần học.
  - **Nhãn phụ:** Tag `AI đặt tên` capsule bo tròn, nhãn `(Trọng tâm)` màu vàng cam.

### 6.2. Cột Giữa: Code Studio
- **File Tabs (`.ftabs`):**
  - Thanh tab nền `var(--panel2)`. Tab đang chọn có nền trùng màu code editor (`var(--code-bg)`), chữ màu `--accent` in đậm.
  - Chấm đỏ cảnh báo điểm dở (`.weak-dot`): Nhấp nháy màu đỏ san hô trên tab có vấn đề kiến trúc do AI phát hiện.
- **File Path Badge (`.fpath`):** Nền `var(--code-bg)`, font mono `11.5px`, tiền tố `FILE:` in hoa màu `--faint`.
- **Khung cuộn mã (`.code-scroll`):**
  - Nền siêu sâu `var(--code-bg)` (`#060911`), padding `12px 0`.
  - Dòng code (`.ln`): Line-height `1.8`, font JetBrains Mono `13px`, hover sáng nhẹ `rgba(255, 255, 255, 0.03)`.
  - Số dòng (`.no`): Chiều rộng cố định 52px, căn phải, màu xám `--gutter`.
- **Màu Bôi Đen Tùy Biến (Custom Selection Color):**
  - Toàn bộ vùng code khi bôi đen có màu nền Cyan rực rỡ và chữ đen tuyền:
    ```css
    .col-mid *::selection, #mid *::selection {
      background: #38bdf8 !important;
      color: #041424 !important;
    }
    ```
- **Dòng Đánh Dấu Sáng Đèn (Line Highlights):**
  - `.hl-step`: Nền xanh lơ nhạt `rgba(56, 189, 248, 0.14)` theo bước luồng thực thi.
  - `.hl-focus`: Nền vàng `rgba(251, 191, 36, 0.16)` chỉ điểm trọng tâm.
  - `.hl-good`: Nền xanh lá `rgba(52, 211, 153, 0.16)` khen ngợi kiến trúc sạch.
  - `.hl-bad`: Nền đỏ `rgba(248, 113, 113, 0.18)` đánh dấu anti-pattern.
  - **Tự động cuộn mượt:** Khung code tự động cuộn đến dòng highlight với vị trí cách mép trên 1/3 khung nhìn (`sc.scrollTo({top: target, behavior: 'smooth'})`).

### 6.3. Cột Phải: X-Ray & Feynman Arena
- **Thanh chuyển Tab (`.rtabs`):** Dính cố định trên cùng (`position: sticky; top: 0; z-index: 10`), nền `var(--panel)`. Chuyển đổi giữa 2 chế độ:
  1. **Luồng code (X-Ray):**
     - Giai đoạn Vai trò (`role`): Thẻ tóm tắt trách nhiệm nghiệp vụ và các entity dữ liệu Đọc/Ghi.
     - Giai đoạn Đi theo luồng (`tour`):
       - **Mini-diagram 3 tầng kiến trúc:** Hiển thị tuần tự `1. Route / Controller → 2. Service Logic → 3. Database Repo`. Nút đang xem phóng to `scale(1.04)` và phủ màu accent.
       - Thanh bước (`stephead`): Hiển thị `Bước X/Y` kèm chuỗi vạch chỉ báo (`.dots i.on`).
       - Thẻ khái niệm kỹ năng (`.chip`): Bấm vào mở Popover giải thích khái niệm kiến trúc.
     - Giai đoạn Tóm tắt bài học (`summary`):
       - Khối **Điểm hay**: Dải viền trái màu xanh lục (`box-shadow: inset 4px 0 0 var(--done)`).
       - Khối **Điểm dở**: Dải viền trái màu đỏ san hô (`box-shadow: inset 4px 0 0 var(--fail)`). Nút xem thêm tác hại mở rộng khối hậu quả tiềm ẩn.
  2. **Vũ đài phản biện (Feynman Arena):**
     - Bộ chuyển bậc người học (`.seg`): 3 nấc `Mới học`, `Đã làm`, `Kiến trúc sư`.
     - Tiến độ câu hỏi (`.qchips`): Các chip tròn đánh số Câu 1, Câu 2. Chỉ mở câu tiếp khi đã hoàn thành câu trước.
     - Lịch sử trả lời (`.att`): Đóng gói trong `<details>` có pill trạng thái `Đạt` / `Chưa đạt`.
     - Gợi ý phân tầng: Gợi ý khái niệm tư duy trước, nếu vẫn chưa đạt thì cung cấp gợi ý mã nguồn kèm nút "Mở Bước X trong tour".
     - Hộp soạn thảo (`textarea`): Bo góc 8px, nền `var(--code-bg)`, viền none. Hỗ trợ phím tắt `Ctrl+Enter` để nộp bài nhanh.
     - **Thanh đo mài mòn / Tăng trưởng kỹ năng (Skill Growth Delta Bar):**
       - Hiển thị phần trăm tăng trưởng trực quan (`50% → 71%`).
       - Dải màu xanh lục hoặc đỏ trượt động (`animation: grow .7s ease-out`).

---

## 7. Các Tính Năng Đột Phá Đã Được Kiểm Nghiệm

### 7.1. Trợ Lý Giải Thích Mã Khi Bôi Đen (Code Selection Popover — UI-34)
Tính năng thông minh cho phép người dùng bôi đen bất kỳ từ hoặc dòng code nào trong khung Code Studio:
1. **Nút Nổi Giải Thích Nhỏ (`#codeExplainBtn`):**
   - Nút capsule nhỏ (`height: 26px`, font `11.5px`) trồi lên ngay trên vị trí trỏ chuột với icon bóng đèn.
   - Nhấp vào nút sẽ mở cửa sổ phân tích chi tiết.
2. **Nhận Diện Lỗi Bôi Nửa Chữ (Partial Selection Guard):**
   - Nếu người dùng vô tình chỉ bôi đen một phần của từ (ví dụ bôi `list` trong `productService.listProducts` hoặc bôi `find` trong `findById`), hệ thống sẽ phát hiện ngay:
   - Hiển thị popover cảnh báo nhẹ kèm nút tiện ích: **"Chọn cả từ [Tên_Từ_Đầy_Đủ]"** để tự động mở rộng vùng bôi đen chuẩn xác!
3. **Cửa Sổ Giải Thích Kiến Trúc (`#codeExplainPop`):**
   - Tag phân loại tầng kiến trúc (Controller, Service, Repository, REST Endpoint, N+1 Query...).
   - Tiêu đề nghiệp vụ, đoạn mã được chọn, và lời giải thích ngắn gọn, dễ hiểu.
   - Nút hành động trực tiếp: **"Xem Bước X trong X-Ray →"** giúp nhảy ngay tới bước liên quan trong luồng học.

### 7.2. Hướng Dẫn Tương Tác Duolingo (Duolingo-style Guided Tour)
- **Tự động kích hoạt:** Khi người dùng vào trang lần đầu (hoặc bấm nút "Hướng dẫn" trên header).
- **Màn tối toàn cảnh (`#tourBackdrop`):** Phủ lớp overlay tối `rgba(4, 7, 13, 0.82)`.
- **Chiếu sáng tuần tự (Spotlight Focus):**
  - Cột mục tiêu được gắn class `.tour-focused`, nâng `z-index: 1005` và tỏa quầng sáng rực rỡ `box-shadow: 0 0 35px 5px var(--accent-glow)`.
  - Khóa toàn bộ click vào các nút không liên quan để người học tập trung hoàn toàn.
- **Bước 3 Tương Tác Thực Nghiệm:**
  - Tại bước 3 của Tour ("Tô chọn code để xem mô tả"), hệ thống mở khóa riêng vùng code (`tour-allow-select`).
  - Cung cấp nút tiện ích **"Tô thử mẫu productService.listProducts"** để người dùng bấm thử nghiệm ngay tính năng bôi đen giải thích.
- **Hộp thoại Duolingo (`#tourPopup`):**
  - Mũi tên tam giác 4 chiều chỉ chính xác vào cột đang được chiếu sáng.
  - Nút bỏ qua, nút quay lại, và nút Duolingo 3D Primary Button kèm mũi tên nhấp nhô `duo-bounce-arrow`.

### 7.3. Thẻ Khái Niệm Popover (Concept Card Dialog)
- Bấm vào bất kỳ Concept Chip nào trong X-Ray sẽ hiển thị Popover nổi:
  - **Là gì:** Khái niệm cốt lõi.
  - **Ví dụ đời thường:** Ẩn dụ thực tế (ví dụ: Lễ tân chỉ phòng, người phục vụ - đầu bếp - thủ kho, đi chợ 20 món...).
  - **Vì sao quan trọng:** Giá trị kiến trúc.
  - **Trong repo này:** Dẫn chứng cụ thể trong mã nguồn kèm nút **"Xem dòng"** đưa thẳng người học đến vị trí cài đặt.

---

## 8. Hướng Dẫn Tích Hợp Cho Agent (Action Plan Với Taste-Skill)

Khi nhận nhiệm vụ chuyển đổi frontend chính sang phong cách của `prototype.html`, Agent cần thực hiện tuần tự:

1. **Bước 1 — Cập nhật `src/app/globals.css`:**
   - Thay thế toàn bộ palette cũ (`#09080f`, viền kẻ `--line`) bằng bộ Design Tokens Dark/Light chuẩn trong Mục 2.
   - Đảm bảo biến `--border: transparent` và thiết lập màu bôi đen selection `#38bdf8` cho code editor.
   - Bổ sung các keyframe animation: `duoBounce`, `duoShake`, `duoBounceArrow`, `codeFloatBtnIn`, `pop`, `hlIn`.
2. **Bước 2 — Đồng bộ Layout Buồng Lái (`src/app/learn/` & `LearnShell.tsx`):**
   - Thiết lập cấu trúc 3 cột grid tỉ lệ `24fr` - `45fr` - `31fr` trên desktop, `height: 100vh`, `overflow: hidden`.
   - Kết nối trạng thái ẩn/hiện cột trái (`Ctrl+B`) và cột phải (`Ctrl+Alt+B`).
3. **Bước 3 — Chuẩn hóa Component Buttons & Micro-interactions:**
   - Tích hợp lớp `.btn` với hiệu ứng hover lift 2px và active scale 0.98.
   - Thêm component nút Duolingo 3D dập nổi cho các CTA quan trọng.
4. **Bước 4 — Nâng Cấp Code Viewer (`CodeSnippetViewer.tsx`):**
   - Thiết lập nền `--code-bg: #060911` sâu hơn nền panel.
   - Bổ sung bộ lắng nghe sự kiện bôi đen chuột (`mouseup`, `keyup`) để kích hoạt nút nổi giải thích mã (UI-34) và popup phân tích.
5. **Bước 5 — Cập Nhật X-Ray & Feynman Panel (`XRayPanel.tsx`, `FeynmanQuestionSection.tsx`):**
   - Tích hợp Mini-diagram 3 tầng kiến trúc.
   - Thêm thanh đo mài mòn / tăng trưởng kỹ năng Delta bar sinh động.
   - Đồng bộ Popover thẻ khái niệm có ví dụ đời thường.
6. **Bước 6 — Xây Dựng Duolingo Tour Modal (`TourStep.tsx` hoặc module Tour):**
   - Kích hoạt spotlight tối màn hình và chiếu sáng tuần tự 4 bước như nguyên mẫu.

---
*Tài liệu được trích xuất hoàn chỉnh và chính xác 100% từ `docs/prototype.html`.*
