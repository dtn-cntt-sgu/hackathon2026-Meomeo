# 03 — Git: nhánh, PR, thứ tự push/pull, quyền merge

> Áp dụng cho repo thi. Luật thi ở `docs/references/thele.md` Mục VII.2. Vi phạm là bị hủy tư cách thi.

## 1. Luật cứng, không ngoại lệ

1. Repo thi **public, trống hoàn toàn** khi BTC kiểm. Tạo repo **không** tick README, license, `.gitignore`.
2. Cả 5 người là Collaborator, và ai cũng có commit code thật.
3. Chỉ commit trong giờ thi, từ 12:00 07/11 tới 09:00 08/11. **Cấm push hàng loạt code chuẩn bị trước.**
4. **Không đưa code viết sẵn từ trước vào repo thi**, dù chép nguyên file hay chia nhỏ ra nhiều commit. Chia nhỏ code có sẵn để lịch sử commit trông tự nhiên cũng là vi phạm.
5. Mỗi người commit bằng **chính tài khoản của mình**, không commit hộ, không đặt `Co-authored-by` thay người khác.
6. Không mạo danh, không sửa thời gian commit. Cấm `--date`, cấm `GIT_COMMITTER_DATE`, cấm `--amend` để sửa giờ, cấm `rebase` để đổi lịch sử đã push.
7. Không commit: `.kb/`, `.env*` (trừ `.env.example`), `AGENTS.md`, `CLAUDE.md`, `.claude/`. Thư mục `docs/` chỉ được commit **1 lần** bởi Thiện ở TH-01 (Mục 2); sau đó không ai sửa file trong `docs/`. Không dùng `git add -f`.
8. Commit nhỏ, khoảng **200 dòng trở xuống**, message rõ nghĩa: `feat(engine): cắt link về gốc repo`, `fix(ai): …`, `test(…)`, `chore(…)`.

## 2. Thư mục `docs/` trong repo thi (bắt buộc, làm đúng thứ tự)

Lúc bắt đầu thi, repo thi **trống**. Thư mục `docs/` của đội (bộ docs thi, lấy từ nhánh `docs-thi`) được đưa lên repo thi **sau 12:00**, trong 1 commit riêng, để AI của cả 5 người đọc làm kim chỉ nam. `docs/` gồm:

- `docs/spec/` (toàn bộ đặc tả),
- `docs/ke-hoach-thi/` (bộ kế hoạch này, gồm các phiếu),
- `docs/prototype.html` (bản vẽ giao diện),
- `docs/pitch/`, `docs/doc-de-hieu/`, `docs/references/` (cho người đọc và làm slide; prompt trong phiếu không bắt AI đọc).

Thứ tự:

