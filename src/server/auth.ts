import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "./errors";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
}

let anonClient: SupabaseClient | null = null;

function getAnonClient(): SupabaseClient {
  if (!anonClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    anonClient = createSupabaseClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anonClient;
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return null;
  }
  const match = authHeader.match(/^bearer\s+(\S.*)$/i);
  if (!match) {
    return null;
  }
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

export async function verifyToken(token: string): Promise<AuthenticatedUser> {
  const client = getAnonClient();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    throw new ApiHttpError("ERR_UNAUTHENTICATED");
  }
  const user = data.user;
  return {
    id: user.id,
    email: user.email ?? null,
    user_metadata: (user.user_metadata as Record<string, unknown>) ?? {},
  };
}

export async function authenticateRequest(
  req: Request,
): Promise<AuthenticatedUser> {
  const token = extractBearerToken(req);
  if (!token) {
    throw new ApiHttpError("ERR_UNAUTHENTICATED");
  }
  return verifyToken(token);
}

export function safeNextPath(next: string | null): string {
  if (!next || typeof next !== "string") {
    return "/";
  }
  if (
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\") ||
    next.includes("\\")
  ) {
    return "/";
  }
  return next;
}

export function publicOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const host = forwardedHost.split(",")[0].trim();
    const forwardedProto = request.headers.get("x-forwarded-proto");
    let proto = "https";
    if (forwardedProto) {
      const firstProto = forwardedProto.split(",")[0].trim();
      if (firstProto) {
        proto = firstProto;
      }
    }
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}
