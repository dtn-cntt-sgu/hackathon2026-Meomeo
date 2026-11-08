# 08 — Tiến độ từng phiếu

> Bảng theo dõi trạng thái của **75 phiếu** (Thiện 21, Minh 13, Nhân 16, Phát 17, Quý 8; 7 phiếu tăng tốc NH-14, 15, 16, TH-20, 21, PH-16, 17 thêm ở #63, xem `09_PHIEU_TANG_TOC.md`). Mỗi người cập nhật dòng phiếu của mình ngay sau khi merge, rồi nhắn nhóm "đã merge <mã phiếu>" như `00_CAM_TAY_CHI_VIEC.md` Mục 3.
> **Cập nhật lần cuối:** 07/11/2026, 20:05 (đối chiếu với `origin/main` tới PR #74 và danh sách PR trên GitHub, gồm PR đang mở #75).
> Danh sách phiếu, giờ và cách làm gốc nằm ở `02_PHIEU_<TEN>.md`. File này chỉ ghi trạng thái, không đổi nội dung phiếu.

## Cách đọc

| Ký hiệu | Nghĩa |
| :-- | :-- |
| ✅ | Đã merge vào `main` (ghi số PR) |
| ◐ | Xong một phần: PR đã merge nhưng phiếu còn việc (ví dụ phần lõi đã có, route hoặc deploy chưa). Cột "Ghi chú" nói còn thiếu gì |
| 🔄 | Đang làm: PR đang mở, hoặc nhánh đã push nhưng chưa có PR |
| ⬜ | Chưa làm |
| ❓ | Chưa thấy dấu vết trên git (phiếu làm tay, hoặc làm ngoài repo). Người phụ trách tự xác nhận |

**Cách cập nhật:** đổi ký hiệu ở cột "Trạng thái", điền số PR vào cột "PR", ghi chú ngắn nếu có lệch so với phiếu (cắt phần nào, làm bù phần nào). Không sửa cột "Giờ" (giờ kế hoạch gốc). Chỉ `git add` đúng file này, không `git add .`.

## Tổng quan

| Người | Xong ✅ | Một phần ◐ | Đang làm 🔄 | Chưa làm ⬜ | Tổng | Phiếu tiếp theo |
| :-: | :-: | :-: | :-: | :-: | :-: | :-- |
| Thiện | 12 | 3 | 1 | 5 | 21 | **Step 4 của TH-10** (lát dọc 1 qua giao diện, cổng G4); duyệt và merge #75 (TH-19) sau khi đủ điều kiện; **Step 5** (deploy Cloud Run, Vertex AI, cổng G3); nốt deploy của TH-04 |
| Minh | 8 | 1 | 0 | 4 | 13 | Cùng xem lát dọc 1 với Thiện (kiểm TH-10); nốt MI-09 (kiểm trên Cloud Run, chốt repo demo) |
| Nhân | 11 | 2 | 0 | 3 | 16 | NH-08 phần ghép lát dọc 2; duyệt tay output AI (NH-11); chốt quyết định thời gian chờ của NH-15 |
| Phát | 15 | 0 | 0 | 2 | 17 | Hết phiếu của mình. PH-14 chờ TH-17 và NH-12, PH-15 lúc 08:00. Có thể chạy lát dọc 1 trên máy và đo thời gian chờ cho PH-16, PH-17 |
| Quý | 4 | 0 | 0 | 4 | 8 | QU-04 (làm tay, áp phích); QU-06 (nối API lịch sử, đã có từ TH-15) |
| **Cả đội** | **50** | **6** | **1** | **18** | **75** | |

Ghi chú: các con số trên đếm theo PR đã merge trên `main` (tới PR #74). PR đang mở: #75 (TH-19, cố ý chưa merge). TH-11 và TH-13 do Phát làm hộ Thiện, TH-09 do Minh làm giúp. Phiếu làm tay (không có PR) tính là ⬜ hoặc ❓ cho tới khi người phụ trách xác nhận.

**Điểm nghẽn hiện tại:**
- **Cổng G4 (lát dọc 1, 20:00) còn Step 4 của TH-10:** code đã nối engine thật (#74) nhưng chưa ai chạy qua giao diện: dán link repo thật ⇒ bản đồ ⇒ bấm 1 bài ⇒ X-Ray có phân tích thật, đồng hồ `ingest_ms + engine_ms` trên thanh trên. Cần `.env.local` đủ khóa (Supabase, Gemini, `DATABASE_URL`) và đăng nhập GitHub; Supabase phải có `http://localhost:3000/auth/callback` trong Redirect URLs.
- **Hạ tầng triển khai:** TH-19 (#75) đã có `Dockerfile`, `deploy.yml` nhưng **chưa merge** vì merge sẽ tự chạy `deploy`. Còn thiếu trước khi merge: Environment `production` có Required reviewers, biến Supabase dev và secret bot smoke, service `simplifey-staging`. TH-04 vẫn chưa thấy deploy Cloud Run; cổng G2, G3 (Vertex AI từ Cloud Run) và GP vẫn mở. `runEngine` thật đọc `public/grammars` và `queries` nên cần thử trên Cloud Run.
- **Chưa kiểm với dịch vụ thật:** TH-07, 11, 12, 15 chỉ kiểm bằng test mock hoặc Postgres tạm; PH-16, PH-17 chưa chạy với API thật nên chưa có số đo thời gian chờ. Cần một lượt chạy đầu-cuối sau Step 4.
- **Quyết định chờ cả nhóm (NH-15):** thời gian xấu nhất theo code ≈ 20,5 s (chấm, giải thích) và ≈ 32,5 s (phân tích, câu hỏi), chưa khớp "~25 giây" của kế hoạch. Số đo gọi Gemini lần gần nhất dao động (phân tích 5,7–15,3 s), chưa kết luận được.
- `public/demo/mock_bundle.json` chưa có (NH-12, ghi trên bản đóng băng) nên chưa thử tay được X-06 của PH-12. `?fixture=1` chạy được kịch bản A (#58) bằng bundle riêng, không thay cho bundle thật.
- TH-12 ghi `ai_usage` không chờ: trên Cloud Run bản ghi chạy sau khi trả kết quả có thể chậm hoặc mất (bảng thống kê tối giản B17). Đổi `PROMPT_VERSION` (1.5.0) làm cache phân tích cũ không còn dùng.
- Chưa chốt repo demo cuối (cổng G5): Minh đề xuất bài trên repo Spring (xem PR #57); NH-11 mới có công cụ duyệt, chưa duyệt tay. Không đổi tên bài hoặc route nữa vì `node_id` của bài `GET /user` đã đổi.

## Thiện — trưởng tích hợp, Tầng 0 engine, deploy

| Mã | Tên việc | Giờ | Trạng thái | PR | Ghi chú |
| :-- | :-- | :-- | :-: | :-: | :-- |
| TH-01 | Khung dự án và commit đầu | 12:00 → 12:20 | ✅ | — | Đẩy thẳng `main` (commit khung dự án và commit `docs/`) |
| TH-02 | Contracts phần chung và cờ menu | 12:20 → 13:00 | ✅ | #3 | |
| TH-03 | CI tối thiểu và thử luồng PR | 13:00 → 13:20 | ✅ | #4 | |
| TH-04 | Bản khung đầu tiên lên Cloud Run, có Vercel dự phòng | 13:20 → 14:30 | ◐ | #26 | Mới merge `/api/health`. Chưa thấy deploy Cloud Run, Vercel, Redirect URLs (cần `gcloud`, Thiện xác nhận cổng G2) |
| TH-19 | Pipeline deploy: Dockerfile, 2 image, staging, smoke, duyệt production | 14:30 → 16:15 | 🔄 | #75 (mở) | **Chưa merge, vì merge là workflow `deploy` tự chạy.** Có `Dockerfile` 3 stage, `.dockerignore`, `output: "standalone"`, `deploy.yml` (2 image từ cùng commit ⇒ staging ⇒ smoke ⇒ `production` chờ Thiện duyệt), xác thực GCP bằng WIF. Chưa chạy `docker build` (lần build đầu trên GitHub Actions). **Trước khi merge còn thiếu:** Environment `production` có Required reviewers; biến `SUPABASE_DEV_URL`, `SUPABASE_DEV_ANON_KEY` và secret `SMOKE_BOT_EMAIL`, `SMOKE_BOT_PASSWORD`; service `simplifey-staging` đã tồn tại |
| TH-05 | Bảng DB, kết nối Postgres, lỗi API, log | 14:30 → 15:30 | ✅ | #16, #18 | #18 là sửa bổ sung: cho phép log lời gọi AI bản tối giản |
| TH-06 | Đăng nhập GitHub và `/api/me` gọi 1 lần | 15:30 → 16:15 | ✅ | #20 | Làm sớm hơn kế hoạch. Phát có thể bật nút đăng nhập thật ở PH-04 |
| TH-07 | `/api/ingest`, phiên học, snapshot và cache RAM (engine giả) | 16:15 → 17:00 | ✅ | #38 | Làm sớm. Mở khóa route của Nhân. Engine giả `stub.ts` xóa ở TH-10. Kiểm trên Postgres tạm (PGlite), **chưa thử Supabase thật**; chưa thử 2 request song song cùng repo; `loadSessionProgress` là bản tạm |
| TH-08 | Tầng 0 phần A: link, kiểm repo, tải zip | 17:00 → 18:00 | ✅ | #59 | Làm sớm. `url.ts`, `probe.ts`, `download.ts` và test; đã gọi GitHub thật trên repo Spring (tải 510 KB, ghim SHA). Thêm `probeErrorCode`, `EntryClass.NO_GRAMMAR` ngoài phiếu |
| TH-09 | Tầng 0 phần B: giải nén, lọc, che secret, chọn file, vân tay tối giản | 18:00 → 19:15 | ✅ | #66 | Minh làm giúp Thiện (nhánh `minh/th-09`). Đủ 7 file Tầng 0 phần B; 877 test xanh; đã chạy thật `runIngest` ⇒ `buildGraph` trên 3 repo (19 bài mỗi repo, 0 `parse_error`). **Thiếu** test T-ING-26 (che khối private key) vì bộ quét secret chặn commit; `archetype` vẫn được tính (khác phiếu) |
| TH-10 | Ghép engine thật, lát dọc 1, deploy và kiểm Vertex AI | 19:15 → 20:00 | ◐ | #74 | Xong Step 1–3: `/api/ingest` dùng `runEngine` thật, xóa `stub.ts`, thêm `src/instrumentation.ts` (D-66: thiếu `GEMINI_BACKEND` thì lỗi lúc khởi động); 929 test và `npm run build` xanh; chạy thật trên repo Spring: 19 bài, `ingest_ms` 1737, `engine_ms` 412. **Chưa làm:** Step 4 lát dọc 1 qua giao diện (cổng G4) và Step 5 deploy Cloud Run + kiểm Vertex AI (cổng G3), cần máy, tài khoản và `gcloud` của Thiện |
| TH-11 | Danh sách phiên, mở lại phiên, API tiến độ | 20:00 → 21:00 | ✅ | #61 | Phát commit hộ. `GET /api/sessions` (1 truy vấn, không đọc `session_snapshots`) và `GET /api/sessions/[id]/progress`; 771 test xanh. Chưa thử trên Supabase thật, chưa ghi thời gian đáp ứng vào sổ đo |
| TH-12 | `progress.ts`: ghi BKT trong transaction, kết thúc run, mở khóa | 21:00 → 22:00 | ✅ | #64 | Làm sớm. `progress.ts` gom ghi tiến độ; chuyển khối tạm của NH-06, NH-07 sang đây (thống nhất với Nhân); thêm `ERR_AI_REJECTED` vào mã thử lại; `last_run` trong `node_state` đã có dữ liệu. Kịch bản A: `DB_OPTIMIZATION` 0.25 ⇒ 0.4202 đúng spec. Ghi `ai_usage` không chờ (trên Cloud Run có thể chậm hoặc mất). Chưa chạy với Postgres thật |
| TH-13 | Trang chủ: "Tiếp tục học" và mở lại phiên | 22:00 → 23:00 | ✅ | #67 | Phát làm hộ. `SessionList.tsx` + gắn vào `page.tsx` khi đã đăng nhập; lỗi tải có "Thử lại"; "Học tiếp" gọi `ingest` của store. Chưa thử tay đủ vòng (đăng nhập, quét, học, tải lại) trên bản thật; không có test cho component |
| TH-14 | Deploy lát dọc 2 và đo lần 1 trên Cloud Run | 23:00 → 23:45 | ⬜ | — | Làm tay |
| TH-15 | API persona và API lịch sử (cho mảng độc lập) | 23:45 → 00:15 | ✅ | #73 | Làm sớm. `POST /api/demo/persona` (cần `DEMO_MODE=true`; production đặt `false` nên persona online chỉ dùng ở máy hoặc staging) và `GET /api/sessions/{id}/history`; 921 test xanh, chưa chạy Postgres thật. Persona không hợp lệ cũng trả `ERR_DEMO_MODE_DISABLED` |
| TH-16 | Diễn tập đường lùi và giao agent trước khi ngủ | 00:15 → 00:30 | ⬜ | — | Làm tay |
| TH-17 | Đóng băng tính năng, Definition of Done, deploy production | 03:30 → 05:00 | ⬜ | — | Làm tay |
| TH-18 | Trực sửa lỗi chặn demo, nộp slide, commit cuối | 05:00 → 09:15 | ⬜ | — | |
| TH-20 | Giảm số lần hỏi DB khi nộp bài (tăng tốc T6) | 21:00 → 22:00, trong TH-12 | 🔄 | #64, nhánh `thien/th-20-it-lan-hoi-db` | Làm cùng TH-12: đọc `graph_skeleton` 1 lần trong transaction nộp bài và bỏ qua câu (bớt 2 lần đọc mỗi lần ghi); ghi `ai_usage` không chờ. Phần còn lại: `loadProgressContext`, `node_progress` đọc 1 lần. Số câu SQL trong transaction của lần nộp kết thúc bài: 11 ⇒ 9 (mock `tx`); cả lần nộp ước 12–14 câu, chưa đạt mốc ≈8. Chưa chạy Postgres thật |
| TH-21 | Cloud Run min-instances, kiểm cache (tăng tốc T4) | 04:00 → 05:00 | ⬜ | — | Làm tay, trên bản đóng băng, cùng NH-16 |

## Minh — Engine Tầng 1–2

| Mã | Tên việc | Giờ | Trạng thái | PR | Ghi chú |
| :-- | :-- | :-- | :-: | :-: | :-- |
| MI-01 | Contracts engine và kiểu nối với Tầng 0 | 12:20 → 13:00 | ✅ | #8 | |
| MI-02 | Parser Tree-sitter, bảng ngôn ngữ, grammar, bộ chạy thử | 13:00 → 14:00 | ✅ | #12 | |
| MI-03 | Danh bạ tên và resolver TS/JS | 14:00 → 15:30 | ✅ | #19 | |
| MI-04 | Đồ thị gọi hàm và điểm entry | 15:30 → 17:00 | ✅ | #33 | Làm sớm. Còn sót ENG-23 phần NestJS `provide/useClass`; Java thuộc MI-08 |
| MI-05 | Lát cắt, node và tên bài | 17:00 → 18:30 | ✅ | #42 | Làm sớm. Thêm `complexity.ts`, `slice-lines.ts`; sửa lỗi `<module>` trùng khoảng dòng của MI-04 |
| MI-06 | Khử chu trình, xếp hạng, giữ tối đa 20 bài, nhóm và cạnh, điểm nhập engine | 18:30 → 19:30 | ✅ | #48, #70 | `buildGraph` (#48) và `src/server/engine/index.ts` với `runEngine` nối Tầng 0 và `buildGraph` (#70, chữ ký trùng `stub.ts`). Đo trên máy: Spring `ingest_ms` 2890 + `engine_ms` 567; Express 1318 + 308 (chưa đo Cloud Run). **Chưa đổi import** trong `/api/ingest` và chưa xóa `stub.ts` (thuộc TH-10) |
| MI-07 | Chạy repo TS dự phòng, sửa bài lỗi, test tất định | 19:30 → 20:30 | ✅ | #57 | Làm sớm, gộp với phần chạy máy của MI-09. Sửa bài 1 bước, bước rỗng, tầng sai, tên `GET /user`. **Đổi `node_id` của bài `GET /user`**. Còn chờ Nhân đọc 3 bài (tiêu chí MI-07) |
| MI-08 | Java và Spring Boot cho repo demo Q-03 | 20:30 → 23:00 | ✅ | #52 | Làm sớm. Thử trên `spring-boot-realworld-example-app`: 116 file, 19 bài, 15 cạnh. MyBatis `@Mapper` tính là `DATA_SINK` (spec không nhắc) |
| MI-09 | Sửa theo repo demo đã chốt và các dòng engine của DoD | 23:00 → 00:30 | ◐ | #57 | Xong phần chạy máy: DoD engine trên 3 repo (Spring 19 bài, Express 19, NestJS 20) đạt các dòng 1, 2, 3, 17. **Chưa làm:** đồng hồ `ingest_ms + engine_ms` (cần `/api/ingest` thật, TH-10), kiểm trên Cloud Run, sửa theo repo demo đã chốt |
| MI-10 | Bàn giao engine trước khi ngủ | 00:30 → 01:00 | ⬜ | — | Làm tay |
| MI-11 | Kiểm engine theo DoD và sửa lỗi chặn demo | 04:00 → 05:30 | ⬜ | — | Mẫu sửa lỗi |
| MI-12 | Slide thuyết trình (người chính) và đoạn video Offline | 05:30 → 07:30 | ⬜ | — | Làm tay. Phát cần slide lúc 08:00 (PH-15) |
| MI-13 | Tập bấm demo và commit cuối | 07:30 → 09:00 | ⬜ | — | Mẫu sửa lỗi |

## Nhân — AI + BKT

| Mã | Tên việc | Giờ | Trạng thái | PR | Ghi chú |
| :-- | :-- | :-- | :-: | :-: | :-- |
| NH-01 | Contracts AI, người học và gọi thử Gemini | 12:20 → 13:00 | ✅ | #1 | |
| NH-02 | Fixture phản hồi AI cho giao diện | 13:00 → 13:30 | ✅ | #7 | |
| NH-03 | Hàm thuần: BKT, kế hoạch câu hỏi, trạng thái node, độ giống, bộ lọc an toàn | 13:30 → 15:00 | ✅ | #5 | |
| NH-04 | Lời gọi Gemini, hạn mức token, cổng gác bản nới | 15:00 → 16:45 | ✅ | #14 | |
| NH-05 | `analyze-node`: X-Ray có điểm dở thật | 16:45 → 18:30 | ✅ | #28, #46 | Lõi phân tích (#28), sửa gọi Vertex express, chuyển model 3.8-flash → flash-lite; route `analyze-node` (#46, đọc cache trước, gộp request cùng node). Cloud Run cần `GEMINI_BACKEND=vertex` + secret `GEMINI_API_KEY` |
| NH-06 | `enrich-node`: câu hỏi dễ hiểu cho người mới | 18:30 → 20:30 | ✅ | #31, #46 | Lõi (#31) và route `enrich-node` (#46). `createRun` đã chuyển sang `progress.ts` ở #64; `ERR_AI_REJECTED` đã nằm trong mã thử lại |
| NH-07 | `evaluate-feynman` và `reveal`: chấm bài không khóa gắt | 20:30 → 22:30 | ✅ | #34, #53 | Lõi chấm bài và luật Đạt nới (#34); `evaluate.ts`, `reveal.ts` và 2 route (#53); khối ghi DB tạm đã chuyển sang `progress.ts` ở #64. Chưa có `redactSecrets` (chỉ che PII). Chưa gọi Gemini thật |
| NH-08 | Ghép lát dọc 2 và chạy bài thử "giám khảo" | 22:30 → 23:30 | ◐ | #39, #69 | Câu hỏi mồi (#39, `PROMPT_VERSION` 1.3.0) và rút gọn đề NOVICE theo duyệt tay (#69, 1.5.0: tối đa 25 từ, không hỏi "vì sao"). Đã chạy Gemini thật 5 bài shop-api: 13/14 câu dùng được, 7/7 bài thử "giám khảo" phía server. **Chưa làm:** ghép lát dọc 2 trên giao diện. Đổi `PROMPT_VERSION` làm cache phân tích cũ không còn dùng |
| NH-09 | Giải thích đoạn chọn phía server | 23:30 → 00:30 | ✅ | #32, #46 | Làm sớm. Lõi (#32) và route `explain-selection` có cắt lại vùng chọn từ snapshot (#46). #46 cũng sửa lỗi cộng token 2 lần. Chưa gọi Gemini thật |
| NH-10 | Logic Offline và script ghi bundle; giữ quyền merge | 00:30 → 02:30 | ✅ | #37, #50, #62 | Làm sớm: `offline.ts` (#37), `scripts/record-bundle.ts` (#50), bản 2 bước (#62: `--chi-cau-hoi` ghi câu hỏi, `--answers` chấm tiếp). Script **chưa chạy thật** (cần server và tài khoản demo, làm ở NH-12). Còn quyền merge 00:30–03:30 |
| NH-11 | Duyệt tay output AI trên repo demo đã chốt | 02:30 → 04:00 | ◐ | #62 | Mới có công cụ `scripts/xem-bundle.ts` (đổi bundle thành `duyet-ai.md` có ô duyệt). **Chưa duyệt tay** output AI trên repo demo |
| NH-12 | Ghi bundle Offline trên bản đóng băng | 04:00 → 05:00 | ⬜ | — | Làm tay |
| NH-13 | Tập nói và commit cuối | 08:30 → 09:00 | ⬜ | — | Mẫu sửa lỗi |
| NH-14 | Chấm bài và giải thích đoạn chọn dùng flash-lite (T1) | ngay (làm sớm) | ✅ | #65 | Chấm bài và giải thích đoạn chọn dùng flash-lite (`LLM_MODEL_BY_KIND`). Đo thật trên câu 1 N3 (6 cặp): flash-lite 1,4–1,9 s, 3.8-flash 3,0–4,4 s, quyết định Đạt/Chưa đạt giống nhau; 3.8-flash gặp 1 lần 429 |
| NH-15 | Giới hạn thời gian chờ (T2) | ngay sau NH-14 | ✅ | #65 | `LLM_LITE_TIMEOUT_MS` 10 s; thử lại gọi thẳng flash-lite (cả `analyze.ts`, `questions.ts`). Xấu nhất theo code: `GRADE`/`EXPLAIN` ≈ 20,5 s, `ANALYZE`/`QUESTIONS` ≈ 32,5 s, **chưa khớp "~25 giây" của kế hoạch**; cả nhóm chưa quyết hạ `LLM_PRIMARY_TIMEOUT_MS` hay bỏ fallback ở lượt đầu |
| NH-16 | Làm nóng cache repo demo (T4) | 04:00 → 05:00 | ⬜ | — | Làm tay, trên bản đóng băng, cùng NH-12 |

## Phát — Giao diện trang học

| Mã | Tên việc | Giờ | Trạng thái | PR | Ghi chú |
| :-- | :-- | :-- | :-: | :-: | :-- |
| PH-01 | Token giao diện, chủ đề tối/sáng, font, thành phần cơ bản | 12:20 → 13:00 | ✅ | #2 | |
| PH-02 | Client API, store duy nhất, bảng thông điệp lỗi | 13:00 → 14:15 | ✅ | #11, #21 | #21 bổ sung: ingest nạp fixture `shop-api` ở chế độ `?fixture=1` |
| PH-03 | Fixture bản đồ `shop-api` | 14:15 → 14:45 | ✅ | #13 | |
| PH-04 | Trang chủ tối thiểu: đăng nhập, ô link, thả zip, đồng hồ quét | 14:45 → 15:45 | ✅ | #17, #40 | #40 bổ sung: nối nút Đăng nhập GitHub thật. Chưa thử đủ vòng OAuth; cần `/auth/callback` trong Supabase Redirect URLs |
| PH-05 | Khung trang học 3 cột, thanh trên, bản đồ bài học | 15:45 → 17:15 | ✅ | #23, #22 | #22 thêm `CONFIG.UI_PANE_WIDTHS_PCT` vào contracts (Thiện đã merge) |
| PH-06 | Khung code Monaco, tab theo file, code theo bước | 17:15 → 18:30 | ✅ | #27 | Làm sớm. `CodeSnippetViewer` chưa gắn vào `LearnShell` |
| PH-07 | Tour X-Ray: thẻ vai trò, từng bước, tóm tắt; hàng phân tích | 18:30 → 19:45 | ✅ | #30 | Làm sớm. **Chưa gắn** `LearnSidePanel` vào cột phải `LearnShell` (cột giữa và cột phải vẫn là chỗ giữ chỗ). Thanh mài mòn chưa thử vì fixture không có `profile` |
| PH-08 | Feynman: câu hỏi, ô trả lời, kết quả trong cột, gợi ý, đáp án mẫu | 19:45 → 21:45 | ✅ | #36, #58 | Làm sớm. #58 bổ sung: `?fixture=1` chạy được kịch bản A3–A6 trên bài N3 (bundle ghép từ fixture NH-02, chạy trên `offline.ts`, điểm 0.4202 và 0.5767 khớp spec); câu gõ phải gần như y hệt kịch bản. Test: `fixture-scenario.test.ts`. Chưa thử bằng trình duyệt |
| PH-09 | Áp kết quả: đổi trạng thái node, mở khóa, toast, mài mòn | 21:45 → 22:45 | ✅ | #43 | Làm sớm. Gọi `GET /api/sessions/{id}/progress` (chưa có, TH-11). Tiêu chí đạt bản thật (học xong N3, 1 lần `/api/me`) chưa thử vì chưa có route chấm bài |
| PH-10 | Nút "Giải thích" cho đoạn bôi đen | 22:45 → 23:45 | ✅ | #44, #47 | Làm sớm. #47 bổ sung: gắn `CodeSnippetViewer` vào `LearnShell`. Thử bằng `?fixture=1`; API thật (route `explain-selection` đã có từ #46) chưa thử |
| PH-11 | Tổng quan nhịp 1, ô persona, menu tài khoản, kiểm dưới 1024 px | 23:45 → 02:00 | ✅ | #51 | Làm sớm. Có sửa `CodeSnippetViewer` ngoài danh sách (cột giữa hiện Tổng quan khi chưa chọn bài). Kiểm 375 px bằng Chrome headless. Chưa thử với Supabase/API thật (xóa tài khoản, `/api/demo/persona` chờ TH-15); chưa có test cho `overview-view.ts` (toast đã sửa ở #55) |
| PH-12 | Nối giao diện Offline | 02:00 → 03:00 | ✅ | #49 | Làm sớm. `Ctrl+Shift+D` và `?offline=1` chạy, bundle hỏng thì rơi về chế độ thật. **Chưa thử với bundle thật** (`mock_bundle.json` chưa có) (toast đã sửa ở #55; `setOfflinePersona` dựng lại hồ sơ và tiến độ ở #58) |
| PH-13 | So ảnh với `prototype.html` và sửa lệch | 03:00 → 04:00 | ✅ | #56 | Làm sớm. 6/6 cặp ảnh khớp 4 điều (chụp 1366×768, chủ đề tối, bằng API giả vì lúc đó fixture chưa tới được Feynman). Sửa 1 lỗi CSS: quy tắc `button` ngoài `@layer` thắng class Tailwind, đưa vào `@layer base`. Nên chụp lại cặp 4–6 bằng `?fixture=1` mới (#58) |
| PH-14 | Sửa lỗi giao diện sau DoD và quay video dự phòng | 04:00 → 05:00 | ⬜ | — | Mẫu sửa lỗi |
| PH-15 | Tập bấm demo và commit cuối | 08:00 → 09:00 | ⬜ | — | Mẫu sửa lỗi |
| PH-16 | Tính trước phân tích và câu hỏi (T3) | sau phiếu đang làm, xong trước 22:30 | ✅ | #71 | Làm sớm. Sau `ingest` thật tính trước tối đa 3 bài `AVAILABLE` đầu (phân tích), phân tích xong thì tính ngầm câu hỏi, bài vừa mở khóa vào hàng tính trước. Offline và fixture 0 request. 19 test mới (`prefetch.test.ts`). **Chưa thử với API thật** (cần TH-10) nên chưa có số đo "chờ câu hỏi: ? → ?" |
| PH-17 | Báo từng bước khi chờ (T5) | sau PH-16, nếu còn giờ (trước 04:00) | ✅ | #72 | Làm sớm. Tóm tắt hiện khung "Điểm hay/Điểm dở" khi chờ AI; nút nộp đổi chữ theo thời gian chờ (3 s, 6 s); "Thường mất khoảng 10 giây". Chỉ sửa giao diện. Mới kiểm `/learn?fixture=1` biên dịch được, chưa thử tay với AI thật |

## Quý — Mảng độc lập (dùng Codex)

| Mã | Tên việc | Giờ | Trạng thái | PR | Ghi chú |
| :-- | :-- | :-- | :-: | :-: | :-- |
| QU-01 | Khung trang Cách học | 12:20 → 13:00 | ✅ | #6 | |
| QU-02 | Nội dung 4 bước cách học và câu hỏi thường gặp | 13:00 → 15:00 | ✅ | #9 | |
| QU-03 | 16 thẻ khái niệm viết tay | 15:00 → 17:30 | ✅ | #10 | |
| QU-04 | Áp phích của đội (bản nháp) | 17:30 → 19:00 | ⬜ | — | Làm tay, không dùng Codex |
| QU-05 | Trang Lịch sử nộp bài với dữ liệu mẫu | 19:00 → 21:30 | ✅ | #15 | Làm sớm hơn kế hoạch |
| QU-06 | Trang Lịch sử nối API thật, trạng thái lỗi | 00:30 → 02:30 | ⬜ | — | Cần TH-15 (API lịch sử) |
| QU-07 | Áp phích bản cuối có ảnh sản phẩm thật | 02:30 → 04:00 | ⬜ | — | Làm tay |
| QU-08 | Hoàn thiện mảng độc lập và commit cuối | 04:00 → 09:00 | ⬜ | — | |

## Cổng và mốc cần canh

| Cổng | Giờ | Điều kiện | Tình trạng |
| :-- | :-- | :-- | :-- |
| G1 | 13:00 | Đủ 5 người có commit | ✅ Cả 5 đã có PR merge (xem `git shortlog -sn`) |
| G2 | 14:00 | Cloud Run sống (TH-04) | ❓ Mới có `/api/health`. Thiện xác nhận deploy |
| GP | 20:00, 00:00 | Pipeline deploy (TH-19) | ⬜ #75 đã viết, chưa merge, thiếu điều kiện trước khi merge (xem TH-19) |
| G3 | 20:15 | Vertex AI (TH-10) | ⬜ Nhân đã chạy thử Vertex express từ máy (số đo trong #28, #65, #69); chưa thử từ Cloud Run |
| G4 | 20:00 | Lát dọc 1 (TH-10) | ⬜ Code đã đủ: engine thật (#74, #70, #66), route AI, API phiên và tiến độ, toàn bộ giao diện học và tính trước. **Còn lại:** chạy lát dọc 1 qua giao diện trên máy (Step 4 của TH-10) |
| G7 | 04:00 | Đóng băng tính năng | ⬜ |

## Nhật ký cập nhật

| Lúc | Ai | Việc |
| :-- | :-- | :-- |
| 07/11 14:30 | Phát | Lập bảng, điền trạng thái theo PR đã merge trên `main` (PR #1 → #23) |
| 07/11 15:30 | Phát | Cập nhật tới PR #34: thêm trạng thái ◐; đổi TH-06, MI-04, PH-06, PH-07 sang ✅; NH-05, 06, 07, 09 và TH-04 sang ◐; thêm mục điểm nghẽn |
| 07/11 15:45 | Phát | Cập nhật tới PR #36: PH-08 sang ✅ (ghi rõ A3–A6 trên fixture chưa chạy được); cập nhật G4; ghi PR #40 đang mở |
| 07/11 16:20 | Phát | Cập nhật tới PR #44: TH-07, MI-05, PH-09, PH-10 sang ✅; PH-04 thêm #40; NH-10 sang ◐ (#37); NH-08 sang 🔄 (#39 đang mở); viết lại mục điểm nghẽn |
| 07/11 16:55 | Phát | Cập nhật tới PR #52: MI-08, NH-05, NH-06, NH-09, PH-11, PH-12 sang ✅; MI-06 sang ◐; NH-07 sang 🔄 (#53); NH-10 thêm #50; viết lại mục điểm nghẽn (thêm lỗi toast) |
| 07/11 17:25 | Phát | Cập nhật tới PR #58: MI-07, PH-13 sang ✅; MI-09 sang ◐; TH-08 sang 🔄 (#59); PH-08 thêm #58; ghi #55 đã sửa lỗi toast; viết lại mục điểm nghẽn |
| 07/11 18:50 | Phát | Cập nhật tới PR #67: thêm 7 phiếu tăng tốc (75 phiếu); TH-11, TH-12, TH-13, NH-07, NH-10 sang ✅; TH-20, NH-08, NH-11 sang ◐; TH-09, NH-14, NH-15 sang 🔄; viết lại mục điểm nghẽn |
| 07/11 19:35 | Phát | Cập nhật tới PR #72: TH-09, MI-06, PH-16, PH-17 sang ✅; TH-15 sang 🔄 (#73); NH-08 sang 🔄 (#69); viết lại mục điểm nghẽn (TH-10 và hạ tầng deploy là việc còn lại của G4) |
| 07/11 20:05 | Phát | Cập nhật tới PR #74: TH-15, NH-14, NH-15 sang ✅; TH-10 sang ◐ (#74); NH-08 sang ◐; TH-19 sang 🔄 (#75, chưa merge); viết lại điểm nghẽn và cổng G3, G4, GP |
