# 03 — API, LƯU TRỮ & GIAO DỊCH

> Quy định 15 endpoint, lược đồ Postgres, RLS, khóa cache AI, suy ra trạng thái node và các luồng ghi. Người đọc: cả nhóm; Vai A cài đặt, gọi hàm của Vai B (`10`, `11`) và Vai C (`20`–`22`).
> **Trong repo thi:** route handler ở `src/app/api/**/route.ts` (mỏng: xác thực → gọi service → map lỗi); nghiệp vụ ở `src/server/*.ts`; SQL ở `supabase/migrations/0001_init.sql`.
> **Kiểu:** `02_CONTRACTS.md` (Mục 5–9). **Hằng số:** `CONFIG.*`. Luồng nghiệp vụ tổng thể: `01_KIEN_TRUC_VA_LUONG.md`.

## Đọc nhanh

- Nhận request ở 15 endpoint (kiểu ở `02` Mục 8; riêng `/api/health` trả text `ok`) ⇒ xác thực phiên Supabase, kiểm `session_id` thuộc người gọi ⇒ gọi service ở `src/server/*.ts` ⇒ trả response dựng theo danh sách trường cho phép.
- Server là nơi ghi duy nhất vào Postgres; Postgres không chứa file nguồn, chỉ lưu đoạn code đã cắt của phiên trong `session_snapshots` (API-01, API-02, D-59).
- `evaluate-feynman`: đọc câu hỏi + đáp án từ DB, kiểm không khóa ⇒ gọi AI ngoài transaction ⇒ transaction ngắn ghi lượt và BKT; ghi hỏng ⇒ `ERR_PERSISTENCE_UNAVAILABLE`, người học bấm "Thử lại" (Mục 6.2).
- Trạng thái node suy ra khi đọc từ khung đồ thị + `node_progress` (`deriveNodeStates`, Mục 5.1); `LOCKED` không bao giờ được lưu.
- Chạy trên Cloud Run (Vercel dự phòng, D-64); cache RAM chỉ giúp nhanh, bản gốc của phiên ở `session_snapshots` (API-08).

```mermaid
flowchart LR
  B["Trình duyệt"] -- "/api/* + Bearer token" --> R["route.ts<br/>xác thực · gọi service · map lỗi"]
  R --> S["src/server/*<br/>nghiệp vụ"]
  S -- "ghi duy nhất (DATABASE_URL)" --> D[("Postgres")]
  S -- "ngoài transaction" --> A["Gemini"]
  S --> M["Cache RAM 1 instance<br/>StaticEngineResult (bản sao)"]
  B -. "chỉ select (RLS)" .-> D
```

| Mục | Nói về | Code (file / hàm chính) |
| :-: | :-- | :-- |
| 1 | Nguyên tắc: không lưu file nguồn, server ghi duy nhất, xác thực, quota token, AI ngoài transaction, Cloud Run | — |
| 2 | 15 endpoint (request → response, bảng ghi, lỗi riêng); `GET /api/sessions`, `GET /api/health` | `src/app/api/**/route.ts` |
| 3 | Lược đồ Postgres; 3.1 `RunQuestion`; 3.2 RLS; 3.3 khóa cache AI | `supabase/migrations/0001_init.sql` |
| 4 | Khóa phiên, cache RAM, đọc `StaticEngineResult` của phiên | `getSessionStaticResult` |
| 5 | Suy ra trạng thái node (5.1), mài mòn (5.2), kế hoạch không rỗng (5.3), đổi persona (5.4) | `deriveNodeStates` (`src/lib/derive.ts`) |
| 6.1 | `enrich-node`: tạo run, lưu câu hỏi + đáp án | `src/server/enrich.ts` (`enrichNode`) |
| 6.2 | `evaluate-feynman`: kiểm ⇒ chấm ⇒ khóa ⇒ ghi | `src/server/evaluate.ts` (`evaluateFeynman`) |
| 6.3 | `reveal`: bỏ qua câu | `src/server/reveal.ts` |
| 6.4 | `report-wrong`: báo sai | `src/server/report.ts` |
| 6.5 | `finalizeRunIfDone`: đổi màu node khi run xong | `src/server/progress.ts` |
| 6.6 | `analyze-node`, `analyze-overview`, `ingest` | `src/app/api/**/route.ts` |
| 6.7 | `demo/persona` | `src/server/persona.ts` |
| 6.9 | `explain-selection` | `src/server/ai/explain.ts` |
| 7 | Sự cố và tình huống biên | — |
| 8 | Biến môi trường server | — |

---

## 1. Nguyên tắc

- **Không lưu file nguồn.** Postgres không chứa file code, buffer zip, AST. Code duy nhất được lưu là đoạn code đã cắt của các node (`trace_steps[].snippet`, `dto_snippet`) trong `StaticEngineResult` của phiên, bảng `session_snapshots` (D-59). Được lưu thêm: tài khoản, điểm kỹ năng, phiên học (snapshot + khung đồ thị), tiến độ, câu trả lời của người học, văn bản AI **đã qua kiểm** trong `ai_cache` và `node_runs` (câu hỏi, đáp án mẫu — D-36), tên bước / tên hàm (API-01).
- **Server là nơi ghi duy nhất.** Client không có quyền `insert/update/delete` trên bảng nào; mọi lệnh ghi đi qua route handler bằng driver `postgres` (`DATABASE_URL`), không qua service-role key (API-02).
- **Trả về theo danh sách trường cho phép.** Mỗi response dựng bằng một hàm map tường minh (`toClientResult`, `toAnalysisView`, `toEvaluateResponse`…). Cấm spread object thô của AI hay của DB vào response, để không lộ `misconception`, đáp án, `suspicious_instruction_files` (API-03).
- **Mọi request cần phiên Supabase.** Header `Authorization: Bearer <access_token>`; server xác thực bằng `supabase.auth.getUser(token)`. Thiếu / sai ⇒ `ERR_UNAUTHENTICATED` (API-04). Ngoại lệ duy nhất: `GET /api/health` không cần đăng nhập (D-64).
- **Kiểm quyền sở hữu.** `session_id` (và `run_id`) phải thuộc `user_id` hiện tại, nếu không ⇒ `ERR_SESSION_NOT_FOUND`; không tiết lộ đó là phiên của người khác (API-05).
- **Đếm token ở server.** Sau mỗi lời gọi AI thật (không tính trúng cache), cộng `usage_metadata` vào `learning_sessions.tokens_used`. Trước mỗi lời gọi AI: `tokens_used ≥ CONFIG.SESSION_TOKEN_QUOTA` ⇒ `ERR_TOKEN_QUOTA_EXCEEDED` (API-06).
- **Gọi AI ngoài transaction.** Không giữ khóa DB trong lúc chờ AI (D-18, API-07).
- **Triển khai chính trên Google Cloud Run** (region `asia-southeast1`, D-64), dự phòng Vercel (`sin1`). Cache RAM `StaticEngineResult`, semaphore ingest và in-flight map chỉ sống trong 1 instance: giúp nhanh hơn, **không được dựa vào**. Cache trượt ⇒ đọc `session_snapshots` (Mục 4). Upload zip ≤ `CONFIG.MAX_UPLOAD_BYTES` (trần upload an toàn chung, D-27); link GitHub không bị giới hạn này (API-08).

