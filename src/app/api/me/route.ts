import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type {
  CognitiveSkillState,
  MeResponse,
  SWESkill,
} from "@/contracts";
import { overallTier } from "@/lib/bkt-engine";
import { authenticateRequest } from "@/server/auth";
import { sql } from "@/server/db";
import { ApiHttpError, toErrorResponse } from "@/server/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface DbRow {
  display_name: string | null;
  skills: unknown;
}

export async function GET(req: Request): Promise<Response> {
  try {
    const user = await authenticateRequest(req);

    let displayName: string | null = null;
    if (typeof user.user_metadata.full_name === "string") {
      displayName = user.user_metadata.full_name;
    } else if (typeof user.user_metadata.user_name === "string") {
      displayName = user.user_metadata.user_name;
    }

    let rows: DbRow[];
    try {
      rows = await sql<DbRow[]>`
        with ins as (
          insert into profiles (user_id, display_name) values (${user.id}, ${displayName})
          on conflict (user_id) do nothing
          returning display_name
        )
        select
          coalesce((select display_name from ins), (select display_name from profiles where user_id = ${user.id})) as display_name,
          coalesce((
            select json_agg(json_build_object(
              'skill', s.skill,
              'p_mastery', s.p_mastery,
              'last_practiced_at', (extract(epoch from s.last_practiced_at) * 1000)::bigint,
              'practice_count', s.practice_count,
              'correct_count', s.correct_count
            )) from skill_states s where s.user_id = ${user.id}
          ), '[]'::json) as skills
      `;
    } catch {
      throw new ApiHttpError("ERR_PERSISTENCE_UNAVAILABLE");
    }

    const row = rows[0];
    const resolvedDisplayName = row?.display_name ?? displayName;

    let parsedSkills = row?.skills;
    if (typeof parsedSkills === "string") {
      try {
        parsedSkills = JSON.parse(parsedSkills);
      } catch {
        parsedSkills = [];
      }
    }

    const skills: Partial<Record<SWESkill, CognitiveSkillState>> = {};
    if (Array.isArray(parsedSkills)) {
      for (const item of parsedSkills) {
        if (item && typeof item === "object" && "skill" in item) {
          const rawItem = item as Record<string, unknown>;
          const skillKey = rawItem.skill as SWESkill;
          skills[skillKey] = {
            skill: skillKey,
            p_mastery: Number(rawItem.p_mastery),
            last_practiced_at: Number(rawItem.last_practiced_at),
            practice_count: Number(rawItem.practice_count),
            correct_count: Number(rawItem.correct_count),
          };
        }
      }
    }

    const now = Date.now();
    const responsePayload: MeResponse = {
      profile: {
        user_id: user.id,
        display_name: resolvedDisplayName,
        skills,
        overall_tier: overallTier(skills, now),
      },
      server_now: now,
    };

    return Response.json(responsePayload);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  try {
    const user = await authenticateRequest(req);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const client = createSupabaseClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.admin.deleteUser(user.id);
    if (error) {
      throw new ApiHttpError("ERR_PERSISTENCE_UNAVAILABLE");
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
