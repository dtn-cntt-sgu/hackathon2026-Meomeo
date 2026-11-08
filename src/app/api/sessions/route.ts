import { CONFIG } from "@/contracts";
import type {
  LearningSessionSummary,
  SessionsResponse,
} from "@/contracts";
import { authenticateRequest } from "@/server/auth";
import { sql } from "@/server/db";
import { toErrorResponse } from "@/server/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SessionSummaryRow {
  session_id: string;
  source: "GITHUB" | "ZIP";
  repo_key: string;
  snapshot_id: string;
  snapshot_id_kind: "COMMIT_SHA" | "ARCHIVE_HASH";
  subdir: string;
  ref_label: string | null;
  repo_name: string;
  engine_version: string;
  created_at: string | number;
  last_active_at: string | number;
  total_nodes: string | number;
  completed_count: string | number;
  failed_count: string | number;
}

function toSessionSummary(row: SessionSummaryRow): LearningSessionSummary {
  const outdated = row.engine_version !== CONFIG.ENGINE_VERSION;
  return {
    session_id: row.session_id,
    snapshot: {
      source: row.source,
      repo_key: row.repo_key,
      snapshot_id: row.snapshot_id,
      snapshot_id_kind: row.snapshot_id_kind,
      subdir: row.subdir,
      ref_label: row.ref_label,
    },
    repo_name: row.repo_name,
    engine_version: row.engine_version,
    created_at: Number(row.created_at),
    last_active_at: Number(row.last_active_at),
    completed_count: Number(row.completed_count),
    failed_count: Number(row.failed_count),
    total_nodes: Number(row.total_nodes),
    can_resume: !outdated,
    resume_blocker: outdated ? "ENGINE_UPDATED" : null,
  };
}

// 03 Mục 2: 1 truy vấn, không đọc session_snapshots, không N+1.
// total_nodes lấy từ jsonb_array_length, không kéo graph_skeleton qua mạng.
export async function GET(req: Request): Promise<Response> {
  try {
    const user = await authenticateRequest(req);

    const rows = await sql<SessionSummaryRow[]>`
      select
        s.id as session_id,
        s.source,
        s.repo_key,
        s.snapshot_id,
        s.snapshot_id_kind,
        s.subdir,
        s.ref_label,
        s.repo_name,
        s.engine_version,
        (extract(epoch from s.created_at) * 1000)::bigint as created_at,
        (extract(epoch from s.last_active_at) * 1000)::bigint as last_active_at,
        jsonb_array_length(s.graph_skeleton) as total_nodes,
        count(np.node_id) filter (where np.status = 'COMPLETED') as completed_count,
        count(np.node_id) filter (where np.status = 'FAILED') as failed_count
      from learning_sessions s
      left join node_progress np on np.session_id = s.id
      where s.user_id = ${user.id}
      group by s.id
      order by s.last_active_at desc, s.id
    `;

    const body: SessionsResponse = { sessions: rows.map(toSessionSummary) };
    return Response.json(body);
  } catch (error) {
    return toErrorResponse(error);
  }
}
