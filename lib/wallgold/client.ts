import {
  WALLGOLD_RETRY_DELAYS_MS,
  WALLGOLD_TIMEOUT_MS,
  buildLiveDataUrl,
  buildPricesUrl,
} from "@/lib/constants";
import { createLogger } from "@/lib/logger";

/**
 * HTTP layer for the WallGold public JSON endpoints.
 *
 * Responsibilities are intentionally narrow: build the URL (with a fresh cache
 * buster), perform a plain server-side GET with timeout, retry transient
 * failures a limited number of times, and return the parsed JSON value.
 * No cookies, no auth, no browser headers, no referer — a normal HTTP client.
 */

const log = createLogger("wallgold-client");

export class WallGoldHttpError extends Error {
  readonly url: string;
  readonly status: number;
  readonly attempts: number;

  constructor(message: string, url: string, status: number, attempts: number) {
    super(message);
    this.name = "WallGoldHttpError";
    this.url = url;
    this.status = status;
    this.attempts = attempts;
  }
}

export class WallGoldJsonError extends Error {
  readonly url: string;
  readonly attempts: number;

  constructor(message: string, url: string, attempts: number) {
    super(message);
    this.name = "WallGoldJsonError";
    this.url = url;
    this.attempts = attempts;
  }
}

export class WallGoldNetworkError extends Error {
  readonly url: string;
  readonly attempts: number;

  constructor(message: string, url: string, attempts: number, cause?: unknown) {
    super(message, { cause });
    this.name = "WallGoldNetworkError";
    this.url = url;
    this.attempts = attempts;
  }
}

export interface FetchJsonOptions {
  /** Per-attempt timeout. Defaults to 10s. */
  timeoutMs?: number;
  /**
   * Retry delays in ms. A single fetch + each delay = one attempt, so the
   * default `[500, 1000]` yields attempts: 1 -> 500ms -> 2 -> 1000ms -> 3.
   * Pass `[]` to disable retries.
   */
  retryDelaysMs?: readonly number[];
}

interface AttemptFailure {
  retryable: boolean;
  error: Error;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True for errors worth retrying (timeouts, network, 5xx/429, malformed body). */
function isRetryable(error: unknown): boolean {
  if (error instanceof WallGoldHttpError) {
    return error.status >= 500 || error.status === 429;
  }
  if (error instanceof WallGoldJsonError) return true;
  if (error instanceof WallGoldNetworkError) return true;
  if (error instanceof DOMException) {
    // AbortSignal.timeout() raises `TimeoutError`; aborts raise `AbortError`.
    return error.name === "TimeoutError" || error.name === "AbortError";
  }
  if (error instanceof TypeError) return true; // fetch network failure
  return false;
}

async function attemptFetch(url: string, timeoutMs: number, attempts: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WallGoldNetworkError(`Request failed: ${message}`, url, attempts, error);
  }

  if (!response.ok) {
    throw new WallGoldHttpError(`HTTP ${response.status} for ${url}`, url, response.status, attempts);
  }

  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WallGoldNetworkError(`Failed reading body: ${message}`, url, attempts, error);
  }

  if (text.trim() === "") {
    throw new WallGoldJsonError(`Empty response body from ${url}`, url, attempts);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const snippet = text.slice(0, 120).replace(/\s+/g, " ");
    const message = error instanceof Error ? error.message : String(error);
    throw new WallGoldJsonError(
      `Malformed JSON from ${url}: ${message} (body starts with: ${JSON.stringify(snippet)})`,
      url,
      attempts,
    );
  }
}

/**
 * Fetch a WallGold JSON URL with timeout + bounded retries.
 *
 * Retry policy:
 * - retried: network errors, timeouts, HTTP 5xx/429, empty or malformed bodies
 * - not retried: any other 4xx (obvious client errors)
 */
export async function fetchWallGoldJson(
  url: string,
  options: FetchJsonOptions = {},
): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? WALLGOLD_TIMEOUT_MS;
  const retryDelays = options.retryDelaysMs ?? WALLGOLD_RETRY_DELAYS_MS;
  const maxAttempts = 1 + retryDelays.length;

  let lastFailure: AttemptFailure | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      const delay = retryDelays[attempt - 2] ?? 0;
      log.warn("http_retry", { url, attempt: attempt - 1, nextAttempt: attempt, delayMs: delay });
      await sleep(delay);
    }

    try {
      return await attemptFetch(url, timeoutMs, attempt);
    } catch (error) {
      const failure: AttemptFailure = {
        retryable: isRetryable(error),
        error: error instanceof Error ? error : new Error(String(error)),
      };
      lastFailure = failure;
      if (!failure.retryable) {
        throw failure.error;
      }
    }
  }

  throw (
    lastFailure?.error ??
    new WallGoldNetworkError("Unknown fetch failure", url, maxAttempts)
  );
}

/** Fetch the live-data endpoint with a fresh `?_wg=<timestamp>` cache buster. */
export async function fetchLiveData(options?: FetchJsonOptions): Promise<unknown> {
  return fetchWallGoldJson(buildLiveDataUrl(), options);
}

/** Fetch the prices endpoint with a fresh `?_=<timestamp>` cache buster. */
export async function fetchPrices(options?: FetchJsonOptions): Promise<unknown> {
  return fetchWallGoldJson(buildPricesUrl(), options);
}
