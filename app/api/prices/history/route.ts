import { NextResponse } from "next/server";

import { getPriceHistory } from "@/lib/supabase/queries";
import { resolveTimeRange } from "@/lib/utils";
import { PriceHistoryQuerySchema } from "@/lib/validation";

/**
 * GET /api/prices/history?symbol=gold18k&range=24h
 *
 * Aggregated, range-limited price series. Resolution follows the range
 * (1H..24H raw/minute, 3D/7D hourly, 30D daily) so the endpoint never
 * streams thousands of rows.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = PriceHistoryQuerySchema.safeParse({
    symbol: url.searchParams.get("symbol") ?? "",
    range: url.searchParams.get("range") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "invalid_query", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const range = resolveTimeRange(parsed.data.range);
    const series = await getPriceHistory(parsed.data.symbol, range);

    return NextResponse.json({
      success: true,
      data: series,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
