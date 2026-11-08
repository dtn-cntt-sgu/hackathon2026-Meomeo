# 05 — HẠ TẦNG GOOGLE CLOUD RUN, STAGING S2 & TRIỂN KHAI (D-64)

> Quy định cấu hình production, staging S2, CI/CD, bảo mật mạng, đóng gói Docker và bản dự phòng Vercel cho SimpliFey V2 Pro.
> Nguồn chân lý hạ tầng: Mọi giá trị tài nguyên, thông số triển khai Cloud Run và Vercel chỉ ghi tại file này. Tham chiếu kiến trúc tổng thể: [`04_KIEN_TRUC_TRIEN_KHAI.md`](04_KIEN_TRUC_TRIEN_KHAI.md). API & Biến môi trường: [`03_API_VA_LUU_TRU.md`](03_API_VA_LUU_TRU.md).

---

## Đọc nhanh

- **Host chính Google Cloud Run, region `asia-southeast1`:** URL mặc định `*.run.app`, HTTPS tự động, không bật Cloud Armor. Bản dự phòng: Vercel `sin1` (Phương án C).
- **Cấu hình:** Production (`simplifey-prod`: `min-instances = 1`, `max-instances = 4`, `DEMO_MODE="false"`); Staging S2 (`simplifey-staging`: `min-instances = 0`, `max-instances = 2`, `DEMO_MODE="true"`). Đều dùng 1 vCPU, 2 GiB RAM, concurrency 40, timeout 300s, Startup CPU Boost.
- **CI/CD & Staging S2:** GitHub Actions deploy staging tự động khi merge `main`, chạy smoke test (`/api/health` và ingest repo demo Q-03 với token bot); duyệt thủ công bởi Vai A để deploy production; xác thực GCP qua Workload Identity Federation (dự phòng key JSON).
- **Bảo mật:** `roles/run.invoker` cho `allUsers`, service account runner riêng (`simplifey-runner`, `simplifey-staging-runner`), bí mật lưu trong Secret Manager.
- **Đóng gói:** Chiến lược đi giữa, đầu giờ deploy `gcloud run deploy --source`, thử nghiệm Dockerfile trên nhánh riêng đến giờ cắt H+15 (03:00 sáng). Sau merge Dockerfile: build container image 1 lần push Artifact Registry, dùng chung image cho staging và production.
- **Healthcheck & Smoke test:** Endpoint `GET /api/health` trả HTTP 200 text/plain `ok`, không xác thực, không DB, không AI; dùng cho startup probe và smoke test.

---

## 1. Cấu hình Production và Staging S2

Quy chuẩn cấu hình dịch vụ SimpliFey trên Google Cloud Run:

