# Quý · Lịch chờ và ai đang chờ mình

> Tổng hợp từ cột "Phụ thuộc" và giờ của các phiếu. **Độ dư** = thời gian từ lúc phiếu nguồn xong tới lúc phiếu đích cần.
> Quý làm mảng độc lập: **không ai chờ phiếu của Quý**, và Quý gần như không phải chờ ai. Thứ duy nhất Quý chờ là người merge PR.

## 1. Quý chờ ai

| Giờ cần | Phiếu của Quý | Chờ cái gì | Của ai | Độ dư | Trong lúc chờ làm gì |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 12:20 | QU-01 | Commit đầu, `git pull` | TH-01 (Thiện) | 0 phút | Viết khung trang ngay sau khi pull. Chưa có token màu (PH-01 chưa merge) thì dùng lớp Tailwind trung tính, đổi sang token ở QU-02 |
| 15:00 | QU-03 | Danh sách `SWE_SKILLS` (chỉ đọc) | NH-01 (Nhân, xong 13:00) | 2 giờ | Không phải chờ |
| 17:30 | QU-04 | — | Không phụ thuộc phiếu nào | — | — |
| 19:00 | QU-05 | Kiểu `AttemptHistoryItem`, `HistoryResponse` (chỉ đọc) | TH-02 (Thiện, xong 13:00) | 6 giờ | Không phải chờ |
| 00:30 | QU-06 | API lịch sử | TH-15 (Thiện, xong 00:15) | 15 phút | **Không chờ.** Chưa có API thì giữ dữ liệu mẫu |
| 02:30 | QU-07 | Bản Cloud Run đang chạy, để chụp ảnh | Bản deploy của Thiện | Có từ 23:45 (TH-14) | Không chờ ai |

## 2. Ai chờ Quý

Không ai. Không phiếu nào của người khác cần đầu ra của Quý.

## 3. Người merge PR

| Khoảng | Người merge |
| :-- | :-- |
| Tới 00:30 | Thiện |
| 00:30–03:30 | **Nhân** (Thiện ngủ). QU-06 và đầu QU-07 rơi vào khoảng này |
| Từ 03:30 | Thiện. Sau 04:00 chỉ merge PR nhãn `fix-demo` hoặc `sau-dong-bang` |

## 4. Lưu ý

- Quý là người rảnh nhất ở các lúc cả đội bị dồn: **19:15–20:00** (lát dọc 1) và **22:30–23:00** (lát dọc 2). Nếu đội cần người thử tay hoặc đọc PR hộ lúc đó, Quý nhận được mà không ảnh hưởng phiếu của mình.
- Quý ngủ 21:30–00:30. Trước khi ngủ, push hết QU-05.