---

## 2. Bảng endpoint

| # | Endpoint | Request → Response (`02` Mục 8) | Ghi Postgres | AI | Lỗi riêng |
| :-: | :-- | :-- | :-- | :-: | :-- |
| 1 | `GET /api/me` | — → `MeResponse` | Tạo `profiles` nếu chưa có | — | — |
| 2 | `DELETE /api/me` | — → 204 | Xóa `auth.users` ⇒ cascade mọi bảng | — | — |
| 3 | `GET /api/sessions` | — → `SessionsResponse` | — | — | — |
| 4 | `GET /api/sessions/{session_id}/history` | — → `HistoryResponse` | — | — | — |
| 5 | `POST /api/ingest` | `IngestRequest` → `IngestResponse` | Tạo / mở `learning_sessions` (Mục 6.6) | — | Mọi `IngestionErrorCode`, `ERR_SESSION_ENGINE_OUTDATED` |
| 6 | `POST /api/analyze-node` | `AnalyzeNodeRequest` → `AnalyzeNodeResponse` | `ai_cache`, `node_progress.analysis_failed`, `tokens_used` | ✅ | `ERR_TOKEN_QUOTA_EXCEEDED` |
| 7 | `POST /api/analyze-overview` | `AnalyzeOverviewRequest` → `AnalyzeOverviewResponse` | `ai_cache`, `tokens_used` | ✅ | `ERR_TOKEN_QUOTA_EXCEEDED` |
| 8 | `POST /api/enrich-node` | `EnrichNodeRequest` → `EnrichNodeResponse` | `node_runs` (tạo run), `tokens_used`, `last_active_at` | ✅ | `ERR_NODE_NOT_AVAILABLE`, `ERR_ANALYSIS_NOT_READY`, `ERR_AI_REJECTED`, `ERR_AI_UNAVAILABLE`, `ERR_TOKEN_QUOTA_EXCEEDED` |
| 9 | `POST /api/evaluate-feynman` | `EvaluateFeynmanRequest` → `EvaluateFeynmanResponse` | Transaction Mục 6.2 | ✅ | `ERR_ANSWER_*`, `ERR_QUESTION_FINISHED`, `ERR_ATTEMPT_OUT_OF_SYNC`, `ERR_AI_UNAVAILABLE`, `ERR_TOKEN_QUOTA_EXCEEDED` |
| 10 | `POST /api/reveal` | `RevealRequest` → `RevealResponse` | Transaction Mục 6.3 | — | `ERR_QUESTION_FINISHED` |
| 11 | `POST /api/report-wrong` | `ReportWrongRequest` → `ReportWrongResponse` | Mục 6.4 | — | `ERR_REPORT_NOT_ALLOWED` |
| 12 | `POST /api/demo/persona` | `PersonaRequest` → `PersonaResponse` | Ghi đè 16 dòng `skill_states` của **tài khoản hiện tại** | — | `ERR_DEMO_MODE_DISABLED` |
| 13 | `GET /api/sessions/{session_id}/progress` | — → `ProgressResponse` | — (chỉ đọc DB, không engine, không AI) | — | — |
| 14 | `GET /api/health` | — → 200 `ok` | — | — | — |
| 15 | `POST /api/explain-selection` | `ExplainSelectionRequest` → `ExplainSelectionResponse` | `ai_cache`, `ai_usage`, `tokens_used` | ✅ | `ERR_SELECTION_INVALID`, `ERR_EXPLAIN_LIMIT`, `ERR_AI_UNAVAILABLE`, `ERR_TOKEN_QUOTA_EXCEEDED` |

### Lỗi chung

Không lặp ở cột "Lỗi riêng":
- Mọi endpoint ⇒ `ERR_UNAUTHENTICATED` (API-04), `ERR_PERSISTENCE_UNAVAILABLE` (Postgres lỗi khi đọc hoặc ghi, D-40).
- Endpoint nhận `session_id` / `run_id` ⇒ `ERR_SESSION_NOT_FOUND` (API-05).
- Endpoint gọi `getSessionStaticResult` (`ingest { session_id }`, `analyze-node`, `analyze-overview`, `enrich-node`, `explain-selection`) ⇒ `ERR_SESSION_ENGINE_OUTDATED` và các lỗi của Mục 4.

### `GET /api/sessions`

Mỗi `LearningSessionSummary` được tính khi đọc, không lưu:
- Truy vấn nhanh, tránh N+1: chỉ lấy các cột cần thiết, không lấy `graph_skeleton` đầy đủ qua mạng mà dùng `jsonb_array_length(graph_skeleton)` để tính `total_nodes`; `completed_count` và `failed_count` đếm từ `node_progress.status` bằng `LEFT JOIN` / `GROUP BY` trong một truy vấn duy nhất thay vì truy vấn lặp từng phiên.
- `engine_version ≠ CONFIG.ENGINE_VERSION` ⇒ `can_resume = false`, `resume_blocker = "ENGINE_UPDATED"`.
- Còn lại ⇒ `true`, `null` (mọi phiên, kể cả `.zip`, mở lại từ `session_snapshots` — D-59).

