import { CONFIG, PERSONAS, SWE_SKILLS } from "@/contracts";
import type {
  CognitiveSkillState,
  LearnerCognitiveProfile,
  PersonaMode,
  PersonaRequest,
  PersonaResponse,
  SWESkill,
} from "@/contracts";
import type { AuthenticatedUser } from "@/server/auth";
import { db } from "@/server/db";
import { ApiHttpError } from "@/server/errors";
import { withDbRead } from "@/server/progress";
import { overallTier } from "@/lib/bkt-engine";

export function isDemoModeEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[CONFIG.DEMO_MODE_ENV] === "true";
}

export function toPersonaRequest(body: unknown): PersonaRequest {
  if (body !== null && typeof body === "object" && "mode" in body) {
    const mode = (body as { mode: unknown }).mode;
    if (
      typeof mode === "string" &&
      Object.prototype.hasOwnProperty.call(PERSONAS, mode)
    ) {
      return { mode: mode as PersonaMode };
    }
  }
  throw new ApiHttpError("ERR_DEMO_MODE_DISABLED", "Persona không hợp lệ.");
}

export function personaSkillStates(
  mode: PersonaMode,
  now: number,
): CognitiveSkillState[] {
  const p = PERSONAS[mode];
  return SWE_SKILLS.map((skill) => ({
    skill,
    p_mastery: p.initial_p_mastery,
    last_practiced_at: now - p.days_idle * CONFIG.MS_PER_DAY,
    practice_count: 1,
    correct_count: 1,
  }));
}

export async function applyPersona(
  req: PersonaRequest,
  user: AuthenticatedUser,
  now: number = Date.now(),
): Promise<PersonaResponse> {
  let displayName: string | null = null;
  if (typeof user.user_metadata.full_name === "string") {
    displayName = user.user_metadata.full_name;
  } else if (typeof user.user_metadata.user_name === "string") {
    displayName = user.user_metadata.user_name;
  }

  const states = personaSkillStates(req.mode, now);

  const profileRows = await withDbRead(() =>
    db.tx(async (tx) => {
      await tx`
        insert into profiles (user_id, display_name) values (${user.id}, ${displayName})
        on conflict (user_id) do nothing
      `;

      const rows = states.map((s) => ({
        user_id: user.id,
        skill: s.skill,
        p_mastery: s.p_mastery,
        last_practiced_at: new Date(s.last_practiced_at),
        practice_count: s.practice_count,
        correct_count: s.correct_count,
      }));

      await tx`
        insert into skill_states ${tx(rows, "user_id", "skill", "p_mastery", "last_practiced_at", "practice_count", "correct_count")}
        on conflict (user_id, skill) do update set
          p_mastery = excluded.p_mastery,
          last_practiced_at = excluded.last_practiced_at,
          practice_count = excluded.practice_count,
          correct_count = excluded.correct_count
      `;

      return await tx<{ display_name: string | null }[]>`
        select display_name from profiles where user_id = ${user.id}
      `;
    }),
  );

  const resolvedDisplayName = profileRows[0]?.display_name ?? displayName;

  const skills: Partial<Record<SWESkill, CognitiveSkillState>> = {};
  for (const s of states) {
    skills[s.skill] = s;
  }

  const profile: LearnerCognitiveProfile = {
    user_id: user.id,
    display_name: resolvedDisplayName,
    skills,
    overall_tier: overallTier(skills, now),
  };

  return {
    profile,
    server_now: now,
  };
}
