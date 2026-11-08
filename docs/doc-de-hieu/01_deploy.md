# Dựng và deploy SimpliFey từng bước

> Viết cho cả nhóm. Làm đúng thứ tự từ trên xuống, xong bước nào đánh dấu bước đó.
> File này chỉ hướng dẫn. Quyết định và con số nằm ở `spec/`. Nếu hai bên khác nhau thì theo `spec/`.
> Bắt buộc đăng nhập GitHub, không có tài khoản khách (D-44). API AI đã chốt theo D-50: Google Gemini model `gemini-3.5-flash-lite`. Web deploy dùng 1 key riêng; mỗi người test local bằng key của mình.

## Đọc xong bạn biết gì

- Hệ thống gồm những phần nào và lấy chúng ở đâu.
- Ai làm việc gì, trước giờ thi và lúc H+0.
- Quy trình CI/CD và vì sao cần duyệt deploy Production.
- Gặp lỗi thì sửa ở đâu.

## 1. Hệ thống gồm 4 phần

Hãy tưởng tượng một người dùng mở web, bấm đăng nhập rồi dán link repo:

1. Trình duyệt mở **web trên Google Cloud Run** (link chính khi demo). Nhóm giữ thêm bản dự phòng trên Vercel (Phương án C) để phòng ngừa sự cố.
2. Người dùng đăng nhập bằng **GitHub**, thông qua **Supabase Auth**.
3. Backend đọc và ghi điểm kỹ năng vào **Supabase**. Supabase chính là Postgres được host sẵn, kèm phần tài khoản.
4. Backend gọi **API AI** để phân tích, đặt câu hỏi và chấm bài.

Cloud Run và Vercel không giữ dữ liệu lâu dài, nên mọi thứ cần giữ phải nằm ở Supabase.

| Phần | Lấy ở đâu | Có tốn tiền không |
| :-- | :-- | :-- |
| Google Cloud Run | GCP Console / gcloud CLI (`asia-southeast1`) | Dùng credit cuộc thi cấp |
| Vercel | Đăng ký vercel.com (`sin1`) | Gói free (bản dự phòng) |
| Supabase | Đăng ký supabase.com | Gói free (2 project: dev/staging và production) |
| GitHub | Repo thi, OAuth App | Miễn phí |
| API AI | Vertex AI (Cloud Run) / Google AI Studio (Vercel) | Credit GCP / Gói free (D-50, D-64) |

## 2. Ai làm gì

| Việc | Người làm | Khi nào |
| :-- | :-- | :-- |
| Tạo repo thi, thêm thành viên | Vai A | Trước giờ thi |
| Dựng WIF, 2 project Supabase (D2), Environment production, GitHub Secrets | Vai A | Trước giờ thi |
| Tạo 2 Supabase OAuth App, cấu hình Redirect URLs | Vai A | Trước giờ thi |
| Lấy API key AI, kiểm hạn mức | Vai C | Trước giờ thi |
| Tạo GCP Project, service account, Secret Manager | Vai A | Trước giờ thi |
| Tạo tài khoản Vercel dự phòng | Vai A | Trước giờ thi |
| Deploy Cloud Run, nạp secret và cấu hình | Vai A | H+0, sau commit đầu tiên |
| Cấu hình Vercel dự phòng | Vai A | H+0, sau commit đầu tiên |
| Merge PR vào `main` | Vai A (sau khi CI đạt) | Suốt giờ thi |
| Duyệt deploy Production trên GitHub Actions | Duy nhất Vai A (sau smoke test staging đạt) | Suốt giờ thi |
| Chọn repo demo | Cả nhóm | Trước giờ thi |
| Tạo tài khoản GitHub demo | Vai E | Trước giờ thi |
| Mời 4 bạn vào repo `ai-kit` | Chủ repo `ai-kit` | Trước giờ thi |
| Viết `.kb/README.md`, `AGENTS.md`, `CLAUDE.md` rồi gửi cả nhóm | Vai A | Trước giờ thi |
| Cài `ai-kit`, gắn tài liệu vào repo thi | **Mỗi người trên máy mình** | Trước giờ thi |

