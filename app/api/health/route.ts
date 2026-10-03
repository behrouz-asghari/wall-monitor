import { NextResponse } from "next/server";

import { APP_VERSION } from "@/lib/constants";
import { createServerSupabaseClient } from "@/lib/supabase/client";

/**
 * Read-only health probe. Exposes operational state only — never secrets.
 *
 *   { "status": "ok", "database": "ok", "timestamp": "...", "version": "..." }
 */

export const dynamic = "force-dynamic";

interface HealthBody {
  status: "ok" | "degraded";
  database: "ok" | "error";
  collector: "ok" | "stale" | "unknown";
  lastRunAt: string | null;
  timestamp: string;
  version: string;
}

const STALE_AFTER_MS = 10 * 60 * 1000; // 10 minutes without a run = stale

export async function GET(): Promise<NextResponse> {
  const body: HealthBody = {
    status: "degraded",
    database: "error",
    collector: "unknown",
    lastRunAt: null,
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  };
  let statusCode = 503;

  try {
    const db = createServerSupabaseClient();
    // Cheap liveness probe: one indexed row, no full-table count.
    const { data, error } = await db
      .from("wallgold_collection_runs")
      .select("started_at")
      .order("started_at", { ascending: false })
      .limit(1);

    if (error) {
      body.database = "error";
    } else {
      body.database = "ok";
      const lastRunAt = data?.[0]?.started_at ?? null;
      body.lastRunAt = lastRunAt;

      if (lastRunAt === null) {
        body.collector = "unknown";
        body.status = "ok"; // database fine, collector simply has not run yet
        statusCode = 200;
      } else {
        const age = Date.now() - new Date(lastRunAt).getTime();
        body.collector = age <= STALE_AFTER_MS ? "ok" : "stale";
        body.status = body.collector === "ok" ? "ok" : "degraded";
        statusCode = 200;
      }
    }
  } catch {
    body.database = "error";
    body.status = "degraded";
    statusCode = 503;
  }

  return NextResponse.json(body, { status: statusCode });
}
