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
  explain_count    int not null default 0,             -- Số lượt AI explain-selection đã dùng, so với CONFIG.EXPLAIN_MAX_PER_SESSION
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

alter table profiles enable row level security;
alter table skill_states enable row level security;
alter table learning_sessions enable row level security;
alter table session_snapshots enable row level security;
alter table node_progress enable row level security;
alter table node_runs enable row level security;
alter table question_attempts enable row level security;
alter table ai_cache enable row level security;
alter table ai_usage enable row level security;

create policy "profiles_select" on profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "skill_states_select" on skill_states for select to authenticated using ((select auth.uid()) = user_id);
create policy "learning_sessions_select" on learning_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "node_progress_select" on node_progress for select to authenticated using (exists (select 1 from learning_sessions s where s.id = node_progress.session_id and s.user_id = (select auth.uid())));

-- 5 bảng còn lại (session_snapshots, node_runs, question_attempts, ai_cache, ai_usage) không có chính sách nào cho client: chứa đáp án, code cắt, cache dùng chung hoặc chi phí nội bộ; chỉ đọc/ghi qua backend (Mục 3.2).
