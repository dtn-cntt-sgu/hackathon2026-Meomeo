# Nhân · Lịch chờ và ai đang chờ mình

> Tổng hợp từ cột "Phụ thuộc" và giờ của các phiếu. **Độ dư** = thời gian từ lúc phiếu nguồn xong tới lúc phiếu đích cần. Độ dư 0 hoặc âm nghĩa là có người đứng không nếu trễ.
> Nhân chờ Thiện ở 4 chỗ, nhưng chỗ nào cũng có cách làm tạm. Phát chờ Nhân ở nhiều chỗ, nhưng Phát đều có fixture để dùng trong lúc chờ. **00:30–03:30 Nhân giữ quyền merge**, nên PR của Minh, Phát, Quý lúc đó chờ Nhân.

## 1. Nhân chờ ai

| Giờ cần | Phiếu của Nhân | Chờ cái gì | Của ai | Độ dư | Trong lúc chờ làm gì |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 12:20 | NH-01 | Commit đầu, `git pull` | TH-01 (Thiện) | **0 phút** | Đọc spec, dán sẵn prompt, chuẩn bị lệnh gọi thử Gemini |
| 15:30 | NH-04, file `quota.ts` | Bảng `ai_cache`, cột `learning_sessions.tokens_used` | TH-05 (Thiện, xong 15:30) | NH-04 bắt đầu 15:00, chỉ `quota.ts` cần DB | 15:00–15:30 làm `gemini.ts`, `schemas.ts`, `guard/*`, `prompts/common.ts`. `quota.ts` để sau cùng |
| 17:00 | NH-05, route `analyze-node` | `getSessionStaticResult` | TH-07 (Thiện, xong 17:00) | Trễ 15 phút | 16:45–17:00 viết prompt, schema và parse của `analyzeNode`, test bằng dữ liệu tự dựng. Route nối sau |
| 22:00 | NH-06, NH-07 | `progress.ts` (`saveRunQuestions`, các hàm transaction) | TH-12 (Thiện, xong 22:00) | Trễ 3,5 giờ và 1,5 giờ | Viết tạm thẳng bằng `db.tx`. 22:00 đổi sang hàm của `progress.ts` |
| 22:30 | NH-08 | Áp kết quả | PH-09 (Phát, xong 22:45) | **Trễ 15 phút** | 22:30–22:45 chạy kịch bản A/B phần chấm bài trên API, chưa cần UI |
| 22:30 | NH-08 | Bản Cloud Run lát dọc 2 | TH-14 (Thiện, 23:45) | — | Chạy trên máy Nhân |
| 02:30 | NH-11 | Repo demo đã chốt | MI-09 (Minh, xong 00:30) | 2 giờ | — |
| 04:00 | NH-12 | Bản đóng băng | TH-17 (Thiện, đóng băng 04:00, deploy 04:05) | **5 phút** | Chuẩn bị script ghi bundle của NH-10 |

## 2. Ai chờ Nhân (hạn của Nhân)

| Hạn | Phiếu của Nhân | Giao cái gì | Cho ai | Độ dư của người nhận | Trễ thì sao |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 13:00 | NH-01 | `SWE_SKILLS`, `PERSONAS` | QU-03 (Quý), TH-15 (Thiện) | Hơn 2 giờ | — |
| 13:30 | NH-02 | Fixture phản hồi AI | PH-07, PH-08 (Phát) | Hơn 5 giờ | Phát cần fixture này để làm trong lúc chờ API thật |
| 15:00 | NH-03 | Hàm BKT, `planNodeQuestions`, `getDecayedMastery`, `tierOf` | TH-12 (Thiện), PH-09 (Phát) | Hơn 6 giờ | — |
| 16:45 | NH-04 | `assertGeminiEnv` | TH-10 (Thiện, 19:15) | 2,5 giờ | — |
| 18:30 | NH-05 | API `analyze-node` thật | TH-10 lát dọc 1, PH-07 | 45 phút | Trễ quá 19:15 là lát dọc 1 không có X-Ray thật |
| 20:30 | NH-06 | API `enrich-node` thật | PH-08 (Phát) | Phát dùng fixture | — |
| **22:30** | NH-07 | API chấm bài thật | PH-09 (Phát, xong 22:45), TH-14 (23:00) | **15 phút với Phát** | Chuỗi lát dọc 2. Trễ ⇒ cắt mục 3–6 theo cổng G5 |
| 00:30 | NH-09 | API giải thích | PH-10, PH-11 (Phát) | Phát dùng fixture | Phát kiểm API thật lúc 00:30 |
| **02:30** | NH-10 | `offline.ts` | PH-12 (Phát, bắt đầu 02:00) | Trễ 30 phút, Phát làm phím tắt trước | Trễ hơn 02:30 là Phát đứng |
| 03:30 | NH-11 | Sổ duyệt tay có 10 câu NOVICE | TH-17 (Thiện dậy 03:30) | 0 phút | Để sổ sẵn trước khi Thiện dậy |
| **05:00** | NH-12 | Bundle Offline | TH-18 (Thiện merge 05:00), MI-12 (Minh quay video Offline) | **0 phút với Thiện** | Trễ thì Nhân ngủ trễ |

## 3. Lưu ý

- **Chưa ai được giao sửa phần `db.tx` tạm của NH-06.** NH-06 xong lúc 20:30, còn `saveRunQuestions` 22:00 mới có. Lúc 22:00, khi đổi transaction của NH-07 sang `progress.ts`, **đổi luôn cả chỗ tạo run của NH-06**.
- Thứ tự ưu tiên khi bị dồn việc: NH-05 (lát dọc 1) → NH-07 (lát dọc 2) → NH-10 (Phát chờ lúc 02:30) → phần còn lại.