Vai A giữ tài khoản GCP và Vercel, vì đỡ phải truyền tay khóa bí mật.

## 3. Bước 0 — Việc phải xong trước ngày thi

### 3.1. Repo thi

- [ ] Tạo repo GitHub **public, trống**. Chủ repo là Vai A.
- [ ] Thêm đủ thành viên làm collaborator.
- [ ] Nộp link cho BTC theo yêu cầu.

Repo phải trống vì chỉ commit trong giờ thi mới được tính.

### 3.2. Tạo 2 project Supabase (Mô hình D2)

Theo mô hình **D2** (D-30, D-64), nhóm dùng đúng 2 project Supabase (khớp giới hạn 2 project miễn phí trên gói Free, https://supabase.com/pricing):
- **Project 1 (`simplifey-dev-staging`):** Dùng chung cho Local Dev và Staging S2 (`simplifey-staging`).
- **Project 2 (`simplifey-prod`):** Dành riêng cho Production (`simplifey-prod`) và Vercel dự phòng.

> ⚠️ **Đánh thức project Supabase trước giờ thi:** Supabase tự động tạm dừng (pause) các project gói free nếu không có truy vấn trong vòng 1 tuần (7 ngày). Trước giờ thi, Vai A phải vào Supabase Dashboard kiểm tra và ping kết nối cả 2 project để đánh thức nếu bị tạm dừng.

Các bước thực hiện trên từng project:

- [ ] Vào supabase.com, tạo 2 project ở vùng **Singapore** (`ap-southeast-1`): một project dev/staging và một project production.
- [ ] Lưu mật khẩu database ở nơi riêng tư.
- [ ] **Bật Email provider trên project dev/staging:** Vào **Authentication > Providers > Email**, bật **Email Enabled** (cho phép đăng nhập Email/Password). Sau đó vào **Users** tạo 1 tài khoản bot test (ví dụ `smoke-bot@simplifey.local`) để pipeline GitHub Actions lấy token qua `grant_type=password` khi chạy smoke test. Project production **chỉ bật GitHub OAuth, không bật Email provider**.
- [ ] Vào **Authentication > Sign In / Providers > GitHub**, lấy Callback URL của từng project để khai báo ở bước 3.3.

- [ ] Kiểm mục **Anonymous** đang tắt ở cả 2 project.



### 3.3. Tạo 2 GitHub OAuth App

Tạo 2 OAuth App riêng để đăng nhập GitHub độc lập giữa dev/staging và production:

- [ ] **App 1 (`SimpliFey-Dev-Staging`):** Mở https://github.com/settings/developers > OAuth Apps > New OAuth App; Authorization callback URL dán Callback URL của project dev/staging; tạo secret rồi lưu Client ID và Secret vào GitHub Provider của project dev/staging.
- [ ] **App 2 (`SimpliFey-Production`):** Tạo tiếp OAuth App thứ hai đặt tên `SimpliFey-Production`; Authorization callback URL dán Callback URL của project production; tạo secret rồi lưu Client ID và Secret vào GitHub Provider của project production.













### 3.4. Khai địa chỉ được phép quay về (Redirect URLs)

Sau khi đăng nhập, Supabase chỉ đưa người dùng về các địa chỉ đã khai.

- [ ] **Project Dev/Staging:** Vào Authentication > URL Configuration > Redirect URLs, khai báo: `http://localhost:3000/**`, `https://simplifey-staging-*.run.app/auth/callback`, `https://*-<team>.vercel.app/auth/callback` (cho bản preview Vercel S1).
- [ ] **Project Production:** Khai báo Redirect URLs: `https://simplifey-prod-*.run.app/auth/callback`, `https://simplifey.vercel.app/auth/callback` (cho bản Vercel dự phòng).
- [ ] Giữ **Site URL** ở cả 2 project là `http://localhost:3000`, sau deploy đổi theo URL môi trường thật.

### 3.5. API AI

Theo D-50, D-66: Cloud Run gọi Gemini qua Vertex AI (`location: "global"`, service account `roles/aiplatform.user`), không cần `GEMINI_API_KEY`. Chuẩn bị 1 key Google AI Studio gói trả phí (Pay-as-you-go) cho bản Vercel dự phòng (`GEMINI_BACKEND="studio"`). Mỗi người tự tạo 1 key riêng (gói free) tại Google AI Studio để test trên máy mình (chạy local).

- [ ] Chuẩn bị 1 key riêng cho web deploy trên Vercel.
- [ ] Mỗi người tự tạo 1 key riêng tại Google AI Studio để test trên máy mình (chạy local).
- [ ] Xem hạn mức thật và gọi thử 1 lần trước ngày thi.

### 3.6. Tài khoản Vercel và tài khoản demo

- [ ] Vai A đăng ký Vercel **bằng chính tài khoản GitHub của mình** để thiết lập bản dự phòng nóng.
- [ ] Tạo 1 tài khoản GitHub riêng để demo, không dùng tài khoản cá nhân.
- [ ] Mỗi người kiểm email commit: `git config user.email` phải là email đã xác minh trên GitHub của người đó.

### 3.7. Repo demo và câu hỏi còn mở

- [ ] Chọn repo demo theo tiêu chí Q-03 ở `spec/00` Mục 3, đẩy lên GitHub cá nhân.
- [ ] Trả lời các câu hỏi còn mở ở `spec/00` Mục 3 (Q-03, Q-10).

### 3.8. Cài `ai-kit` trên từng máy

`ai-kit` là repo private chứa cấu hình AI của nhóm. Cài xong thì Claude và Antigravity trên máy đó có sẵn luật chung, 3 skill và rào chắn lệnh git nguy hiểm.

- [ ] Chủ repo `ai-kit` mời 4 bạn còn lại, mỗi bạn bấm chấp nhận lời mời.
- [ ] Mỗi người clone `ai-kit` rồi cài theo `README.md` của repo đó.
- [ ] Mỗi người chạy `node cai-dat.mjs --kiem`. Mọi dòng đều `[OK]` là đạt.
- [ ] Mở chat mới. Chat đang mở không tự nhận cấu hình mới.

### 3.9. Cho AI đọc tài liệu trong repo thi

Repo thi không được chứa `spec/`, nên mỗi máy giữ một bản chép trong thư mục `.kb/`, git bỏ qua thư mục này. Bước này không đi theo khi clone, nên **mỗi người phải làm trên máy mình, trước khi tạo task**. Máy nào chưa làm thì `git add .` sẽ lấy cả `.kb`.

- [ ] Clone repo thi, rồi chạy trong thư mục `ai-kit`:

```powershell
node gan-du-an.mjs "<repo thi>" "<repo tài liệu>\spec"
node gan-du-an.mjs "<repo thi>" "<repo tài liệu>\doc-de-hieu"
```

Mỗi lệnh chép 1 thư mục, nên phải chạy 2 lần. Tài liệu gốc đổi thì chạy lại, vì `.kb` chỉ là bản chép. Những file bạn tự tạo trong `.kb` vẫn được giữ.

AI không tự đọc `.kb`, nên phải chỉ đường cho nó. Vai A viết 3 file dưới đây rồi gửi cả nhóm, vì `.kb` không chia sẻ qua git.

- [ ] Viết `.kb/README.md`, mục lục để AI không phải mở hết tài liệu:

```markdown
| Cần biết | Đọc |
| :-- | :-- |
| Quyết định | spec/00_QUYET_DINH.md |
| Kiểu dữ liệu, CONFIG, mã lỗi | spec/02_CONTRACTS.md |
| Endpoint, bảng dữ liệu | spec/03_API_VA_LUU_TRU.md |
| Cây thư mục, phiên bản thư viện | spec/04_KIEN_TRUC_TRIEN_KHAI.md Mục 15, 16 |
| Engine | spec/10_ENGINE_INGEST.md, spec/11_ENGINE_DO_THI.md |
| AI, cổng gác, BKT | spec/20_AI_GOI_VA_PROMPT.md, spec/21_AI_KIEM_VA_DUYET.md, spec/22_BKT_VA_KE_HOACH_CAU_HOI.md |
| Giao diện | spec/30_UI.md |
| Test, Definition of Done | spec/50_TEST_VA_FIXTURE.md |
| Lịch 21 giờ | ke-hoach-thi/04_TIMELINE_VA_PHU_THUOC.md |
```

- [ ] Tạo `AGENTS.md` ở gốc repo thi, chỉ cần 1 dòng: `Trước khi làm việc, đọc .kb/README.md.`
- [ ] Tạo `CLAUDE.md` ở gốc repo thi, chỉ cần 1 dòng: `@AGENTS.md`

Hai file này là cấu hình AI nên không commit vào repo thi. Mỗi người chạy trong thư mục repo thi:

```powershell
Add-Content .git\info\exclude "AGENTS.md"
Add-Content .git\info\exclude "CLAUDE.md"
```

- [ ] Chạy `git status`. Thấy `.kb`, `.env`, `AGENTS.md` hoặc `CLAUDE.md` hiện ra thì dừng lại kiểm tra, chưa commit.

### 3.10. Thiết lập Workload Identity Federation (WIF) & GitHub Secrets

Để GitHub Actions xác thực an toàn vào Google Cloud mà không dùng khóa bí mật dài hạn:
- [ ] **Tạo WIF trên Google Cloud bằng lệnh gcloud:**
  ```bash
  # Tạo Workload Identity Pool
  gcloud iam workload-identity-pools create "github-pool" \
    --project="<project-id>" --location="global" --display-name="GitHub Actions Pool"

  # Tạo Workload Identity Provider liên kết với GitHub OIDC
  gcloud iam workload-identity-pools providers create-oidc "github-provider" \
    --project="<project-id>" --location="global" --workload-identity-pool="github-pool" \
    --display-name="GitHub Actions Provider" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --issuer-uri="https://token.actions.githubusercontent.com"

  # Tạo service account deployer và cấp quyền OIDC
  gcloud iam service-accounts create github-deployer --display-name="GitHub Actions Deployer"
  gcloud iam service-accounts add-iam-policy-binding "github-deployer@<project-id>.iam.gserviceaccount.com" \
    --project="<project-id>" --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/projects/<project-number>/locations/global/workloadIdentityPools/github-pool/attribute.repository/<owner>/<repo>"
  ```
- [ ] **Cấp quyền IAM cho tài khoản deployer:**
  + Giai đoạn `--source`: Gán `roles/run.sourceDeveloper` và `roles/serviceusage.serviceUsageConsumer` trên project; gán `roles/iam.serviceAccountUser` trên các service account runner (`simplifey-runner`, `simplifey-staging-runner`).
  + Giai đoạn Dockerfile: Gán thêm `roles/artifactregistry.writer` và `roles/run.developer`.
- [ ] **Đường lui dự phòng bằng Key JSON:** Nếu WIF gặp lỗi OIDC trong giờ thi, tạo Service Account Key JSON cho `github-deployer` và dán vào secret `GCP_SA_KEY` trên GitHub Secrets.
- [ ] **Khai báo GitHub Secrets trong repo thi:** Vào Settings > Secrets and variables > Actions > Tạo các secret sau (chỉ tạo tên secret, không ghi giá trị ra ngoài):
  - `GCP_PROJECT_ID`
  - `GCP_WORKLOAD_IDENTITY_PROVIDER`
  - `GCP_SERVICE_ACCOUNT`
  - `GCP_SA_KEY` (dự phòng)
  - `SMOKE_BOT_EMAIL` (email bot smoke test)
  - `SMOKE_BOT_PASSWORD` (mật khẩu bot smoke test)
  - `SUPABASE_DEV_URL`
  - `SUPABASE_DEV_ANON_KEY`
  - `SUPABASE_PROD_URL` (project Supabase production, phải khác `SUPABASE_DEV_URL`, D-72)
  - `SUPABASE_PROD_ANON_KEY`
- [ ] **Khai báo GitHub Variables** (tab Variables cạnh Secrets): `DEMO_REPO_URL` (link repo demo Q-03 cho smoke test ingest).

### 3.11. Thiết lập GitHub Environment `production`

Để ngăn code mới tự ý bung thẳng lên Production:
- [ ] Vào GitHub Repo **Settings > Environments > New environment**, đặt tên `production`.
- [ ] Bật **Required reviewers**: Chọn duy nhất Trưởng tích hợp (**Vai A**).
- [ ] Khi workflow `deploy.yml` chạy tới job `deploy-production`, hệ thống sẽ tạm dừng và gửi thông báo chờ Vai A phê duyệt sau khi xác nhận Staging S2 hoạt động ổn định.

## 4. Việc lúc H+0

### 4.1. Tạo khung code

- [ ] Một người tạo project Next.js theo `spec/04` Mục 15, 16 và push commit đầu.
- [ ] Trong `.gitignore` phải có 2 dòng:

```
.env*
!.env.example
```

- [ ] Tạo `.env.example` chỉ có tên biến, **không có giá trị**.

### 4.2. Tạo `.env.local`

Mỗi người tạo file `.env.local` trên máy mình, lấy giá trị từ bảng ở Mục 6. Gửi khóa cho nhau qua tin nhắn riêng, không dán vào repo, không dán vào nhóm đông người.

### 4.3. Tạo bảng trong database

- [ ] Viết `supabase/migrations/0001_init.sql` theo `spec/03` Mục 3.
- [ ] Mở **SQL Editor** trong Supabase, dán nội dung file, bấm **Run**.
- [ ] Vào **Table Editor**, kiểm đủ bảng.

Cách này không cần cài Supabase CLI hay Docker. Đổi bảng về sau thì thêm file SQL mới, không sửa file cũ.

### 4.4. Thử đăng nhập ở máy

Đăng nhập cần 2 mảnh code:

```ts
// Nút đăng nhập
await supabase.auth.signInWithOAuth({
  provider: "github",
  options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(duongDanDich)}` },
});
```

Mảnh thứ hai là file `src/app/auth/callback/route.ts`, nhận `code` trên URL rồi gọi `exchangeCodeForSession(code)`. Làm theo mục "PKCE, Next.js" trong tài liệu Supabase ở Mục 9, dùng `@supabase/ssr`. Route chỉ nhận `next` là đường dẫn nội bộ, và chuyển hướng theo `x-forwarded-host` vì sau proxy `request.url` mang host nội bộ.

- [ ] Chạy `npm run dev`, bấm đăng nhập, quay về app và thấy tên GitHub là đạt.

### 4.5. Đưa lên Google Cloud Run (Cách chính)

Chỉ Vai A làm (người giữ project GCP):

1. **Chuẩn bị trên Google Cloud:**
   - [ ] Tạo project GCP (ví dụ `simplifey-hackathon`), liên kết billing (dùng credit cuộc thi).
   - [ ] Bật các API cần thiết:
     ```bash
     gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com aiplatform.googleapis.com
     ```
   - [ ] Tạo service account riêng theo nguyên tắc đặc quyền tối thiểu:
     ```bash
     gcloud iam service-accounts create simplifey-runner --display-name="SimpliFey Runner"
     ```
   - [ ] Cấp quyền gọi Vertex AI cho service account (D-66):
     ```bash
     gcloud projects add-iam-policy-binding <project-id> \
       --member="serviceAccount:simplifey-runner@<project-id>.iam.gserviceaccount.com" \
       --role="roles/aiplatform.user"
     ```
   - [ ] Tạo các secret trên Secret Manager (không dán chuỗi bí mật thật vào script công khai):
     ```bash
     gcloud secrets create DATABASE_URL --replication-policy="automatic"
     gcloud secrets create GITHUB_TOKEN --replication-policy="automatic"
     gcloud secrets create SUPABASE_SERVICE_ROLE_KEY --replication-policy="automatic"
     ```
     Sau đó thêm phiên bản giá trị thật vào từng secret qua Google Cloud Console hoặc lệnh `gcloud secrets versions add`. Cấp quyền đọc secret cho service account `simplifey-runner` (role `roles/secretmanager.secretAccessor`).

2. **Deploy bằng lệnh CLI:**
   - [ ] Chạy lệnh `gcloud run deploy --source` kèm các cờ cấu hình chuẩn theo bảng `spec/05`:
     ```bash
     gcloud run deploy simplifey-prod \
       --source . \
       --region asia-southeast1 \
       --allow-unauthenticated \
       --service-account simplifey-runner@<project-id>.iam.gserviceaccount.com \
       --cpu 1 --memory 2Gi \
       --min-instances 1 --max-instances 4 \
       --concurrency 40 \
       --timeout 300s \
       --cpu-boost \
       --set-secrets="DATABASE_URL=DATABASE_URL:latest,GITHUB_TOKEN=GITHUB_TOKEN:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest" \
       --set-env-vars="DEMO_MODE=false,NEXT_PUBLIC_DEMO_MODE=false,NEXT_PUBLIC_SUPABASE_URL=<url>,NEXT_PUBLIC_SUPABASE_ANON_KEY=<key>,GEMINI_BACKEND=vertex,GOOGLE_CLOUD_PROJECT=<project-id>,AI_DISABLED=false"
     ```
   - [ ] Xem URL công khai sau khi deploy thành công (dạng `https://simplifey-prod-xxxx.asia-southeast1.run.app`).

