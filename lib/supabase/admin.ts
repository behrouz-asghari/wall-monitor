import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { requireEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Collector / persistence client.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY — a SERVER-ONLY secret that bypasses RLS.
 * Hard rules enforced here:
 *   - never constructed in the browser (throws if attempted)
 *   - never prefixed with NEXT_PUBLIC_
 *   - created lazily so `next build` works without a configured environment
 */

let adminClient: SupabaseClient<Database> | null = null;

export function getAdminClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    throw new Error("getAdminClient() must never be called from the browser.");
  }

  if (adminClient === null) {
    const supabaseUrl = requireEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "Found in Supabase -> Project Settings -> API.",
    );
    const serviceRoleKey = requireEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      "Server-only key; must NOT be exposed to the browser.",
    );

    adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { "x-application-name": "wallgold-data-monitor-collector" },
      },
    });
  }

  return adminClient;
}

/** Test seam: allows the integration tests to inject a mocked client. */
export function setAdminClientForTesting(client: SupabaseClient<Database> | null): void {
  adminClient = client;
}
