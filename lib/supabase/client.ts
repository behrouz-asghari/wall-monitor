import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { requireEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Public-key Supabase clients (anon key only).
 *
 * - `createBrowserSupabaseClient()` — usable in client components; the anon key
 *   is public by design and every write is blocked by RLS.
 * - `createServerSupabaseClient()` — read path for server components/routes;
 *   also anon key (reads are allowed by the RLS SELECT policies), so even the
 *   server rendering path never needs the service-role key.
 *
 * The service-role key lives exclusively in lib/supabase/admin.ts.
 */

function publicEnv(): { url: string; anonKey: string } {
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL", "Found in Supabase -> Project Settings -> API."),
    anonKey: requireEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "Public anon key (safe for the browser bundle).",
    ),
  };
}

let browserClient: SupabaseClient<Database> | null = null;

/** Browser-safe client. Auth state is not used, so sessions are not persisted. */
export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  if (browserClient !== null) return browserClient;

  const { url, anonKey } = publicEnv();
  browserClient = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return browserClient;
}

let serverClient: SupabaseClient<Database> | null = null;

/** Server-only read client (anon key). Used by the query layer. */
export function createServerSupabaseClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    throw new Error("createServerSupabaseClient() must never be called from the browser.");
  }

  if (serverClient !== null) return serverClient;

  const { url, anonKey } = publicEnv();
  serverClient = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { "x-application-name": "wallgold-data-monitor" },
    },
  });
  return serverClient;
}