3. **Cập nhật URL vào Supabase và OAuth App:**
   - [ ] Vào Supabase > **Authentication > URL Configuration**: Đổi **Site URL** thành URL Cloud Run vừa tạo; đảm bảo **Redirect URLs** có cả URL Cloud Run và Vercel (`https://<app>.run.app/auth/callback`).
   - [ ] Vào GitHub OAuth App: Đổi **Homepage URL** thành URL Cloud Run.
   - [ ] Mở web thật trên Cloud Run, đăng nhập thử bằng GitHub OAuth.

4. **Khi cần rollback revision:**
   - [ ] Nếu bản build mới gặp lỗi bất thường khi demo: Mở Cloud Run Console > chọn service `simplifey-prod` > thẻ **Revisions** > **Manage Traffic**, điều hướng 100% traffic về revision cũ ổn định trong vài giây.

5. **Tạo Budget Alert & Lệnh ngắt khẩn cấp AI (D-66):**
   - [ ] Vào **GCP Console > Billing > Budgets & alerts**, tạo ngân sách trần **$20.00 / tháng** (ước tính) gắn với project; đặt 3 mốc cảnh báo 50 % ($10.00), 80 % ($16.00), 100 % ($20.00) gửi email thông báo.
   - [ ] **Lệnh bật `AI_DISABLED` (khi nhận cảnh báo 100 %):**
     ```bash
     gcloud run services update simplifey-prod --update-env-vars AI_DISABLED="true" --region asia-southeast1
     ```
   - [ ] **Lệnh tắt `AI_DISABLED` (mở lại AI):**
     ```bash
     gcloud run services update simplifey-prod --update-env-vars AI_DISABLED="false" --region asia-southeast1
     ```

