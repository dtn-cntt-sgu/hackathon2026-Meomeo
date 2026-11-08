# 00 — Cầm tay chỉ việc: mỗi người làm gì, làm thế nào

> Đọc file này trước tiên. Mọi chi tiết đều nằm trong phiếu của từng người (`phieu/<ten>/<MÃ>.md`); file này chỉ chỉ cách dùng phiếu.
> Mốc cứng: **12:00** bắt đầu · **13:00** cả 5 có commit · **04:00** đóng băng · **09:00** ngừng push · **09:30** hạn nộp file thuyết trình.

## 1. Trước 12:00 (mỗi người tự làm, Thiện xem lại)

- [ ] `node -v` ra 22.x; `npm -v`, `git --version` chạy được. Thiện thêm `gcloud --version`.
- [ ] `git config user.name` và `git config user.email` đúng tài khoản GitHub **của chính mình** (email đã xác minh, nếu không commit không hiện tên).
- [ ] `gh auth login` bằng tài khoản của mình; `gh auth status` hiện đúng tên.
- [ ] Claude Code mở được trong 1 thư mục thử. **Quý dùng Codex CLI**: mở được và chạy được lệnh `git`, `gh` trong 1 thư mục thử.
- [ ] Key Google AI Studio của riêng mình gọi thử được 1 lần.
- [ ] Đã nhận lời mời Collaborator vào repo thi.
- [ ] **Clone repo thi vào 1 thư mục mới, trống.** Thư mục này không có file code nào khác. Không mở repo nào khác trong cửa sổ Claude dùng để thi.
- [ ] **Thiện:** đã clone nhánh `docs-thi` vào một thư mục riêng (không phải repo thi) để chép `docs/` ở TH-01. 4 người còn lại không cần: `docs/` có sẵn trên `main` sau khi pull.
- [ ] Đọc mục lục phiếu của mình (`02_PHIEU_<TEN>.md`) và phiếu đầu tiên. Đọc thẻ của mình ở Mục 6 file này.
- [ ] **Không ai commit, không ai tạo gì trên repo thi trước 12:00.**

## 2. 12:00–12:20: bắt đầu đúng thứ tự

| Lúc | Thiện | Minh, Nhân, Phát, Quý |
| :-- | :-- | :-- |
| 12:00 | Làm **TH-01**: phần làm tay ở đầu phiếu (tạo app Next.js, `.gitignore` **không** có `docs/`, chép `docs/` vào), rồi dán prompt. Claude đẩy 2 commit lên `main`: khung dự án, rồi `docs/`. Nhắn nhóm "đã push" | Chờ, không làm gì trên repo |
| 12:20 | Bắt đầu TH-02 | 1. `git pull` (có sẵn `docs/`, **không** tự chép) · 2. `npm ci` · 3. Chạy `git status`: phải sạch · 4. Bắt đầu phiếu đầu tiên |

## 3. Vòng lặp cho mỗi phiếu (lặp lại cả đêm)

> **Quý:** đọc mọi chữ "Claude" dưới đây là **Codex**. Prompt dán y hệt.

1. Mở file phiếu, ví dụ `docs/ke-hoach-thi/phieu/minh/MI-03.md`.
2. Chép **nguyên khối chữ trong khung** ở Mục 1 ("Prompt dán cho Claude"). Không sửa, không thêm yêu cầu.
3. Mở Claude **trong thư mục repo thi**, dán vào. Claude tự: tạo nhánh ⇒ đọc phiếu và spec ⇒ code ⇒ chạy `typecheck`, `lint`, `test` ⇒ commit nhỏ ⇒ push ⇒ mở PR ⇒ in link PR.
4. Trong lúc Claude chạy: cho phép lệnh `git`, `gh`, `npm` khi được hỏi. Claude hỏi điều gì thì trả lời **bằng phiếu và spec**; phiếu không ghi thì hỏi người giao việc, không tự bịa.
5. Có link PR: chờ CI xanh. CI đỏ thì dán log lỗi cho Claude sửa trên cùng nhánh.
6. **Thử tay** theo mục "Tiêu chí đạt" của phiếu. Không đạt thì bảo Claude sửa, chưa merge.
7. Bấm **Merge pull request ⇒ Create a merge commit**. Không chọn Squash, không chọn Rebase. PR có sửa `src/contracts/*` thì để **Thiện** bấm merge (00:30–03:30 là Nhân).
8. Nhắn nhóm: **"đã merge <mã phiếu>"**.
9. Trước phiếu sau: `git checkout main`, `git pull`. Prompt của phiếu sau tự làm phần này, nhưng kiểm lại không thừa.

