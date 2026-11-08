# Phát · Lịch chờ và ai đang chờ mình

> Tổng hợp từ cột "Phụ thuộc" và giờ của các phiếu. **Độ dư** = thời gian từ lúc phiếu nguồn xong tới lúc phiếu đích cần. Độ dư 0 hoặc âm nghĩa là có người đứng không nếu trễ.
> Phát chờ API của Nhân và Thiện ở nhiều phiếu, nhưng **phiếu nào cũng có `?fixture=1`**. Quy tắc chung: làm hết bằng fixture trước, API thật merge thì chỉ việc bật lên và thử lại.

## 1. Phát chờ ai

| Giờ cần | Phiếu của Phát | Chờ cái gì | Của ai | Độ dư | Trong lúc chờ làm gì |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 12:20 | PH-01 | Commit đầu, `git pull` | TH-01 (Thiện) | **0 phút** | Đọc `prototype.html` phần CSS token, dán sẵn prompt |
| **13:00** | PH-02 | Contracts chung | TH-02 (Thiện, xong 13:00) | **0 phút** | Đọc PR TH-02 đang mở. Dựng trước bảng thông điệp lỗi và khung store không phụ thuộc kiểu |
| 14:15 | PH-03 | Kiểu `StaticEngineResult` | MI-01 (Minh, xong 13:00) | 75 phút | Không phải chờ |
| 14:45 | PH-04 | Hàm đăng nhập, `/api/ingest` thật | TH-06 (16:15), TH-07 (17:00) | Dùng cách tạm | Nút đăng nhập tạm tắt với nhãn "Đăng nhập (đang nối)", nút Quét dùng `?fixture=1`. Bật nút thật trong 10 phút sau khi TH-06 merge (làm xen trong PH-05) |
| 18:30 | PH-07 | Fixture phân tích, API `analyze-node` thật | NH-02 (13:30), NH-05 (18:30) | 0 phút cho API thật | Làm bằng fixture trước |
| 19:45 | PH-08 | API `enrich-node`, chấm bài thật | NH-06 (20:30), NH-07 (22:30) | Dùng fixture | Chạy kịch bản A3 → A6 bằng `?fixture=1` |
| 21:45 | PH-09 | API tiến độ | TH-11 (Thiện, xong 21:00) | 45 phút | — |
| 21:45 | PH-09 | Chấm bài thật | NH-07 (Nhân, xong 22:30) | Còn 15 phút trước khi PH-09 hết giờ | Làm đổi trạng thái node, mở khóa, toast, mài mòn bằng fixture trước. 22:30 nối chấm bài thật |
| 22:45 | PH-10 | API giải thích | NH-09 (Nhân, xong 00:30) | Dùng fixture | Kết quả mẫu `ExplainSelectionResponse` trong nhánh fixture của `src/store/workbench.ts`. Kiểm API thật lúc 00:30 |
| 23:45 | PH-11 | API persona | TH-15 (Thiện, xong 00:15) | Trễ 30 phút | 23:45–00:15 làm Tổng quan nhịp 1, menu tài khoản, kiểm dưới 1024 px. Ô persona làm sau 00:15 |
| 02:00 | PH-12 | `offline.ts` | NH-10 (Nhân, xong 02:30) | Trễ 30 phút | 02:00–02:30 làm phím tắt `Ctrl+Shift+D` và nhãn Offline |
| 04:00 | PH-14 | Bản đóng băng trên production | TH-17 (Thiện, deploy 04:05) | 5 phút | Sửa lỗi UI trên máy trước. Video quay lúc 04:30 trên production |
| 08:00 | PH-15 | Slide | MI-12 (Minh, xong 07:30) | 30 phút | — |

## 2. Ai chờ Phát (hạn của Phát)

| Hạn | Phiếu của Phát | Giao cái gì | Cho ai | Độ dư của người nhận | Trễ thì sao |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 14:15 | PH-02 | Chữ ký các hàm trong `src/lib/api.ts` | NH-10 (Nhân, 00:30) | Hơn 10 giờ | — |
| 14:45 | PH-03 | Fixture `shop-api.json` | TH-07 (Thiện, 16:15) | 90 phút | — |
| 15:45 | PH-04 | Trang chủ tối thiểu | TH-10 (19:15) | Hơn 3 giờ | — |
| **19:45** | PH-07 | Tour X-Ray | TH-10, lát dọc 1 lúc 19:45 | **0 phút** | **Không có cách làm tạm.** Trễ thì bỏ thanh mài mòn (làm ở PH-09), báo Thiện ở cổng G4 |
| 22:00 | PH-04 | Bàn giao file trang chủ | TH-13 (Thiện) | — | Push hết trước 22:00 và không sửa file trang chủ sau giờ này |
| **22:45** | PH-09 | Áp kết quả | NH-08 (Nhân, 22:30), TH-14 (Thiện, 23:00) | **Trễ 15 phút với Nhân, dư 15 phút với Thiện** | Lát dọc 2 lúc 23:00 bị đẩy |

## 3. Lưu ý

- Hai hạn quan trọng nhất của Phát là **19:45 (PH-07)** và **22:45 (PH-09)**. Cả hai nằm trên đường găng.
- Cột "Phụ thuộc" của PH-04 có nhắc PH-05, và PH-10 có nhắc PH-11. Đó chỉ là chỗ làm xen, không phải phụ thuộc thật.
- PR mở sau 03:45 sẽ không được merge trước đóng băng.