### 4.6. Đưa lên Vercel (Bản dự phòng — Phương án C)

Làm ngay sau bước 4.5 để có sẵn bản dự phòng:

- [ ] Vào Vercel, **Add New Project**, import repo thi.
- [ ] Thêm đủ biến ở Mục 6 vào Vercel Project Settings (riêng AI dùng `GEMINI_BACKEND="studio"` kèm `GEMINI_API_KEY` từ Google AI Studio, không dùng service account).
- [ ] Sau khi có web, vào **Settings**, chọn **Functions**, mở **Function Regions**, chọn Singapore (`sin1`). Mặc định của Vercel là Mỹ, để vậy sẽ chậm vì xa Supabase.
- [ ] Bấm **Redeploy** để áp dụng.

- [ ] Kiểm tra Redirect URLs trong Supabase Auth đã có sẵn `https://<web-của-nhóm>.vercel.app/auth/callback`.
- [ ] Mở web Vercel, đăng nhập thử và chuẩn bị sẵn 1 tab trình duyệt lúc demo. Nếu Cloud Run gặp sự cố, chỉ cần chuyển sang tab Vercel (< 5 giây).






## 5. Quy trình làm việc nhóm & Pipeline CI/CD (D-30)

Nhóm áp dụng quy trình tự động hóa qua GitHub Actions, bảo đảm đúng thể lệ cuộc thi (mọi người đều có commit) và bảo vệ an toàn cho bản demo:

