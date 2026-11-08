# Thiện · Lịch chờ và ai đang chờ mình

> Tổng hợp từ cột "Phụ thuộc" và giờ của các phiếu. **Độ dư** = thời gian từ lúc phiếu nguồn xong tới lúc phiếu đích cần. Độ dư 0 hoặc âm nghĩa là có người đứng không nếu trễ.
> Thiện là người đầu mối: **nhiều người chờ Thiện hơn Thiện chờ người khác.** Mọi PR đều chờ Thiện merge, trừ 00:30–03:30 do Nhân giữ quyền merge.

## 1. Thiện chờ ai

| Giờ cần | Phiếu của Thiện | Chờ cái gì | Của ai | Độ dư | Trong lúc chờ làm gì |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 16:15 | TH-07 | Fixture `shop-api.json` | PH-03 (Phát, xong 14:45) | 90 phút | Không phải chờ |
| 19:15 | **TH-10** | Engine thật `runEngine` | MI-06 (Minh, xong 19:30) | **Trễ 15 phút** | 19:15–19:30 làm Step 3 trước: `instrumentation.ts` (chỉ cần `assertGeminiEnv` của NH-04 và `initParsers` của MI-02, đã có từ chiều) |
| 19:45 | **TH-10** Step 4 lát dọc 1 | Tour X-Ray | PH-07 (Phát, xong 19:45) | **0 phút** | 19:30–19:45: merge MI-06, đổi import sang engine thật, xóa `stub.ts`, chạy thử bản đồ trên repo TS dự phòng. **Không có cách làm tạm cho X-Ray**: PH-07 trễ là lát dọc 1 trễ |
| 21:00 | TH-12 | `computeSkillChange`, `outcomeOf`, `nodeStatusFromRuns` | NH-03 (Nhân, xong 15:00) | 6 giờ | Không phải chờ |
| 22:00 | TH-13 | Bàn giao file trang chủ | PH-04 (Phát) | Đã xong từ 15:45 | Phát chỉ cần push hết trước 22:00 |
| 23:00 | TH-14 | Chấm bài thật | NH-07 (Nhân, xong 22:30) | 30 phút | — |
| 23:00 | TH-14 | Áp kết quả | PH-09 (Phát, xong 22:45) | **15 phút** | Chuẩn bị lệnh deploy, mở sổ đo. Trễ thì deploy phần đã có, đo phần còn lại sau |
| 03:30 | TH-17 | Sổ duyệt tay có 10 câu NOVICE | NH-11 (Nhân) | Nhân làm từ 02:30 | Nhắc Nhân để sổ sẵn trước khi Thiện ngủ dậy |
| 03:50 | TH-17 | PR cuối của tính năng | Cả đội | PR phải mở **trước 03:45** | PR mở sau 03:45 không merge |
| 05:00 | TH-18 | Bundle Offline | NH-12 (Nhân, xong 05:00) | **0 phút** | Trực lỗi `fix-demo` trong lúc chờ |
| 07:30 | TH-18 | Slide bản 1 | MI-12 (Minh, xong 07:30) | 0 phút, đã xếp sẵn trong lịch | Tập nói phần hạ tầng |

## 2. Ai chờ Thiện (hạn của Thiện)

| Hạn | Phiếu của Thiện | Giao cái gì | Cho ai | Độ dư của người nhận | Trễ thì sao |
| :-- | :-- | :-- | :-- | :-- | :-- |
| **12:20** | TH-01 | Commit đầu | MI-01, NH-01, PH-01, QU-01 | **0 phút** | 4 người cùng đứng. Ưu tiên tuyệt đối |
| **13:00** | TH-02 | Contracts chung | PH-02 (Phát) | **0 phút** | Phát đứng. Mở PR sớm để Phát đọc trước |
| 13:00 | TH-02 | `AttemptHistoryItem`, `HistoryResponse` | QU-05 (Quý, 19:00) | 6 giờ | — |
| 15:30 | TH-05 | Bảng `ai_cache`, cột `tokens_used` | NH-04 (Nhân, bắt đầu 15:00) | Trễ 30 phút, Nhân làm phần khác trước | Trễ hơn 15:45 thì báo Nhân |
| 16:15 | TH-06 | Hàm đăng nhập | PH-04 (Phát) | Phát dùng nút tạm | Báo Phát khi merge |
| **17:00** | TH-07 | `getSessionStaticResult`, `/api/ingest` | NH-05 (Nhân, bắt đầu 16:45), PH-04 | **Trễ 15 phút** | Nhân viết prompt trước. Trễ hơn 17:15 là Nhân đứng |
| **19:15** | TH-09 | `runIngest` | MI-06 (Minh) | Minh còn 15 phút để gắn `index.ts` | 19:30 chưa xong thì báo Minh, lát dọc 1 dùng zip upload |
| 20:15 | TH-10 | Bản Cloud Run | MI-07 (Minh) | Minh chạy trên máy trước | — |
| 21:00 | TH-11 | API tiến độ | PH-09 (Phát, 21:45) | 45 phút | — |
| **22:00** | TH-12 | `progress.ts` | NH-06, NH-07 (Nhân) | Nhân dùng `db.tx` tạm | Trễ thì Nhân giữ `db.tx`, mở khóa thêm ở TH-15 |
| 23:45 | TH-14 | Bản Cloud Run lát dọc 2 | NH-08 (Nhân) | Nhân chạy trên máy | — |
| 00:15 | TH-15 | API persona, API lịch sử | PH-11 (Phát), QU-06 (Quý) | 15–30 phút | Quý giữ dữ liệu mẫu, không chờ |
| **04:05** | TH-17 | Deploy production bản đóng băng | MI-11, NH-12, PH-14 | **5 phút** | Cả 3 người bắt đầu 04:00 đều chờ bản này |

## 3. Lưu ý

- **Thứ tự các bước trong TH-10 ghi chưa khớp giờ.** Phiếu ghi Step 1 là merge MI-06 và PH-07, nhưng lúc 19:15 cả hai chưa xong. Làm Step 3 trước, rồi Step 1 và 2, cuối cùng Step 4.
- Ba hạn độ dư 0 của Thiện: **12:20, 13:00, 17:00**. Làm sớm được phút nào là đỡ cho người khác phút đó.
- Merge mỗi đợt giới hạn 10 phút. Chồng PR thì merge theo thứ tự đường găng: MI → NH → PH → QU.
