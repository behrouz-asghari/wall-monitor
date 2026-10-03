import { NextResponse } from "next/server";

import { getFlowHistory } from "@/lib/supabase/queries";
import { resolveTimeRange } from "@/lib/utils";
import { FlowsQuerySchema } from "@/lib/validation";

/**
 * GET /api/flows?range=24h
 *
 * Aggregated deposit / withdraw / net-flow series. `net_flow` is derived at
 * query time (deposit_hour - withdraw_hour) and never stored.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = FlowsQuerySchema.safeParse({
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
    const series = await getFlowHistory(range);

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