Quy trình:

1. Mỗi người làm trên nhánh riêng, ví dụ `nhan/ui-ban-do`, `huy/engine-ast`.
2. Mở Pull Request vào `main`. Workflow `ci.yml` (`typecheck`, `lint`, `vitest`) và `security.yml` (`npm audit critical`) tự động chạy để kiểm tra code.
3. Trưởng tích hợp (Vai A) review code và bấm merge commit vào `main` sau khi toàn bộ test CI đạt.
4. Khi merge vào `main`: Workflow `deploy.yml` tự động deploy lên **Staging S2** (`simplifey-staging`) trên Cloud Run, sau đó chạy kịch bản **smoke test** tự động (kiểm tra `/api/health` và ingest thử nghiệm repo demo Q-03 với token bot).
5. Smoke test đạt ⇒ GitHub Actions gửi thông báo chờ duyệt deploy lên Production.

6. Vai A kiểm tra Staging S2 hoạt động ổn định, sau đó bấm **Approve** tại GitHub Environment `production` để deploy lên `simplifey-prod`.
7. **Kịch bản lùi an toàn khi hỏng sát demo:**
   - Bước 1: Rollback revision trên Cloud Run `simplifey-prod` về bản ổn định gần nhất.
   - Bước 2: Dùng revision tag của Staging S3 (`--no-traffic --tag stable`).
   - Bước 3: Chuyển tab sang Vercel dự phòng (< 5 giây).
   - Bước 4: Chế độ Offline (`Ctrl+Shift+D`).