1. 12:00, Thiện (TH-01): clone repo thi trống ⇒ chạy `create-next-app` khi thư mục **chỉ có `.git`** ⇒ `.gitignore` có `.kb/`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.env*`, `!.env.example` (**không** có `docs/`) ⇒ chép thư mục `docs/` vào ⇒ commit 1: khung dự án; commit 2: `docs: tài liệu đặc tả và kế hoạch của đội` ⇒ push.
2. 12:20, 4 người còn lại: `git pull` là có `docs/`. **Không tự chép `docs/`** vào nữa.
3. **Không đưa nhánh `docs-thi` hay commit cũ của nó vào repo thi.** Các commit đó có giờ trước 12:00; BTC chỉ nhận commit trong giờ thi. Chỉ chép file rồi tạo commit mới.
4. Trong giờ thi không ai sửa, xóa hay add file trong `docs/`. `git status` thấy thay đổi trong `docs/` thì dừng, không commit, báo Thiện.
5. Không bao giờ dùng `git add -f`.

### 2.1. Chuẩn bị trên mỗi máy (trước 11:30)

- `git config user.name` và `git config user.email` đúng tài khoản GitHub của chính mình. Email phải đã xác minh trên GitHub, nếu không thì commit không hiện tên trong danh sách Contributors.
- Clone repo thi **vào một thư mục mới, trống**. Agent chỉ được mở thư mục repo thi. Trong thư mục này không có file code nào từ trước.
- **Thiện:** clone nhánh `docs-thi` vào một thư mục riêng (không phải thư mục repo thi) để chép `docs/` vào repo thi ở TH-01. 4 người còn lại không cần, `docs/` có sẵn sau khi pull.
- Đăng nhập `gh` (nếu dùng) bằng tài khoản của mình.

## 3. Nhánh và PR

- **Một phiếu = một nhánh = một PR.** Tên nhánh `<ten>/<ma-phieu>`, chữ thường: `thien/th-05`, `minh/mi-03`, `nhan/nh-07`, `phat/ph-08`, `quy/qu-03`. Sửa lỗi sau đóng băng: `<ten>/fix-<mô-tả>`.
- **Claude làm phần git** (Quý dùng Codex, cách làm giống hệt; Codex không push được thì Quý tự chạy lệnh ở BƯỚC 5): prompt ở Mục 1 của mỗi file `phieu/<ten>/<MÃ>.md` bảo Claude tự `git checkout -b`, commit nhỏ, `git push`, `gh pr create`. Claude **không** tự merge. Mỗi máy phải cài sẵn `gh` và đã `gh auth login` bằng tài khoản của chính người đó (commit và PR mang tên người đó).
- **Người làm tự merge PR của mình** khi CI xanh và đã thử tay theo "Tiêu chí đạt". Ngoại lệ: PR sửa `src/contracts/*` (TH-02, MI-01, NH-01, và mọi thay đổi contracts sau 13:00) do Thiện bấm merge.
- Mỗi PR có: mã phiếu trong tiêu đề, danh sách file đã sửa (phải nằm trong "File được sửa" của phiếu), kết quả 3 lệnh kiểm, cách thử tay.
- **Kiểu merge: "Create a merge commit".** Không dùng "Squash and merge" vì gộp nhiều commit thành 1 commit lớn, trông như bulk commit. Không dùng "Rebase and merge" vì GitHub viết lại commit.
- CI (`ci.yml`) phải xanh trước khi merge. PR đỏ thì chủ PR sửa, người merge không sửa hộ.
- Sau 04:00 chỉ merge PR nhãn `fix-demo` (lỗi chặn demo) hoặc `sau-dong-bang` (bundle Offline, sửa hiển thị nhỏ của mảng độc lập, test hồi quy, README, commit cuối). Không loại nào được thêm tính năng.
- PR nằm trên đường găng được merge ngay khi CI xanh, không chờ cửa sổ merge.

## 4. Thứ tự push/pull

| Lúc | Ai | Làm gì |
| :-- | :-- | :-- |
| 12:00 | Thiện | Push commit đầu (TH-01) lên `main`. Nhắn cả đội "đã push" |
| 12:20 | 4 người còn lại | `git pull` về `main`, `npm ci`, tạo nhánh phiếu đầu của mình |
| 12:20–13:00 | Cả 5 | Claude mở PR phiếu đầu. Thiện merge MI-01, NH-01 (contracts) trước để TH-02 viết `index.ts`; Phát, Quý tự merge PH-01, QU-01 khi CI xanh; Thiện merge TH-02 cuối cùng |
| Mỗi khi có PR xanh | Chủ PR | Tự merge PR của mình (PR contracts: Thiện; 00:30–03:30: Nhân). Nhắn nhóm "đã merge <mã>" |
| Ngay sau mỗi đợt merge | Ai đang làm phiếu | `git pull` từ `main` vào nhánh của mình (merge `main` vào nhánh, không rebase nhánh đã push) |
| Trước khi mở PR | Chủ PR | Pull `main` mới nhất, chạy lại 3 lệnh kiểm |
| 04:00 | Thiện | Đóng băng. Nhắn cả đội. Từ giờ chỉ PR `fix-demo` và `sau-dong-bang` |
| 08:30–08:45 | Cả 5 | Push hết việc còn lại (commit cuối), mở PR, tự merge khi CI xanh. **09:00 dừng mọi push** |

Khi 2 người cần cùng 1 file: không làm song song. Người giữ file làm xong, merge, rồi mới **bàn giao** (ghi trong PR "bàn giao `<file>` cho `<mã phiếu>`"). Các lần bàn giao đã lên lịch:

| File | Từ | Sang | Lúc |
| :-- | :-- | :-- | :-- |
| `src/app/layout.tsx`, `src/app/globals.css` | TH-01 | PH-01 | 12:20 |
| `src/app/page.tsx` | TH-01 | PH-04 | 12:20 |
| `src/app/page.tsx`, `src/components/home/*` | PH-04 | TH-13 | 22:00 |
| `src/contracts/engine.ts`, `engine-internal.ts`, `ai.ts`, `learner.ts` | MI-01, NH-01 | Thiện | 13:00 |

## 5. Quyền merge

- **Mỗi người tự merge PR của mình** (cả 5 là Collaborator có quyền `Write`, đủ để merge).
- **PR sửa `src/contracts/*`:** Thiện merge; từ 00:30 tới 03:30 khi Thiện ngủ là **Nhân**. Trước giờ thi, chủ repo cấp cho Nhân quyền `Maintain`.
- **Sau 04:00:** chỉ PR nhãn `fix-demo` hoặc `sau-dong-bang` được merge; Thiện xem qua trước khi chủ PR bấm merge.
- Người giữ quyền dự phòng (Nhân) chỉ merge PR contracts khi đủ 3 điều kiện: CI xanh, chủ phiếu đã tự kiểm theo "Tiêu chí đạt", không đụng `src/contracts/*`. PR đụng contracts chờ Thiện dậy. Ngoại lệ duy nhất: Nhân được tự sửa 1 dòng `CONFIG.PROMPT_VERSION` trong `src/contracts/config.ts` khi chỉnh prompt ban đêm (NH-08, NH-11), trong 1 commit riêng `chore(contracts): đổi PROMPT_VERSION`.
- Không bật branch protection bắt buộc review. Cài này dễ chặn cả đội khi người duyệt đang ngủ. CI xanh là đủ.

## 6. Kiểm lịch sử commit

- **13:00:** `git shortlog -sn` trên `main` ⇒ đủ 5 tên.
- **Mỗi lần merge:** xem nhanh `git log --oneline -10`. Commit quá to (hơn khoảng 400 dòng) thì nhắc chủ PR lần sau chia nhỏ hơn.
- **08:45 (lệnh kiểm duy nhất cho phần commit cuối):** chạy `git log --since="2026-11-07 12:00" --format="%an" | sort | uniq -c` ⇒ đủ 5 tên, mỗi tên nhiều commit. Rồi chạy `git log --since="2026-11-08 00:00" --format="%an %ad" --date=iso` ⇒ cả 5 người có commit sau nửa đêm (cả 5 đều làm việc sau 00:00 theo lịch). Không ai phải commit thêm chỉ để có tên lúc cuối; chỉ commit khi có việc thật.
- **09:00:** không còn PR nào đang chờ merge. Commit sau 09:00 không được tính.