### Đăng nhập GitHub

Client gọi `supabase.auth.signInWithOAuth({ provider: "github" })` (scope mặc định `user:email`: đọc email và hồ sơ công khai, không xin quyền repo private), chuyển hướng về `/auth/callback` để hoàn tất phiên đăng nhập và vào app.

---

## 3. Lược đồ Postgres (`supabase/migrations/0001_init.sql`)

```mermaid
erDiagram
  profiles ||--o{ skill_states : "điểm kỹ năng"
  profiles ||--o{ learning_sessions : "phiên học"
  learning_sessions ||--|| session_snapshots : "đoạn code đã cắt (D-59)"
  learning_sessions ||--o{ node_progress : "trạng thái node"
  learning_sessions ||--o{ node_runs : "lần học"
  node_runs ||--o{ question_attempts : "lượt trả lời"
  profiles ||--o{ dispute_reports : "người báo"
  node_runs ||--o{ dispute_reports : "run bị báo"
  ai_cache {
    text cache_key PK
  }
```

```sql
create type swe_skill as enum (
  'HTTP_ROUTING','DTO_VALIDATION','AUTH_SECURITY','DEPENDENCY_INJECTION',
  'LAYERED_SEPARATION','DB_OPTIMIZATION','ASYNC_CONCURRENCY','TRANSACTION_INTEGRITY',
  'ERROR_HANDLING','STATE_MANAGEMENT','ALGORITHMIC_COMPLEXITY','MEMORY_MANAGEMENT',
  'API_CONTRACT_DESIGN','CACHING_STRATEGY','RATE_LIMIT_RESILIENCE','DATA_SERIALIZATION'
);                                                     -- cùng thứ tự SWE_SKILLS
create type run_mode as enum ('LEARN');                -- D-35

create table profiles (
  user_id      uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

create table skill_states (                            -- = CognitiveSkillState; thiếu dòng ⇒ P = BKT_P_L0
  user_id           uuid not null references profiles on delete cascade,
  skill             swe_skill not null,
  p_mastery         double precision not null check (p_mastery between 0.01 and 0.99),  -- = CONFIG.BKT_P_MIN / BKT_P_MAX
  last_practiced_at timestamptz not null,
  practice_count    int not null default 0,
  correct_count     int not null default 0,
  primary key (user_id, skill)
);

create table learning_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles on delete cascade,
  source           text not null check (source in ('GITHUB','ZIP')),
  repo_key         text not null,
  snapshot_id      text not null,
  snapshot_id_kind text not null check (snapshot_id_kind in ('COMMIT_SHA','ARCHIVE_HASH')),
  subdir           text not null default '',
  ref_label        text,
  repo_name        text not null,
  engine_version   text not null,
  graph_skeleton   jsonb not null,                     -- GraphSkeletonNode[] — KHÔNG có code
  tokens_used      int not null default 0,
  created_at       timestamptz not null default now(),
  last_active_at   timestamptz not null default now()
);
create index on learning_sessions (user_id, source, snapshot_id, subdir, engine_version);  -- Khóa phiên, không unique: "Học lại từ đầu" tạo phiên mới (D-42)

create table session_snapshots (                       -- D-59: kết quả engine của phiên; client không đọc (Mục 3.2)
  session_id  uuid primary key references learning_sessions on delete cascade,
  result      jsonb not null,                          -- StaticEngineResult: node + đoạn code đã cắt + tên; KHÔNG có file nguồn
  created_at  timestamptz not null default now()
);

create table node_progress (                           -- Chỉ node đã có sự kiện; thiếu dòng ⇒ suy ra (Mục 5.1)
  session_id       uuid not null references learning_sessions on delete cascade,
  node_id          text not null,
  status           text check (status in ('AVAILABLE','COMPLETED','FAILED')),  -- null ⇒ suy ra
  analysis_failed  boolean not null default false,
  updated_at       timestamptz not null default now(),
  primary key (session_id, node_id)
);

create table node_runs (                               -- 1 lần học 1 node (D-16); chứa đáp án ⇒ client không đọc (Mục 3.2)
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references learning_sessions on delete cascade,
  node_id     text not null,
  mode        run_mode not null,
  questions   jsonb not null,                          -- RunQuestion[] (Mục 3.1)
  steps       jsonb not null,                          -- RunStepRef[] — chỉ tên, không code (D-36)
  forbidden_external_keywords text[] not null,         -- Từ cấm của repo lúc tạo run — gác gợi ý khi chấm (21)
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create unique index node_runs_one_open on node_runs (session_id, node_id) where finished_at is null;
create index on node_runs (session_id, node_id);

create table question_attempts (                       -- Chỉ thêm, không sửa
  id             bigint generated always as identity primary key,
  run_id         uuid not null references node_runs on delete cascade,
  question_index smallint not null,
  attempt_number smallint not null check (attempt_number between 1 and 3),   -- = CONFIG.MAX_ATTEMPTS_PER_QUESTION
  skill          swe_skill not null,
  core_accuracy  smallint not null,
  simplicity     smallint not null,
  intent         text not null check (intent in ('ANSWER','GIVE_UP','OFF_TOPIC')),
  is_passed      boolean not null,
  points_covered boolean[] not null,
  student_answer text not null check (char_length(student_answer) <= 2000),  -- = CONFIG.ANSWER_MAX_CHARS
  created_at     timestamptz not null default now()
);
create index on question_attempts (run_id);

create table ai_cache (                                -- D-37: văn bản AI đã qua kiểm, dùng chung mọi người học
  cache_key     text primary key,
  kind          text not null check (kind in ('NODE_ANALYSIS','REPO_OVERVIEW','SELECTION_EXPLAIN')),
  payload       jsonb not null,                        -- NodeAnalysis | RepoOverviewRaw | ExplainSelectionRaw
  model         text not null,
  prompt_version text not null,
  tokens_in     int not null,
  tokens_out    int not null,
  created_at    timestamptz not null default now()
);

create table ai_usage (                                -- D-66: lưu vết chi phí L2 từng lời gọi AI; client không đọc (Mục 3.2)
  id          bigint generated always as identity primary key,
  session_id  uuid not null references learning_sessions on delete cascade,
  call_kind   text not null check (call_kind in ('ANALYZE','OVERVIEW','QUESTIONS','GRADE','EXPLAIN')),
  tokens_in   int not null,
  tokens_out  int not null,
  cost_usd    numeric(8,6) not null,
  created_at  timestamptz not null default now()
);
create index on ai_usage (session_id);

create table dispute_reports (                         -- Nút "Báo sai" (D-22) — để nhóm đọc lại
  id             bigint generated always as identity primary key,
  user_id        uuid not null references profiles on delete cascade,
  run_id         uuid not null references node_runs on delete cascade,
  question_index smallint not null,
  note           text not null check (char_length(note) <= 500),           -- = CONFIG.REPORT_NOTE_MAX_CHARS
  created_at     timestamptz not null default now()
);
create index on dispute_reports (run_id);
create index on dispute_reports (user_id);
```