**Phải thử ngay lúc H+0.5, khi code còn ít:**

- [ ] Một thành viên mở PR nhỏ để kiểm tra `ci.yml` và `security.yml`.
- [ ] Vai A bấm merge PR vào `main`.
- [ ] Kiểm tra `deploy.yml` tự động deploy lên Staging S2 và chạy smoke test đạt.



## 6. Biến môi trường

Tên biến giữ đúng như `spec/03` Mục 8.

| Biến | Lấy ở đâu | Bí mật không |
| :-- | :-- | :-- |
| `DATABASE_URL` | Supabase → Connect → Transaction pooler (port 6543) | **Có** |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase, **Settings > API Keys** hoặc nút **Connect** | Không |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase, publishable key `sb_publishable_…` | Không |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase, secret key `sb_secret_…` | **Có** |
| `GEMINI_BACKEND` | Tự đặt: `"vertex"` trên Cloud Run, `"studio"` trên Vercel dự phòng và máy dev (D-66) | Không |
| `GOOGLE_CLOUD_PROJECT` | GCP Console (Project ID khi chạy Vertex AI) | Không |
| `AI_DISABLED` | Tự đặt: `"false"` (đặt `"true"` để ngắt khẩn cấp khi nhận Budget Alert 100 %, D-66) | Không |
| `GEMINI_API_KEY` | Google AI Studio (bắt buộc khi `GEMINI_BACKEND="studio"`: Vercel dùng gói Paid, máy dev dùng gói Free; Cloud Run dùng service account không cần key) | **Có** |
| `GITHUB_TOKEN` | GitHub, **Settings > Developer settings > Fine-grained tokens**, chọn **Public Repositories (read-only)**, không cấp thêm quyền (D-63) | **Có** |
| `DEMO_MODE` | Tự đặt: `true` ở máy demo, `false` trên web thật | Không |
| `NEXT_PUBLIC_DEMO_MODE` | Đặt giống `DEMO_MODE` | Không |

