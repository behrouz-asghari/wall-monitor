import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/cron/wallgold/route";
import { collectWallGold, type CollectionResult } from "@/lib/wallgold/collector";

vi.mock("@/lib/wallgold/collector", () => ({
  collectWallGold: vi.fn(),
}));

const mockedCollect = vi.mocked(collectWallGold);

const CRON_SECRET = "test-cron-secret-123";

function makeResult(overrides: Partial<CollectionResult> = {}): CollectionResult {
  return {
    success: true,
    collected: true,
    status: "ok",
    collectedAt: "2026-10-03T10:17:01.000Z",
    durationMs: 123,
    liveData: { endpoint: "livedata", ok: true, inserted: true, duplicate: false },
    prices: { endpoint: "prices", ok: true, inserted: true, duplicate: false, rowsInserted: 60 },
    ...overrides,
  };
}

function request(headers: Record<string, string> = {}, url?: string): Request {
  return new Request(url ?? "http://localhost:3000/api/cron/wallgold", { headers });
}

describe("cron route security", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    mockedCollect.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 when CRON_SECRET is not configured (fail closed)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await GET(request({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { success: boolean; error: string };
    expect(body).toEqual({ success: false, error: "cron_secret_not_configured" });
    expect(mockedCollect).not.toHaveBeenCalled();
  });

  it("rejects requests without an Authorization header", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mockedCollect).not.toHaveBeenCalled();
  });

  it("rejects requests with a wrong bearer token", async () => {
    const response = await GET(request({ authorization: "Bearer wrong-token" }));
    expect(response.status).toBe(401);
    expect(mockedCollect).not.toHaveBeenCalled();
  });

  it("accepts the Vercel-style Authorization: Bearer CRON_SECRET header", async () => {
    mockedCollect.mockResolvedValue(makeResult());
    const response = await GET(request({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(response.status).toBe(200);
    expect(mockedCollect).toHaveBeenCalledTimes(1);
  });

  it("accepts ?secret= for manual local testing", async () => {
    mockedCollect.mockResolvedValue(makeResult());
    const response = await GET(
      request({}, `http://localhost:3000/api/cron/wallgold?secret=${CRON_SECRET}`),
    );
    expect(response.status).toBe(200);
    expect(mockedCollect).toHaveBeenCalledTimes(1);
  });

  it("rejects a wrong ?secret= value", async () => {
    const response = await GET(
      request({}, "http://localhost:3000/api/cron/wallgold?secret=nope"),
    );
    expect(response.status).toBe(401);
    expect(mockedCollect).not.toHaveBeenCalled();
  });
});

describe("cron route responses", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    mockedCollect.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the documented success payload", async () => {
    mockedCollect.mockResolvedValue(makeResult());
    const response = await GET(request({ authorization: `Bearer ${CRON_SECRET}` }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      collected: true,
      liveData: true,
      prices: true,
      timestamp: "2026-10-03T10:17:01.000Z",
    });
  });

  it("returns duplicate_snapshot when the source has not changed", async () => {
    mockedCollect.mockResolvedValue(
      makeResult({
        collected: false,
        status: "duplicate",
        reason: "duplicate_snapshot",
        liveData: { endpoint: "livedata", ok: true, inserted: false, duplicate: true },
        prices: { endpoint: "prices", ok: true, inserted: false, duplicate: true, rowsInserted: 0 },
      }),
    );

    const response = await GET(request({ authorization: `Bearer ${CRON_SECRET}` }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      collected: false,
      reason: "duplicate_snapshot",
    });
  });

  it("returns partial success when one endpoint fails", async () => {
    mockedCollect.mockResolvedValue(
      makeResult({
        status: "partial",
        liveData: { endpoint: "livedata", ok: true, inserted: true, duplicate: false },
        prices: {
          endpoint: "prices",
          ok: false,
          inserted: false,
          duplicate: false,
          error: "HTTP 500",
        },
      }),
    );

    const response = await GET(request({ authorization: `Bearer ${CRON_SECRET}` }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, liveData: true, prices: false });
    expect(body.errors).toEqual(["HTTP 500"]);
  });

  it("returns 500 when both endpoints fail", async () => {
    mockedCollect.mockResolvedValue(
      makeResult({
        success: false,
        collected: false,
        status: "failed",
        reason: "all_endpoints_failed",
        liveData: { endpoint: "livedata", ok: false, inserted: false, duplicate: false, error: "boom" },
        prices: { endpoint: "prices", ok: false, inserted: false, duplicate: false, error: "boom2" },
      }),
    );

    const response = await GET(request({ authorization: `Bearer ${CRON_SECRET}` }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ success: false, reason: "all_endpoints_failed" });
  });

  it("maps unexpected collector exceptions to a structured 500", async () => {
    mockedCollect.mockRejectedValue(new Error("Missing required environment variable"));
    const response = await GET(request({ authorization: `Bearer ${CRON_SECRET}` }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ success: false, error: "collector_exception" });
  });

  it("supports POST for manual triggering", async () => {
    mockedCollect.mockResolvedValue(makeResult());
    const response = await POST(request({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(response.status).toBe(200);
  });
});
