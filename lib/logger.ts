/**
 * Structured collector/application logging.
 *
 * Every event is emitted as a single JSON line so Vercel logs stay greppable:
 *
 *   {"ts":"2026-10-03T10:17:01.000Z","scope":"collector","event":"database_insert",...}
 *
 * A deep redaction pass guarantees we never log secrets (service role key,
 * cron secret, cookies, authorization headers, ...).
 */

export type LogLevel = "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const SENSITIVE_KEY_PATTERN =
  /(secret|token|password|passwd|cookie|authorization|service[_-]?role|api[_-]?key|bearer|credential)/i;

const REDACTED = "[redacted]";

/** Deep-redact any field whose *key* looks sensitive. Values are never inspected. */
export function redact<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(val, depth + 1);
  }
  return out as unknown as T;
}

function emit(level: LogLevel, scope: string, event: string, fields: LogFields): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    scope,
    event,
    ...redact(fields),
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export function createLogger(scope: string): Logger {
  return {
    info: (event, fields = {}) => emit("info", scope, event, fields),
    warn: (event, fields = {}) => emit("warn", scope, event, fields),
    error: (event, fields = {}) => emit("error", scope, event, fields),
  };
}