### 3.1. `node_runs.questions` (jsonb) — kiểu `RunQuestion`

Kiểu `RunQuestion`: `02` Mục 7 (D-61). Cột chứa câu hỏi + đáp án nên client không đọc (Mục 3.2). Kiểu `// nội bộ`: `AiUsageRow = { id: number; session_id: string; call_kind: "ANALYZE" | "OVERVIEW" | "QUESTIONS" | "GRADE" | "EXPLAIN"; tokens_in: number; tokens_out: number; cost_usd: number; created_at: string }` lưu vết chi phí L2 (D-66).

### 3.2. Bảo mật hàng (RLS)

- Bật RLS trên **mọi** bảng.
- `select` cho client: `profiles`, `skill_states`, `learning_sessions`, `dispute_reports` khi `auth.uid() = user_id`; `node_progress` khi `session_id` thuộc phiên của `auth.uid()`.
- `ai_cache`, `ai_usage`, `node_runs`, `question_attempts`, `session_snapshots`: **không có chính sách nào** cho client (chứa đáp án — INV-07; chứa `symbol_whitelist`, `suspicious_instruction_files` — API-03; đọc qua endpoint).
- Không có chính sách `insert/update/delete` cho client ở bất kỳ bảng nào (API-02).

### 3.3. Khóa cache AI

`cache_key` theo loại:
- `NODE_ANALYSIS`: `na|{source}|{snapshot_id}|{subdir}|{engine_version}|{node_id}|{PROMPT_VERSION}|{LLM_MODEL}`
- `REPO_OVERVIEW`: `ov|{source}|{snapshot_id}|{subdir}|{engine_version}|{PROMPT_VERSION}|{LLM_MODEL}`
- `SELECTION_EXPLAIN`: `se|{source}|{snapshot_id}|{subdir}|{engine_version}|{node_id}|{step_number}|{line_start}:{col_start}-{line_end}:{col_end}|{PROMPT_VERSION}|{LLM_MODEL}`

Câu hỏi không cache: mỗi run sinh mới và lưu trong `node_runs`; chấm bài không cache (D-37). Hai yêu cầu trùng khóa cùng lúc trong 1 instance dùng chung một promise (in-flight map); khác instance ⇒ ghi `on conflict do nothing`.

---

## 4. Định danh phiên & cache RAM

- **Khóa phiên:** `(user_id, source, snapshot_id, subdir, engine_version)`; trùng khóa ⇒ mở phiên có `last_active_at` mới nhất.
  - GitHub: `snapshot_id` = commit SHA 40 hex đọc từ comment EOCD của zip codeload (`10` Mục snapshot), hoặc từ GitHub API khi tải chọn lọc (`10` ING-46). Comment không khớp `/^[0-9a-f]{40}$/` ⇒ `ARCHIVE_HASH` = SHA-256 của **toàn bộ** buffer zip; phiên vẫn mở lại được từ `session_snapshots` (D-59).
  - Upload `.zip`: `ARCHIVE_HASH` = SHA-256 của buffer.
- **Phiên gắn snapshot (D-39, D-59):** phiên luôn dùng `StaticEngineResult` đã lưu lúc tạo; không chạy lại engine, không tải lại zip. Repo có commit mới ⇒ dán link ra SHA mới ⇒ bản đồ và phiên mới.
- **Cache RAM `StaticEngineResult`** (API-08): LRU `CONFIG.INGESTION_CACHE_MAX_ENTRIES`, TTL `CONFIG.INGESTION_CACHE_TTL_MS`, hai tầng:
  - alias `owner/repo` + `subdir_override` (link đã chuẩn hóa, `10` ING-04) `⇒ snapshot_id`;
  - kết quả `snapshot_id|subdir|engine_version ⇒ StaticEngineResult`.

### `getSessionStaticResult(session)`

| Tình huống | Xử lý |
| :-- | :-- |
| Trúng cache RAM | Dùng kết quả đó |
| Trượt cache | Đọc `session_snapshots.result` của phiên, nạp vào cache RAM. Giống hệt lần đầu, kể cả phiên `.zip` (D-59) |
| Phiên thiếu dòng `session_snapshots` (lỗi bất thường) | `COMMIT_SHA` ⇒ tải `codeload.github.com/{owner}/{repo}/zip/{sha}`, chạy lại Tầng 0–2, so `node_id` + `prerequisites` với `graph_skeleton`, khớp ⇒ ghi bù `session_snapshots`; lệch ⇒ ghi log lỗi, `ERR_SESSION_ENGINE_OUTDATED`; 404 hoặc `ARCHIVE_HASH` ⇒ `ERR_SESSION_NOT_FOUND` |