| Mục | Production (`simplifey-prod`) | Staging S2 (`simplifey-staging`) | Ghi chú quy chuẩn |
| :-- | :-- | :-- | :-- |
| **Region** | `asia-southeast1` (Singapore) | `asia-southeast1` (Singapore) | Cùng vùng với Supabase Postgres AWS Singapore (`ap-southeast-1`). |
| **Tài nguyên** | 1 vCPU, 2 GiB RAM | 1 vCPU, 2 GiB RAM | Đủ giải nén zip trong RAM (`CONFIG.MAX_STREAM_BYTES`) và chạy Tree-sitter WASM. |
| **Số bản sao** | `min-instances = 1`, `max-instances = 4` | `min-instances = 0`, `max-instances = 2` | Prod giữ 1 bản sao ấm chống cold-start; staging co về 0 tiết kiệm chi phí, trần 2 kiểm soát tải. |
| **Concurrency** | 40 | 40 | Tối đa 40 request đồng thời / container bảo toàn RAM khi stream zip. |
| **Request Timeout** | 300s | 300s | Giới hạn 300 giây xử lý request ingest và gọi chuỗi AI. |
| **Cấp phát CPU** | Request-based (chỉ cấp khi có request) | Request-based (chỉ cấp khi có request) | Chỉ tính CPU khi xử lý yêu cầu HTTP. |
| **Startup CPU Boost** | Bật | Bật | Cấp thêm CPU lúc khởi động giúp nạp grammar Tree-sitter nhanh. |
| **Ingress Control** | `all` (Allow all traffic) | `all` (Allow all traffic) | Cho phép truy cập công khai từ Internet. |
| **Quyền gọi Service** | Gán `roles/run.invoker` cho `allUsers` | Gán `roles/run.invoker` cho `allUsers` | Cho phép người dùng truy cập web mà không cần đăng nhập IAM. |
| **Service Account** | `simplifey-runner@<project>.iam.gserviceaccount.com` | `simplifey-staging-runner@<project>.iam.gserviceaccount.com` | Service account riêng biệt theo nguyên tắc đặc quyền tối thiểu. |
| **Kênh gọi AI (Vertex AI)** | `location: "global"`, service account `roles/aiplatform.user` | `location: "global"`, service account `roles/aiplatform.user` | Gọi qua SDK `@google/genai` endpoint `global`, không dùng `GEMINI_API_KEY` trên Cloud Run (D-66). |
| **Biến `GEMINI_BACKEND`** | `"vertex"` | `"vertex"` | Chọn kênh gọi AI; bản dự phòng Vercel đặt `"studio"` (D-66). |
| **Biến `AI_DISABLED`** | `"false"` | `"false"` | Đặt `"true"` khi cần ngắt khẩn cấp AI (nhận cảnh báo ngân sách 100 %, D-66). |
| **Google Cloud Budget Alert** | Ngân sách $20.00 / tháng (ước tính); các mốc cảnh báo 50 % ($10.00), 80 % ($16.00), 100 % ($20.00) | Dùng chung project GCP với Production | Cảnh báo chi phí qua email/channel; nhận mốc 100 % thì Vai A đặt `AI_DISABLED="true"` (D-66). |
| **Secret Manager** | Nạp secret của project Supabase production | Nạp secret của project Supabase dev/staging | Tách biệt hoàn toàn bí mật giữa môi trường staging và production. |
| **Cờ `DEMO_MODE`** | `false` | `true` | Staging bật để kiểm thử menu Persona; production tắt bảo vệ toàn vẹn dữ liệu. |
| **Tên miền & HTTPS** | URL mặc định `*.run.app` | URL mặc định `*.run.app` | HTTPS do Google cấp phát tự động; không dùng domain riêng, không bật Cloud Armor. |
| **Startup Healthcheck** | HTTP GET `/api/health` | HTTP GET `/api/health` | Startup probe (timeout 5s, failureThreshold 3); không đăng nhập, không gọi DB, không gọi AI. |
| **Rollback revision** | Traffic Management điều hướng 100% về revision cũ | Traffic Management điều hướng 100% về revision cũ | Phục hồi tức thì về revision ổn định trước đó khi deploy mới có sự cố. |
| **Uptime Check** | HTTP Uptime Check trong Cloud Monitoring (1 phút) | Không bật | Prod giám sát khả dụng liên tục mỗi 1 phút. |
| **Kết nối Supabase** | Driver `postgres` 3.x với `max: 5` kết nối / bản sao qua Supavisor (port 6543) | Driver `postgres` 3.x với `max: 5` kết nối / bản sao qua Supavisor (port 6543) | Prod tối đa 20 kết nối client (4 bản sao × 5); Staging tối đa 10 kết nối client (2 bản sao × 5) (D-65). |

---

## 2. Bảo mật mạng và danh tính

- **Ingress & Mạng:** Đặt `ingress = all` cho phép lưu lượng truy cập công khai qua cổng HTTPS/TLS tự động; ứng dụng nằm dưới sự bảo vệ chống DDoS mặc định tại Edge Ingress của Google Cloud, không cần thiết lập Cloud Armor hay Load Balancer phức tạp.
- **Quyền gọi (Invoker):** Gán role `roles/run.invoker` cho `allUsers` trên Cloud Run service để người học truy cập web bình thường.
- **Danh tính dịch vụ (Service Account):** Container chạy dưới danh tính riêng biệt (`simplifey-runner` cho production, `simplifey-staging-runner` cho staging), chỉ được cấp duy nhất role `roles/aiplatform.user` để tương tác với Vertex AI API (D-66); không dùng Compute Engine default service account.
- **Quản lý khóa bí mật:** Toàn bộ chuỗi bí mật server (`DATABASE_URL`, `GITHUB_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`) lưu trữ trong **Secret Manager** và được Cloud Run nạp tự động thành biến môi trường runtime; không lưu khóa tĩnh trong mã nguồn, Dockerfile hay file `.env`.

---

## 3. Đóng gói đi giữa & Kế hoạch Dockerfile

