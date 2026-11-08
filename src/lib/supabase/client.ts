import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    browserClient = createBrowserClient(url, anonKey);
  }
  return browserClient;
}

export async function signInWithGithub(
  destinationPath?: string,
): Promise<void> {
  const supabase = createClient();
  let redirectTo = `${window.location.origin}/auth/callback`;
  if (destinationPath) {
    redirectTo += `?next=${encodeURIComponent(destinationPath)}`;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo,
    },
  });
  if (error) {
    throw error;
  }
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}
