import { NextResponse } from "next/server";

import { getLatestPrices } from "@/lib/supabase/queries";
import { PricesQuerySchema } from "@/lib/validation";

/**
 * GET /api/prices — latest price snapshot (optionally filtered by symbol).
 * Read-only; no credentials are ever returned.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = PricesQuerySchema.safeParse({
    symbol: url.searchParams.get("symbol") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "invalid_query", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const latest = await getLatestPrices();
    const symbol = parsed.data.symbol;
    const items = symbol ? (latest?.items ?? []).filter((item) => item.symbol === symbol) : (latest?.items ?? []);

    return NextResponse.json({
      success: true,
      data: latest
        ? {
            snapshotId: latest.snapshotId,
            collectedAt: latest.collectedAt,
            sourceLastRealtime: latest.sourceLastRealtime,
            sourceLastRealtimeTs: latest.sourceLastRealtimeTs,
            items,
          }
        : null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