- **Chiến lược đi giữa:**
  - Đầu vòng thi (H+0): Deploy ứng dụng bằng lệnh `gcloud run deploy --source` để Google Cloud Build tự động build qua Buildpacks và triển khai ngay bản chạy được.
  - Viết và thử nghiệm `Dockerfile` trên **nhánh riêng** (ví dụ `feature/docker-packaging`), không commit trực tiếp lên `main` vì Cloud Build sẽ tự động ưu tiên build theo `Dockerfile` thay vì Buildpack nếu phát hiện file này trong thư mục gốc.
  - **Giờ cắt H+15 (03:00 sáng):** Nếu `Dockerfile` build và chạy ổn định trên nhánh riêng trước H+15 thì tiến hành merge vào nhánh chính; nếu đến mốc H+15 chưa hoàn thiện thì dừng lại và giữ nguyên phương thức deploy `--source` qua Buildpacks để bảo toàn thời gian kiểm thử trước mốc đóng băng H+17.
- **Yêu cầu Dockerfile multi-stage & Promote Image:**
  - Image gốc `node:22-slim` cho cả 3 stage (D-68); sử dụng multi-stage build gồm 3 stage: `deps` (`npm ci` cài đặt đầy đủ dependencies bao gồm cả devDependencies), `builder` (`npm run build` với Next.js cấu hình `output: "standalone"`), và `runner` (chỉ sao chép kết quả build và file tĩnh cần thiết).
  - Khởi tạo người dùng riêng không có quyền root (`USER nextjs:nodejs`, UID/GID 1001) trong stage runner.
  - Sao chép toàn bộ thư mục `public/` (chứa các grammar Tree-sitter WebAssembly `public/grammars/*.wasm`) vào stage runner để adapter phân tích cú pháp truy cập file `.wasm` cục bộ qua `fs.readFile`; chép thêm thư mục `queries/` (truy vấn Tree-sitter `queries/<lang>.scm`, D-70) vào cùng thư mục làm việc của stage runner.
  - Thiết lập `.dockerignore` loại bỏ: `.git`, `.next`, `node_modules`, `.env*`, `archive`, `.kb`, `review`, `pitch`.
  - Sau khi Dockerfile được merge (D-72): từ cùng một commit build song song **2 image**, push lên Artifact Registry: `asia-southeast1-docker.pkg.dev/$PROJECT_ID/simplifey/app:$GITHUB_SHA-staging` (build arg Supabase dev/staging, `NEXT_PUBLIC_DEMO_MODE=true`) và `...:$GITHUB_SHA-prod` (Supabase production, `NEXT_PUBLIC_DEMO_MODE=false`). Deploy staging bằng `--image` theo digest ⇒ smoke test ⇒ Vai A duyệt ⇒ deploy production bằng image prod theo digest ⇒ `GET /api/health` trên production. Lý do: Next ghi cứng `NEXT_PUBLIC_*` lúc build nên 1 image chỉ trỏ được 1 project Supabase.

---

## 4. Bản dự phòng Vercel (Phương án C)

- **Bản Node:** Vercel chọn Node 22.x theo `engines` trong `package.json` (D-68).
- **Biến môi trường:** Cấu hình trên Vercel Project Settings; riêng AI sử dụng `GEMINI_BACKEND="studio"` kèm `GEMINI_API_KEY` (AI Studio), không dùng service account.
- **Redirect URLs Supabase:** Bắt buộc khai báo cả 2 domain trong Supabase Auth (Authentication > URL Configuration > Redirect URLs): `https://<app>.run.app/auth/callback` và `https://<app>.vercel.app/auth/callback` (kèm `http://localhost:3000/**`).
- **Dấu hiệu chuyển:** Cloud Run gặp lỗi 5xx liên tiếp 2 lần, tài khoản GCP bị khóa thanh toán / vượt quota, hoặc gián đoạn kết nối > 15s.
- **Cách chuyển khi demo:** Trình duyệt máy demo mở sẵn 2 tab (Tab 1 Cloud Run, Tab 2 Vercel đã đăng nhập sẵn); khi có sự cố chuyển chuột sang Tab 2 (< 5 giây), không sửa DNS hay deploy lại.

---

## 5. CI/CD, Xác thực GCP & Staging S2