Lưu ý:

- Supabase đang thay khóa kiểu cũ (`anon`, `service_role`, chuỗi bắt đầu bằng `eyJ`) bằng khóa mới, và sẽ ngừng khóa cũ vào cuối 2026. Tên biến giữ nguyên, chỉ dán khóa mới vào. Project chưa có khóa mới thì tạo ở **Settings > API Keys**.
- Biến có `NEXT_PUBLIC_` sẽ lộ xuống trình duyệt. **Không bao giờ** đặt khóa bí mật vào biến có tiền tố này.
- Trên Vercel, đổi biến xong phải **Redeploy** mới có tác dụng.

## 7. Lỗi hay gặp

| Bạn thấy | Nguyên nhân thường gặp | Sửa ở đâu |
| :-- | :-- | :-- |
| WIF báo lỗi xác thực OIDC khi deploy | Attribute mapping hoặc Issuer URL sai | Chuyển sang dùng key JSON `GCP_SA_KEY` (Mục 3.10) |
| Smoke test ingest báo lỗi 401 | Chưa bật Email provider trên Supabase dev | Bật Email provider và tạo tài khoản bot (Mục 3.2) |
| Database báo lỗi kết nối / timeout | Project Supabase free bị tạm dừng sau 1 tuần | Vào Supabase Dashboard khôi phục và ping DB (Mục 3.2) |
| Đăng nhập xong bị đưa về `localhost` | Site URL chưa đổi | Bước 4.5 |
| GitHub báo `redirect_uri` sai | Callback URL trong OAuth App sai | Bước 3.3 |
| Đăng nhập xong không quay về app | Chưa khai Redirect URLs hoặc thiếu file callback | Bước 3.4, 4.4 |
| App chạy ở máy nhưng lỗi trên Vercel | Thiếu biến trên Vercel, hoặc chưa Redeploy | Mục 6 |
| Đọc bảng ra 0 dòng | RLS đang chặn đúng luật, mọi lệnh ghi phải qua server | `spec/03` Mục 3 |
| Web rất chậm khi gọi database | Function chưa đổi sang `sin1` | Bước 4.5 |
| Lỡ đưa khóa bí mật lên repo | Khóa đã lộ, xóa file không đủ | Tạo khóa mới ngay, thay ở Vercel và `.env.local` |
| AI báo hết lượt | Hết hạn mức | Dùng Offline `Ctrl+Shift+D` khi demo |