**3 loại phiếu:**

| Mục 1 ghi | Làm thế nào |
| :-- | :-- |
| "Prompt dán cho Claude" | Vòng lặp ở trên |
| "Phiếu này KHÔNG dùng Claude" | Làm tay theo mục **Yêu cầu**, kiểm theo **Tiêu chí đạt**. Không tạo nhánh, không commit (trừ khi phiếu ghi khác) |
| "Prompt mẫu (sửa lỗi chặn demo)" | Chỉ dùng khi có lỗi thật. Thay mọi chỗ `<…>` bằng lỗi thật rồi mới dán. Không có lỗi thì chỉ làm phần việc tay |

## 4. Khi kẹt

| Tình huống | Làm gì |
| :-- | :-- |
| Claude chạy quá **30 phút** chưa xong | Dừng. Chia phiếu nhỏ hơn, làm lại **tối đa 1 lần**. Vẫn sai thì tự code tay phần còn lại. Báo người giao việc |
| `git status` thấy thay đổi trong `docs/` | Dừng, không commit thay đổi đó. Báo Thiện |
| Claude muốn sửa file ngoài mục "File được sửa" | Không cho. Nhắn người giữ file đó (contracts: Thiện) |
| Xung đột khi merge `main` vào nhánh mà Claude không tự gỡ được | Báo người giữ file còn lại, gỡ cùng nhau |
| Lỗi quyền, lỗi đăng nhập `gh` | `gh auth status`; vẫn lỗi thì báo Thiện |
| Trễ giờ so với phiếu | Xem mục **"Nếu trễ"** của phiếu: cắt đúng phần ghi ở đó, báo người được ghi tên. Không lấn giờ ngủ Thứ tự cắt chung của cả đội: `01_KIEM_KE_VA_CAT_GIAM_NEU_TRE.md` Mục 4 |
| Cần một hàm người khác chưa làm xong | Dùng fixture hoặc bản giả như phiếu đã ghi; không ngồi chờ |

## 5. Không bao giờ

- `git add -f`, `git add docs`, `git add .`, `git add -A`. Chỉ `git add <từng file>`.
- Commit hộ người khác, đặt `Co-authored-by` thay người khác.
- `--date`, `GIT_COMMITTER_DATE`, `--amend`, rebase nhánh đã push.
- Squash merge hoặc Rebase merge.
- Đưa code viết sẵn từ trước vào repo thi, dù chia nhỏ. Đưa nhánh `docs-thi` (commit trước 12:00) vào repo thi.
- Sửa, xóa file trong `docs/` trong giờ thi.
- Mở hoặc dán file `.env*` khi đang chia sẻ màn hình; đặt key AI vào biến `NEXT_PUBLIC_*`.
- Push sau **09:00**.

## 6. Thẻ của từng người

### Thiện — trưởng tích hợp, Tầng 0 engine, deploy

- **Mở đầu:** TH-01 lúc 12:00 (đẩy thẳng `main`), TH-02 lúc 12:20. Merge PR contracts của Minh (MI-01) và Nhân (NH-01) trước, rồi mới merge TH-02.
- **Hai cửa sổ Claude lúc 14:30–16:15:** cửa sổ 1 làm TH-05, TH-06; cửa sổ 2 làm **TH-19** (pipeline). Đầu TH-19 phải đặt secret, Environment `production`, biến `DEMO_REPO_URL` trên repo trước.
- **Cổng phải quyết:** G1 13:00 (đủ 5 tên commit, `git shortlog -sn`) · G2 14:00 (Cloud Run sống) · GP 20:00 và 00:00 (pipeline; đỏ thì deploy tay) · G3 20:15 (Vertex AI) · G4 20:00 (lát dọc 1) · G7 04:00 (đóng băng).
- **Chỉ Thiện duyệt `production`** trong tab Actions.
- **22:00:** nhận trang chủ từ Phát (TH-13).
- **00:15–00:30 (TH-16):** diễn tập rollback, bàn giao quyền merge cho Nhân. **Ngủ 00:30–03:30.**
- **Sau đóng băng:** trực lỗi chặn demo, duyệt slide 07:30, **nộp file thuyết trình lúc 09:15**.

### Minh — engine Tầng 1–2 (đường găng)