---

## 5. Suy ra trạng thái (hàm thuần, dùng chung client và server)

### 5.1. `deriveNodeStates(skeleton, progressRows): Record<node_id, Pick<NodeStateView, "node_id" | "status" | "has_warning" | "analysis_failed">>`

Duyệt các node theo thứ tự tô-pô (hòa ⇒ `node_id` tăng dần):
1. Dòng `node_progress` có `status` ≠ null ⇒ dùng `status` đó.
2. Ngược lại ⇒ `AVAILABLE` nếu mọi node cha **đã thông**, nếu không ⇒ `LOCKED`. Node gốc luôn thỏa.
   - Node cha **đã thông** khi trạng thái của nó ∈ {`COMPLETED`, `FAILED`} **hoặc** (nó `AVAILABLE` **và** `analysis_failed = true`) — D-03.
3. `has_warning = true` khi node không `LOCKED` và có ≥ 1 node cha `FAILED` hoặc được thông nhờ `analysis_failed`.

Không có chuyển trạng thái `FAILED → AVAILABLE` (D-16) và không có ôn tập (D-35): node `FAILED` giữ đỏ, node con không bao giờ bị khóa ngược.

### 5.2. Mài mòn (chỉ hiển thị, D-35)

Không đổi trạng thái node, không có nút ôn. Client tính từ `profile` bằng `bkt-engine` (`getDecayedMastery`, `now = Date.now() + server_clock_offset_ms`); quy tắc hiển thị ở `22`, `30`.

### 5.3. Kế hoạch câu hỏi không bao giờ rỗng (D-34)

Không có node miễn thi. Mọi kỹ năng của node đã thạo ⇒ `planNodeQuestions` vẫn trả 1 câu cho kỹ năng có điểm thấp nhất của node (`22`). Node chỉ `COMPLETED` / `FAILED` khi run `LEARN` xong (Mục 6.5).

### 5.4. Đổi persona

Chỉ ghi `skill_states` (Mục 6.7); UI gọi lại `GET /api/me`. Trạng thái node không đổi.

---

## 6. Luồng ghi

Mọi lời gọi AI thành công (`analyze-node`, `analyze-overview`, `enrich-node`, `evaluate-feynman`, `explain-selection`): server ghi 1 dòng vào `ai_usage` (`session_id`, `call_kind`, `tokens_in`, `tokens_out`, `cost_usd`) ngoài transaction học; lỗi ghi DB ở bước này chỉ log cảnh báo, không làm hỏng request của người học (D-66).

### 6.1. `enrich-node` — tạo run, lưu câu hỏi + đáp án

```typescript
// src/server/enrich.ts
async function enrichNode(req: EnrichNodeRequest, userId: string): Promise<EnrichNodeResponse> {
  const now = Date.now();
  const session = await getOwnedSession(req.session_id, userId);
  const open = await db.findOpenRun(session.id, req.node_id);            // Idempotent (tải lại trang, tab khác): trả lại đúng run, không dựng engine
  if (open) return buildEnrichResponse(open);

  const state = await loadNodeState(session, req.node_id);               // deriveNodeStates + node_progress; node_id lạ ⇒ ERR_NODE_NOT_AVAILABLE
  if (state.status !== "AVAILABLE") throw ERR_NODE_NOT_AVAILABLE;
  const analysis = await aiCache.get(analysisKey(session, req.node_id));
  if (!analysis) throw ERR_ANALYSIS_NOT_READY;
  const profile = await loadProfile(userId);                             // skill_states ⇒ LearnerCognitiveProfile
  const graph = await getSessionStaticResult(session);                   // Đoạn code đã lưu (D-59) để AI đặt câu hỏi
  const node = mustFindNode(graph, req.node_id);
  const plan = planNodeQuestions(analysis, profile.skills, now, node.trace_steps.length); // 22; luôn ≥ 1 câu (Mục 5.3)
  // A5b: lấy tối đa CONFIG.HISTORY_MISSED_POINTS_MAX ý hụt cùng kỹ năng (join question_attempts → node_runs → learning_sessions theo user_id, lọc skill)
  const questions: RunQuestion[] = await generateQuestions(session, graph, node, analysis, plan); // 20: không cache (D-37); có <learner_history> nếu có ý hụt; câu hỏng ⇒ gọi lại riêng 1 lần ⇒ vẫn hỏng ⇒ DROPPED
  if (questions.every(q => q.ended_by === "DROPPED")) throw ERR_AI_REJECTED;          // Không tạo run; UI hiện "Thử lại"
  const run = await db.createRun(session.id, node.id, "LEARN", questions, toStepRefs(node), forbiddenKeywords(graph)); // Vi phạm node_runs_one_open (2 tab) ⇒ đọc lại run đang mở, trả như nhánh idempotent
  await db.touchSession(session.id);
  return buildEnrichResponse(run);                                       // Không có đáp án của câu chưa xong (API-03)
}
```

Đọc lịch sử ý hụt (A5b): join `question_attempts` → `node_runs` → `learning_sessions` theo `user_id`, lọc `skill`, lấy tối đa `CONFIG.HISTORY_MISSED_POINTS_MAX` ý hụt mới nhất trước.

### 6.2. `evaluate-feynman` — kiểm ⇒ chấm ⇒ khóa ⇒ ghi (D-18)

