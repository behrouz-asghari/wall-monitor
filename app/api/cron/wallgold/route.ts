import { NextResponse } from "next/server";

import { collectWallGold } from "@/lib/wallgold/collector";

/**
 * Vercel Cron endpoint — runs once per minute (see vercel.json).
 *
 * Security: the request must carry Vercel's CRON_SECRET as
 * `Authorization: Bearer <CRON_SECRET>` (Vercel sends it automatically when
 * the CRON_SECRET env var is set). A `?secret=` query parameter is accepted as
 * a convenience for local curl testing. Without a valid secret the endpoint
 * returns 401/503 and does nothing — there is no freely triggerable public
 * endpoint.
 *
 * The handler itself is deliberately thin: fetching, validation, normalization
 * and persistence all live in lib/wallgold/collector.ts.
 */

export const dynamic = "force-dynamic";
/** The collector does up to 2 parallel fetches with bounded retries. */
export const maxDuration = 60;

type AuthResult = { ok: true } | { ok: false; status: 401 | 503; error: string };

async function authorize(request: Request): Promise<AuthResult> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim() === "") {
    return { ok: false, status: 503, error: "cron_secret_not_configured" };
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== null && authorization === `Bearer ${secret}`) {
    return { ok: true };
  }

  // Convenience for local manual runs: curl "...?secret=$CRON_SECRET"
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  if (querySecret !== null && querySecret === secret) {
    return { ok: true };
  }

  return { ok: false, status: 401, error: "unauthorized" };
}

async function handle(request: Request): Promise<NextResponse> {
  const auth = await authorize(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const result = await collectWallGold();

    const body = {
      success: result.success,
      collected: result.collected,
      status: result.status,
      ...(result.reason ? { reason: result.reason } : {}),
      liveData: result.liveData.ok,
      prices: result.prices.ok,
      liveDataInserted: result.liveData.inserted,
      pricesInserted: result.prices.inserted,
      rowsInserted: result.prices.rowsInserted ?? 0,
      durationMs: result.durationMs,
      timestamp: result.collectedAt,
      ...(Object.keys(result.liveData.invalidSymbols ?? {}).length > 0 ||
      Object.keys(result.prices.invalidSymbols ?? {}).length > 0
        ? {
            invalidSymbols: [
              ...Object.keys(result.liveData.invalidSymbols ?? {}),
              ...Object.keys(result.prices.invalidSymbols ?? {}),
            ],
          }
        : {}),
      ...(result.liveData.error || result.prices.error
        ? {
            errors: [result.liveData.error, result.prices.error].filter(
              Boolean,
            ) as string[],
          }
        : {}),
    };

    // A run where both endpoints failed is a real failure (HTTP 500 so Vercel
    // surfaces it), everything else — including duplicates — is a success.
    if (!result.success) {
      return NextResponse.json(body, { status: 500 });
    }
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: "collector_exception", message, timestamp: new Date().toISOString() },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