## 8. Trước demo và sau thi

Trước demo:

- [ ] Đăng nhập sẵn tài khoản GitHub demo, không gõ mật khẩu trên sân khấu.
- [ ] Muốn tiến độ trống thì bấm "Xóa tài khoản" rồi đăng nhập lại.
- [ ] Mở thử chế độ Offline.

Giữ project hoạt động sau thi (D-47):

- [ ] Vài ngày một lần, mở web và bấm thử, mở cả dashboard Supabase để tránh bị tạm dừng.
- [ ] Kiểm lại web trước vòng thi tiếp theo. Nếu bị dừng thì vào dashboard khôi phục, dữ liệu vẫn còn.

## 9. Tra chi tiết

- Biến môi trường: `spec/03` Mục 8. Bảng và RLS: `spec/03` Mục 3. Mốc giờ: [`04_TIMELINE_VA_PHU_THUOC.md`](../ke-hoach-thi/04_TIMELINE_VA_PHU_THUOC.md).
- [Đăng nhập GitHub với Supabase](https://supabase.com/docs/guides/auth/social-login/auth-github)
- [Redirect URLs của Supabase](https://supabase.com/docs/guides/auth/redirect-urls)
- [Khóa API của Supabase](https://supabase.com/docs/guides/api/api-keys)
- [Vì sao commit không deploy trên Vercel](https://vercel.com/kb/guide/why-aren-t-commits-triggering-deployments-on-vercel)
- [Chọn vùng cho Vercel Functions](https://vercel.com/docs/functions/configuring-functions/region)