```mermaid
flowchart TD
  A["POST /api/evaluate-feynman"] --> B{"1 · Độ dài & Từ ngữ"}
  B -- "sai độ dài" --> EB["ERR_ANSWER_TOO_*<br/>không tính lượt"]
  B -- "có từ xấu" --> EIN["ERR_ANSWER_INAPPROPRIATE<br/>0 token · không tính lượt"]
  B -- "hợp lệ" --> C{"2 · Đọc DB, không khóa<br/>run · đáp án (D-36) · lượt trước (A5a) · tra tên (M1)"}
  C -- "DB lỗi" --> EC["ERR_PERSISTENCE_UNAVAILABLE<br/>không gọi AI, không tính lượt"]
  C -- "câu đã xong · lệch lượt · trùng lần trước" --> ED["ERR_QUESTION_FINISHED · ERR_ATTEMPT_OUT_OF_SYNC<br/>ERR_ANSWER_DUPLICATE · không tính lượt"]
  C -- "hợp lệ" --> D{"3 · isInjection?"}
  D -- "có" --> D1["injectionGrading<br/>0 token, vẫn tính 1 lượt"]
  D -- "không" --> D2["gradeWithAI<br/>(che secret, PII bằng maskSensitive)"]
  D2 -- "hết quota · AI hỏng" --> EE["ERR_TOKEN_QUOTA_EXCEEDED · ERR_AI_UNAVAILABLE<br/>không tính lượt"]
  D1 --> F["decidePass + decideFollowUp"]
  D2 -- "có kết quả" --> F
  F --> G{"4 · Transaction ngắn<br/>khóa run · ghi lượt (che PII) · BKT · finalizeRunIfDone"}
  G -- "ghi xong" --> OK["EvaluateFeynmanResponse"]
  G -- "DB lỗi sau DB_RETRY_DELAYS_MS" --> RC["ERR_PERSISTENCE_UNAVAILABLE<br/>bỏ kết quả chấm, không tính lượt · Thử lại (D-40)"]
```

```typescript
// src/server/evaluate.ts
async function evaluateFeynman(req: EvaluateFeynmanRequest, userId: string): Promise<EvaluateFeynmanResponse> {
  const now = Date.now();
  // 1. Đầu vào (0 token, 0 DB)
  validateAnswerLength(req.student_answer);                              // src/lib/similarity.ts, dùng chung với client: số ký tự không phải khoảng trắng < ANSWER_MIN_CHARS ⇒ _TOO_SHORT; độ dài thô > ANSWER_MAX_CHARS ⇒ _TOO_LONG
  if (hasInappropriateWords(req.student_answer)) throw ERR_ANSWER_INAPPROPRIATE; // moderation.ts: có từ xấu ⇒ 400, không tính lượt, không gọi AI (D-65)
  const cleanAnswer = maskSensitive(redactSecrets(req.student_answer).code); // secret ⇒ <REDACTED_SECRET>, PII ⇒ *** trước khi gọi AI và lưu

  // 2. Đọc KHÔNG khóa — DB lỗi ⇒ ERR_PERSISTENCE_UNAVAILABLE, không gọi AI
  const { run, session } = await readForGrading(req, userId);           // run thuộc phiên của userId, 1 ≤ question_index ≤ n — sai ⇒ ERR_SESSION_NOT_FOUND
  const q = run.questions[req.question_index - 1];                      // Câu hỏi + đáp án mẫu + ý bắt buộc đọc từ DB (D-36)
  if (run.finished_at || q.finished) throw ERR_QUESTION_FINISHED;
  if (req.attempt_number !== q.attempts_used + 1) throw ERR_ATTEMPT_OUT_OF_SYNC;
  if (q.last_answer && similarity(cleanAnswer, q.last_answer) >= CONFIG.ANSWER_DUPLICATE_SIMILARITY) throw ERR_ANSWER_DUPLICATE;
  // A5a: từ lượt 2, đọc lượt trước của câu (question_attempts: student_answer, points_covered).
  // M1: đọc snapshot phiên (RAM/session_snapshots) tra tối đa CONFIG.GRADE_REFERENCED_MAX tên hàm khớp node khác (ưu tiên node điều kiện; chỉ tên, không snippet/code, D-36; lỗi snapshot ⇒ bỏ qua).

  // 3. Chấm (ngoài transaction, gửi cleanAnswer đã che)
  const maxAttempts = CONFIG.MAX_ATTEMPTS_PER_QUESTION;
  const t = { ...q, steps: run.steps, forbidden_external_keywords: run.forbidden_external_keywords }; // GradeContext (20 AI-27)
  const grading = isInjection(cleanAnswer)                              // 21: chuẩn hóa NFC rồi chỉ bắt mẫu câu lệnh
    ? injectionGrading(q)                                               // 0 điểm, OFF_TOPIC, không gợi ý, 0 token — VẪN tính 1 lượt
    : await gradeWithAI(t, cleanAnswer, req.attempt_number, maxAttempts, session); // 20: không code_context (D-36); quota ⇒ ERR_TOKEN_QUOTA_EXCEEDED; hỏng ⇒ ERR_AI_UNAVAILABLE
  const isPassed = decidePass(grading, q.must_have_points, cleanAnswer); // D-13
  const followUp = decideFollowUp(grading, req.attempt_number, maxAttempts, isPassed, t, cleanAnswer); // 20, 21

  // 4. Transaction ngắn — DB lỗi sau CONFIG.DB_RETRY_DELAYS_MS ⇒ ERR_PERSISTENCE_UNAVAILABLE, bỏ kết quả chấm (D-40)
  return withDbRetry(() => db.tx(async (tx) => {
    const run2 = await tx.lockRun(run.id);                               // SELECT … FOR UPDATE
    const q2 = run2.questions[req.question_index - 1];
    if (q2.finished || q2.attempts_used !== req.attempt_number - 1) throw ERR_ATTEMPT_OUT_OF_SYNC; // Bỏ kết quả chấm
    await tx.insertAttempt(run2.id, q2, { ...req, student_answer: cleanAnswer }, grading, isPassed); // 4.1: lưu câu trả lời đã che
    q2.attempts_used += 1; q2.last_answer = cleanAnswer;                 // 4.2
    let skillChange: SkillChange | null = null;
    if (isPassed || q2.attempts_used === maxAttempts) {                  // 4.3 Câu xong
      q2.finished = true; q2.ended_by = "ANSWER";
      q2.outcome = outcomeOf(isPassed, q2.attempts_used);                // 22: lượt 1 ⇒ PASS_FIRST
      skillChange = await applyBkt(tx, userId, q2.skill, q2.outcome, now); // 22
      q2.p_before = skillChange.p_before; q2.p_after = skillChange.p_after;
    }
    await tx.saveRunQuestions(run2);                                     // 4.4
    const unlocked = await finalizeRunIfDone(tx, run2, now);             // 4.5: Mục 6.5
    return toEvaluateResponse(req, grading, isPassed, followUp, q2, skillChange, unlocked, await tx.loadNodeState(run2));
  }));
}
```