- **Xác thực GCP từ GitHub Actions:**
  - Phương án chính: **Workload Identity Federation** (WIF) thiết lập trước ngày thi; trao đổi token OIDC ngắn hạn để lấy token truy cập GCP, không lưu khóa bí mật dài hạn.
  - Phương án dự phòng: Service Account Key JSON lưu trong GitHub Secret `GCP_SA_KEY` (chuyển sang dùng ngay nếu WIF gặp sự cố trong phòng thi).
  - Quyền IAM cấp cho tài khoản deploy (`github-deployer`):
    + Giai đoạn `--source`: `roles/run.sourceDeveloper` (trên project), `roles/serviceusage.serviceUsageConsumer` (trên project), `roles/iam.serviceAccountUser` (trên runner service account của service).
    + Giai đoạn `--image`: thêm `roles/artifactregistry.writer` (trên repository Artifact Registry) và `roles/run.developer` (trên phạm vi 2 service).
- **Smoke test tự động trên Staging S2:**
  - Thực hiện sau khi deploy staging hoàn tất:
    1. Probe kiểm tra sức khỏe: `GET https://simplifey-staging-xxxx.asia-southeast1.run.app/api/health` (HTTP 200 text/plain `ok`, timeout 10s dự phòng cold-start khi `min-instances = 0`).
    2. Ingest thử nghiệm repo demo: `POST https://simplifey-staging-xxxx.asia-southeast1.run.app/api/ingest` với repo demo thật theo Q-03.
       - Gửi header `Authorization: Bearer <access_token>` theo chuẩn API-04.
       - Lấy token bot: Step tiền xử lý của GitHub Actions gọi Supabase Auth API (`grant_type=password`) với tài khoản bot test trên project dev/staging (mật khẩu bot lưu trong GitHub Secrets).
       - Bật đăng nhập Email chỉ trên project dev/staging để bot lấy token; production vẫn chỉ GitHub OAuth.
       - Điều kiện đạt: HTTP 200, phản hồi có `session_id`, `result.nodes.length >= CONFIG.DISPLAY_MIN_NODES`.
  - Smoke test thất bại ⇒ dừng pipeline, chặn mở cổng duyệt deploy production.
- **Mô hình D2 (2 project Supabase):**
  - Project Dev/Staging: Dùng chung cho Local Dev và Staging S2 (`simplifey-staging`). Bật Email provider cho bot smoke test.
  - Project Production: Dành riêng cho Production (`simplifey-prod`) và Vercel dự phòng. Chỉ bật GitHub OAuth.
  - Migration DB: Áp dụng trên project Dev/Staging trước; sau khi staging đạt mới áp dụng sang Production.
- **Thứ tự lùi khi hỏng sát demo:**
  1. Rollback revision trên Cloud Run `simplifey-prod` (về revision ổn định gần nhất).
  2. Sử dụng revision tag của Staging S3 (`--no-traffic --tag stable`).
  3. Phương án C: Chuyển tab sang Vercel dự phòng (< 5 giây).
  4. Chế độ Offline (`Ctrl+Shift+D`).

---

## 6. Vertex AI & Quản lý Ngân sách Cloud (D-66)

- **Cấu hình Vertex AI:** Cloud Run production và staging gọi Gemini (`gemini-3.5-flash-lite`) qua Vertex AI endpoint `location: "global"`, xác thực qua service account runner mang quyền `roles/aiplatform.user`. Khởi tạo SDK `@google/genai` với `{ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: "global" }`. Biến môi trường `GEMINI_BACKEND="vertex"`. Tuyệt đối không khai báo `GEMINI_API_KEY` trên Cloud Run.
- **Chính sách Budget Alert (Cảnh báo ngân sách GCP):**
  - Thiết lập Cloud Billing Budget gắn với project GCP với ngân sách trần **$20.00 / tháng** (ước tính).
  - 3 mốc cảnh báo tự động:
    + **50 % ($10.00):** Gửi email thông báo cho toàn đội để chủ động theo dõi lượng truy cập.
    + **80 % ($16.00):** Gửi email cảnh báo mức độ cao; đội ngũ chuẩn bị sẵn sàng chuyển hướng các bài test phụ sang chế độ Offline.
    + **100 % ($20.00):** Gửi cảnh báo khẩn cấp. Vai A thực hiện quy trình bán tự động: đặt biến môi trường `AI_DISABLED="true"` trên Cloud Run (`gcloud run services update simplifey-prod --update-env-vars AI_DISABLED="true" --region asia-southeast1`). Khi đó, mọi lời gọi AI trả ngay `ERR_AI_UNAVAILABLE`, nạp repo và Chế độ Offline vẫn hoạt động bình thường.