- **Trước 11:30:** chọn repo TS/JS dự phòng, điền vào ô trống ở `07_GHI_CHU_VA_CHOT.md` Mục 1.
- **Mở đầu:** MI-01 (contracts engine) lúc 12:20, Thiện merge.
- Chuỗi MI-02 ⇒ MI-06 nằm trên **đường găng**: trễ quá 30 phút là đẩy lát dọc 1, báo Thiện ngay.
- Không sửa file trong `src/server/engine/ingest/` (của Thiện). Chạy engine bằng bộ chạy thử của MI-02, không chờ Thiện.
- **23:00 cổng G5:** Java chưa đạt thì dừng Java, demo bằng repo dự phòng.
- **00:30–01:00 (MI-10):** ghi bàn giao trong PR. **Ngủ 01:00–04:00.**
- **05:30–07:30:** làm slide (MI-12). Nói thay ở tổng duyệt 1 lúc 08:00.

### Nhân — AI, BKT, chấm bài

- **Mở đầu:** NH-01 (contracts AI, gọi thử Gemini) lúc 12:20, Thiện merge.
- Giá trị đã chốt: `ANSWER_MIN_CHARS` = 5, `ANSWER_DUPLICATE_SIMILARITY` = 0.95, cổng gác chỉ chặn 3 lỗi. Đã ghi sẵn trong phiếu, không đổi.
- **Giữ quyền merge 00:30–03:30.** Chỉ merge khi CI xanh và chủ phiếu đã thử tay theo "Tiêu chí đạt". PR có đụng `src/contracts/*` thì **chờ Thiện dậy**. Ngoại lệ duy nhất: Nhân được tự đổi 1 dòng `CONFIG.PROMPT_VERSION` trong commit riêng `chore(contracts): đổi PROMPT_VERSION`. **Không duyệt `production`.**
- **02:30–04:00 (NH-11):** duyệt tay output AI, chỉ giữ câu ổn định 3/3 lần. **04:00 (NH-12):** ghi bundle Offline.
- **Ngủ 05:00–08:30.** Là **người nói chính** khi thuyết trình.

### Phát — giao diện trang học

- **Mở đầu:** PH-01 (token giao diện) lúc 12:20, tự merge khi CI xanh.
- **Luật UI:** bố cục, nhãn chữ, thành phần, luồng theo `docs/prototype.html`; màu nền, chữ, trạng thái và font theo `spec/30` Mục 11; **màu nhấn xanh theo prototype**.
- Mọi phiếu của Phát đọc bảng "Hợp đồng UI ⇄ API" ở đầu `02_PHIEU_PHAT.md`. UI chỉ gọi hàm `…Safe`.
- Tải nặng nhất 19:45–23:45. **22:00:** bàn giao `src/app/page.tsx` và `src/components/home/*` cho Thiện (TH-13), ghi trong PR.
- **03:00 (PH-13):** chụp 6 cặp ảnh so với prototype. **04:30:** quay video dự phòng.
- **Ngủ 05:00–08:00.** Là **người bấm máy** khi thuyết trình.

### Quý — mảng độc lập (`/how-it-works`, `/history`, áp phích)

- **Công cụ: Codex** (không dùng Claude). Dán nguyên khối prompt ở Mục 1 của phiếu vào Codex mở trong thư mục repo thi. Codex không chạy được `git push` hoặc `gh pr create` thì tự chạy 2 lệnh ở BƯỚC 5 trong terminal.
- **Mở đầu:** QU-01 lúc 12:20, tự merge khi CI xanh.
- **Chỉ sửa** file trong `src/app/how-it-works/`, `src/components/how-it-works/`, `src/app/history/`, `src/components/history/`. Cần sửa phần chung thì nhắn Thiện.
- Không ai chờ mảng này; trễ thì cắt bớt, không ảnh hưởng demo chính.
- **Ngủ 21:30–00:30.** Áp phích bản cuối lúc 02:30–04:00.
- Khi thuyết trình: bấm giờ, **cầm điện thoại phát mạng di động dự phòng**.

## 7. Câu nhắn nhóm mẫu

- "đã push commit đầu, mọi người pull" (Thiện, 12:00)
- "đã merge MI-03"
- "PR NH-01 sửa contracts, nhờ Thiện merge: <link>"
- "kẹt MI-04 ở bước kiểm, đã quá 30 phút, chia nhỏ làm lại"
- "trễ PH-08 30 phút, cắt theo mục Nếu trễ: <phần cắt>"
- "bàn giao `src/app/page.tsx` cho TH-13"
- "đóng băng 04:00: từ giờ chỉ PR nhãn `fix-demo` hoặc `sau-dong-bang`" (Thiện)