Quy tắc mở đáp án: `question.reveal` chỉ có khi câu `finished` (đạt, hết lượt, hoặc bỏ qua). Response không bao giờ có `misconception`, `reference_answer` của câu chưa xong, hay `quote` của AI.

### 6.3. `reveal` — "Bỏ qua câu này"

1. Đọc run theo `run_id`, `question_index` như 6.2 bước 2.
2. Khóa run. Câu phải chưa xong, ngược lại `ERR_QUESTION_FINISHED`.
3. Đặt `finished = true`, `outcome = FAILED`, `ended_by = SKIP`.
4. `applyBkt(FAILED)`.
5. `finalizeRunIfDone`, rồi trả `RevealResponse` kèm `reveal`.

0 token. DB lỗi ⇒ `ERR_PERSISTENCE_UNAVAILABLE`, không đổi gì (D-40).

### 6.4. `report-wrong` — "Báo sai" (D-22)

1. Khóa run. Câu phải có `outcome = FAILED`, `ended_by = ANSWER`, `disputed = false`; ngược lại `ERR_REPORT_NOT_ALLOWED`.
2. Đặt `disputed = true`.
3. Nếu `skill_states.p_mastery` của kỹ năng đúng bằng `p_after` (sai số `CONFIG.BKT_REVERT_EPSILON`): đặt lại `p_mastery = p_before` (`p_before` là điểm **đã decay** dùng làm tiên nghiệm lúc cập nhật), `practice_count -= 1`, giữ nguyên `last_practiced_at` và `correct_count` (`revertSkillChange`, `22`).
4. Insert `dispute_reports` (ghi chú `note` được che theo thứ tự `maskSensitive(redactSecrets(note).code)` trước khi lưu; secret ⇒ `<REDACTED_SECRET>`, PII ⇒ `***`).
5. Tính lại màu node (Mục 6.5, câu `disputed` bị bỏ qua).
6. Trả `ReportWrongResponse`.

### 6.5. `finalizeRunIfDone(tx, run, now)`

Run xong khi mọi câu `finished`. Câu `DROPPED` và câu `disputed` không tính khi xét màu: có câu `FAILED` ⇒ node `FAILED`; ngược lại `COMPLETED`. Sau đó đặt `finished_at`, upsert `node_progress`, trả `unlocked_node_ids` (node vừa từ `LOCKED` sang `AVAILABLE`).

### 6.6. `analyze-node` / `analyze-overview` / `ingest`

- **`analyze-node`:** phiên hợp lệ ⇒ dựng khung ⇒ trúng `ai_cache` ⇒ trả ngay. Trượt ⇒ kiểm quota ⇒ gọi AI qua in-flight map ⇒ kiểm theo `21`.
  - Kỹ năng còn lại sau kiểm = 0 sau thử lại ⇒ `analysis_failed = true`, không cache.
  - Phần chữ trượt gác 2 lần ⇒ `skeleton_only = true`, vẫn cache.
  - Thành công ⇒ xóa `analysis_failed`.
  - Client chỉ gọi cho node đang mở và 1–2 node kế tiếp (D-46), tối đa `CONFIG.ANALYZE_CONCURRENCY` node cùng lúc.
- **`analyze-overview`:** gọi được ngay sau khi quét, không chờ phân tích node. Trúng `ai_cache` ⇒ trả ngay. Trượt ⇒ kiểm quota ⇒ gọi AI qua in-flight map ⇒ kiểm theo `21`. Server dựng gói ngữ cảnh từ `StaticEngineResult` của phiên (tên repo, `readme_excerpt`, `manifest_description`, route, thực thể, nhóm, tên bài, cạnh). Không nhận dữ liệu từ client, không gửi code cho AI. AI hỏng sau thử lại hoặc bị cổng gác chặn ⇒ `ai: null`, vẫn trả `facts`, không cache.
- **`ingest`:**
  - Semaphore `MAX_CONCURRENT_INGESTIONS` (trong 1 instance); chờ quá `INGEST_QUEUE_TIMEOUT_MS` ⇒ `ERR_SERVER_BUSY`.
  - Upload zip: client kiểm `CONFIG.MAX_UPLOAD_BYTES` trước khi gửi; vượt ⇒ `ERR_STREAM_QUOTA_EXCEEDED`.
  - `{ repo_url }` / upload: chạy Tầng 0–2 (`10`, `11`) ⇒ trùng khóa phiên ⇒ mở phiên đó (`resumed = true`) và trả kết quả đã lưu của phiên đó; không ⇒ tạo phiên mới, ghi `learning_sessions` + `session_snapshots` trong 1 transaction (D-59). Ghi chạy **sau** khi có kết quả, không tính vào mục tiêu cold-start.
  - `{ session_id }`: `engine_version` khác `CONFIG.ENGINE_VERSION` ⇒ `ERR_SESSION_ENGINE_OUTDATED`; đọc theo Mục 4.
  - `{ session_id, restart: true }` — "Học lại từ đầu" (D-42): tạo phiên mới cùng snapshot + `graph_skeleton` + chép `session_snapshots.result`; `node_progress` trống; `skill_states` giữ nguyên; câu hỏi sinh mới khi `enrich-node`.
  - Trả `analyses` có sẵn trong cache.

### 6.7. `demo/persona`

- `process.env[CONFIG.DEMO_MODE_ENV] !== "true"` ⇒ `ERR_DEMO_MODE_DISABLED`.
- Ngược lại upsert đủ 16 dòng `skill_states`: `p_mastery = PERSONAS[mode].initial_p_mastery`, `last_practiced_at = now − days_idle · CONFIG.MS_PER_DAY`, `practice_count = 1`, `correct_count = 1`.
- Chỉ tài khoản đang đăng nhập; nhóm dùng tài khoản demo riêng, không dùng tài khoản thật của thành viên.

