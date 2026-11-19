import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/** Browser client; its cookie session is also seen by route handlers. */
export function browserClient(): SupabaseClient {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return client;
}

let pending: Promise<string | null> | null = null;

/**
 * There is no login: each phone gets a silent anonymous identity the first time it sends
 * something. It keeps witnesses distinct (two photos from one phone never verify a unit)
 * without ever asking for a name. Returns the user id, or null if offline / auth is off.
 */
export function ensureSession(): Promise<string | null> {
  pending ??= (async () => {
    const supabase = browserClient();
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session.user.id;
    const anon = await supabase.auth.signInAnonymously();
    return anon.data.user?.id ?? null;
  })().finally(() => {
    pending = null;
  });
  return pending;
}
