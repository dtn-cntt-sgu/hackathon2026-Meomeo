# Minh · Lịch chờ và ai đang chờ mình

> Tổng hợp từ cột "Phụ thuộc" và giờ của các phiếu. **Độ dư** = thời gian từ lúc phiếu nguồn xong tới lúc phiếu đích cần. Độ dư 0 hoặc âm nghĩa là có người đứng không nếu trễ.
> Minh nằm trên **đường găng** từ 13:00 tới 19:30. Từ MI-02 tới MI-05 Minh không chờ ai, chỉ có người khác chờ Minh.

## 1. Minh chờ ai

| Giờ cần | Phiếu của Minh | Chờ cái gì | Của ai | Độ dư | Trong lúc chờ làm gì |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 12:20 | MI-01 | Commit đầu, `git pull` | TH-01 (Thiện) | **0 phút** | Đọc `spec/02_CONTRACTS.md` Mục 3 và `spec/11_ENGINE_DO_THI.md`, dán sẵn prompt MI-01 |
| 19:15 | MI-06, file `src/server/engine/index.ts` | `runIngest` | TH-09 (Thiện, xong 19:15) | MI-06 bắt đầu 18:30, chỉ `index.ts` phải chờ | 18:30–19:15 làm khử chu trình, xếp hạng, giữ tối đa 20 bài, nhóm, cạnh (đều là hàm thuần, test bằng `scripts/chay-engine.ts`). **`index.ts` để commit cuối**, viết sau khi TH-09 merge |
| 20:15 | MI-07 | Bản Cloud Run | TH-10 (Thiện) | Chạy trên máy trước | 19:30–20:15 chạy repo TS dự phòng bằng `scripts/chay-engine.ts`, đọc 3 bài, sửa lỗi bài 0 bước |
| 23:00 | MI-09 | Kết quả cổng G5 | Thiện + Nhân cùng quyết | — | Chuẩn bị số liệu Java (số bài, có đủ controller ⇒ service ⇒ repository không) để cổng quyết nhanh |
| 04:05 | MI-11 | Bản đóng băng lên production | TH-17 (Thiện) | **5 phút** | Mở sẵn danh sách DoD phần engine |
| 05:30 | MI-12 | Sổ đo có số thật | TH-17 (Thiện) | 30 phút | — |
| 05:30 | MI-12, đoạn video Offline | Bundle Offline | NH-12 (Nhân, xong 05:00) | 30 phút | Làm slide trước, quay video Offline sau |

## 2. Ai chờ Minh (hạn của Minh)

| Hạn | Phiếu của Minh | Giao cái gì | Cho ai | Độ dư của người nhận | Trễ thì sao |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 13:00 | MI-01 | Kiểu `StaticEngineResult` | PH-03 (Phát, 14:15) | 75 phút | — |
| 13:00 | MI-01 | `IngestSource`, `IngestOutput`, `GithubRepoInfo`, `ProbeResult` | TH-08, TH-09 (Thiện, 17:00) | 4 giờ | — |
| 14:00 | MI-02 | `initParsers` | TH-10 (Thiện, 19:15) | 5 giờ | — |
| **19:30** | MI-06 | `runEngine`, `toClientResult` trong `index.ts` | TH-10 (Thiện), lát dọc 1 | **Trễ 15 phút so với lúc TH-10 bắt đầu**, Thiện làm việc khác trước | Trễ thì để cạnh rỗng (mọi bài mở sẵn), làm cạnh ở MI-07. Báo Thiện ở cổng G4 |
| 23:00 | MI-08 | Java chạy được trên repo Q-03 | Cổng G5 | — | Không đạt thì dừng Java, demo bằng repo dự phòng. Báo cả đội lúc 23:00 |
| 00:30 | MI-09 | Repo demo đã chốt | NH-11 (Nhân, 02:30) | 2 giờ | — |
| **07:30** | MI-12 | Slide bản 1 | TH-18 (Thiện duyệt 07:30), NH-13, PH-15 | 0 phút với Thiện | Trễ thì Thiện duyệt trễ, giờ tập phản biện 07:40–08:00 bị cắt |

## 3. Lưu ý

- **Phiếu MI-06 chưa ghi cách xử lý `index.ts` khi `runIngest` chưa có.** Mở PR trước 19:15 với `index.ts` import file chưa tồn tại thì CI đỏ. Cách làm: tách `index.ts` thành commit hoặc PR riêng, mở ngay sau khi TH-09 merge.
- Chuỗi MI-02 → MI-06 là đường găng của cả đội. Agent quá 30 phút thì dừng, chia nhỏ phiếu ngay, không chờ thêm.