### 6.8. `GET /api/health` — Healthcheck (D-64)

Không cần đăng nhập (ngoại lệ API-04), không gọi DB, không gọi AI, không log body request. Trả về ngay HTTP 200 với body `ok` (`text/plain`, 0 token). Dùng làm startup probe cho Cloud Run (`05`) và smoke test cho CI/CD.

### 6.9. `explain-selection`

1. Đọc `StaticEngineResult` theo Mục 4. `node_id` hoặc `step_number` không có trong snapshot ⇒ `ERR_SELECTION_INVALID`.
2. Kiểm vùng chọn: dùng `snippet_line_map` cắt lại đoạn chọn từ `snippet` của bước. Dòng không có trong map, dòng marker, đoạn cắt khác `selected_text` (so theo `20` AI-38), hoặc dài hơn `CONFIG.EXPLAIN_SELECTION_MAX_CHARS` ⇒ `ERR_SELECTION_INVALID`. AI chỉ nhận đoạn server cắt.
3. Dựng `references` bằng code (`20`).
4. Trúng `ai_cache` ⇒ trả ngay, không tính lượt.
5. Đếm lượt: số dòng `ai_usage` có `call_kind` = `EXPLAIN` của phiên ≥ `CONFIG.EXPLAIN_MAX_PER_SESSION` ⇒ `ERR_EXPLAIN_LIMIT`. Kiểm quota như Mục 1.
6. Gọi AI qua in-flight map, ngoài transaction. Lỗi sau thử lại ⇒ `ERR_AI_UNAVAILABLE`.
7. Kiểm theo `21`. Qua ⇒ ghi `ai_cache`, trả kết quả. Trượt ⇒ `explanation = null`, không gọi lại, không cache.
8. Không đọc câu hỏi, đáp án, dữ liệu người học. Không đổi tiến độ, BKT, `reveal`.

---

## 7. Sự cố & tình huống biên

| Tình huống | Xử lý |
| :-- | :-- |
| Hai tab nộp cùng một câu | Bước 2 hoặc bước khóa của 6.2 ⇒ tab chậm nhận `ERR_ATTEMPT_OUT_OF_SYNC`; UI tải lại run và báo "Câu này vừa được nộp ở tab khác" |
| Postgres lỗi (đọc hoặc ghi) | `ERR_PERSISTENCE_UNAVAILABLE`, không tính lượt; UI hiện nút "Thử lại" (D-40) |
| AI lỗi khi chấm | `ERR_AI_UNAVAILABLE`, không tính lượt, UI hiện "Thử lại" (D-03) |
| Hết quota phiên | `ERR_TOKEN_QUOTA_EXCEEDED` cho mọi lời gọi AI mới; câu đang làm không nộp được; chế độ Offline chỉ dành cho repo demo |
| Commit bị force-push xóa / repo bị xóa hoặc chuyển private | Phiên cũ vẫn học tiếp từ `session_snapshots` (D-59); dán link mới ⇒ phiên mới |
| Chế độ Offline (`Ctrl+Shift+D`) | Không gọi API học; không ghi Postgres; nhãn "Chế độ Offline — dữ liệu ghi lại, không lưu tiến độ" |
| Câu trả lời chứa thông tin cá nhân / secret | Đã che secret ⇒ `<REDACTED_SECRET>`, PII (email, SĐT, CCCD) ⇒ `***` trước khi gửi AI và lưu DB; xóa theo tài khoản (D-65) |

---

## 8. Biến môi trường (server)

| Biến | Dùng cho | Ghi chú |
| :-- | :-- | :-- |
| `DATABASE_URL` | Kết nối Postgres qua Supavisor Transaction Pooler (port 6543) | Driver `postgres` 3.x, `prepare: false`, chứa mật khẩu DB, chỉ server, cấm ghi log (D-65); trên Cloud Run lấy từ Secret Manager (D-64) |
| `GEMINI_BACKEND` | Chọn kênh gọi AI | `"vertex"` (mặc định Cloud Run production/staging) hoặc `"studio"` (Vercel dự phòng, dev) (D-66) |
| `GOOGLE_CLOUD_PROJECT` | Project ID của Google Cloud | Bắt buộc khi `GEMINI_BACKEND="vertex"`; Cloud Run tự nạp hoặc cấu hình env (D-66) |
| `AI_DISABLED` | Khóa khẩn cấp toàn bộ lời gọi AI | `"true"` khi nhận cảnh báo ngân sách 100% ⇒ trả ngay `ERR_AI_UNAVAILABLE`; mặc định `"false"` (D-66) |
| `GEMINI_API_KEY` | 5 lời gọi AI qua Google AI Studio | Chỉ bắt buộc khi `GEMINI_BACKEND="studio"`; Cloud Run gọi qua Vertex AI bằng service account, không có key này (D-64, D-66) |
| `GITHUB_TOKEN` | Tải chọn lọc repo lớn (`10` Mục 4A) | Chỉ server; token chỉ đọc repo công khai; thiếu ⇒ ING-49; trên Cloud Run lấy từ Secret Manager (D-64) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client đăng nhập GitHub | Công khai được; `NEXT_PUBLIC_SUPABASE_ANON_KEY` nhận publishable key `sb_publishable_…` |
| `SUPABASE_SERVICE_ROLE_KEY` | Dự phòng thao tác quản trị Supabase; không dùng cho truy vấn bảng | Chỉ server; nhận secret key `sb_secret_…`; trên Cloud Run lấy từ Secret Manager (D-64) |
| `DEMO_MODE` | Bật `/api/demo/persona` | `"true"` chỉ ở máy demo |
| `NEXT_PUBLIC_DEMO_MODE` | Client chỉ dùng để hiện menu Persona | Đặt cùng giá trị với `DEMO_MODE`; server vẫn kiểm `DEMO_MODE` |
