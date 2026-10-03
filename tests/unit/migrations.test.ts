import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "pgsql-parser";
import { describe, expect, it } from "vitest";

/**
 * Migrations must be reproducible and syntactically valid.
 *
 * This test parses every file in supabase/migrations/ (and seed.sql) with the
 * real Postgres parser (libpg_query via pgsql-parser), so schema mistakes are
 * caught even where no local database is available.
 */

const thisDir = fileURLToPath(new URL(".", import.meta.url));
const supabaseDir = join(thisDir, "..", "..", "supabase");
const migrationsDir = join(supabaseDir, "migrations");

const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

describe("Supabase migrations", () => {
  it("are present", () => {
    expect(migrationFiles.length).toBeGreaterThanOrEqual(2);
    expect(migrationFiles[0]).toMatch(/^\d{5}_/); // supabase CLI naming
  });

  for (const file of migrationFiles) {
    it(`${file} parses as valid PostgreSQL`, async () => {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      const parsed = (await parse(sql)) as { stmts?: unknown[]; version?: number };
      expect(Array.isArray(parsed.stmts)).toBe(true);
      expect(parsed.stmts?.length ?? 0).toBeGreaterThan(0);
    });
  }

  it("the parser actually rejects invalid SQL (sanity check)", async () => {
    await expect(parse("this is definitely not valid sql ((;")).rejects.toThrow();
  });

  it("00001 defines the four required core tables", async () => {
    const sql = readFileSync(join(migrationsDir, migrationFiles[0] as string), "utf8");
    expect(sql).toContain("create table if not exists public.wallgold_livedata");
    expect(sql).toContain("create table if not exists public.wallgold_prices");
    expect(sql).toContain("create table if not exists public.wallgold_price_snapshots");
    // Duplicate protection per spec:
    expect(sql).toContain("unique (source_updated_at)");
    expect(sql).toContain("unique (source_last_realtime_ts)");
    expect(sql).toContain("unique (snapshot_id, symbol)");
    // Raw preservation + UTC timestamps:
    expect(sql).toContain("raw_json                        jsonb not null");
    expect(sql).not.toContain("timestamp without time zone");
    // RLS enabled for every table:
    expect(sql.match(/enable row level security/g)?.length).toBe(3);
  });

  it("00002 defines aggregation, gap-detection and stats functions", async () => {
    const sql = readFileSync(join(migrationsDir, migrationFiles[1] as string), "utf8");
    expect(sql).toContain("create or replace function public.wallgold_price_series");
    expect(sql).toContain("create or replace function public.wallgold_flow_series");
    expect(sql).toContain("create or replace function public.wallgold_missing_intervals");
    expect(sql).toContain("create or replace function public.wallgold_collection_stats");
    expect(sql).toContain("create table if not exists public.wallgold_collection_runs");
    // Parameterized only — no dynamic SQL assembly of user input:
    expect(sql).not.toMatch(/execute\s+.*format\s*\(/i);
  });
});

describe("seed.sql (DEMO DATA)", () => {
  it("parses as valid PostgreSQL and is clearly marked as demo data", async () => {
    const sql = readFileSync(join(supabaseDir, "seed.sql"), "utf8");
    const parsed = (await parse(sql)) as { stmts?: unknown[] };
    expect(parsed.stmts?.length ?? 0).toBeGreaterThan(0);
    expect(sql).toContain("DEMO DATA ONLY");
    expect(sql).toContain("'DEMO_DATA', true");
    expect(sql).toContain("NEVER RUN THIS AGAINST PRODUCTION");
  });
});
