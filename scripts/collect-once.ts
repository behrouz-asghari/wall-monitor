/**
 * Run the collector once, manually — useful before wiring up Vercel Cron.
 *
 *   npm run collect:once
 *
 * Loads `.env.local` automatically when present (Next.js convention) and
 * prints the structured collection result. Exit code 0 = at least one endpoint
 * succeeded, 1 = total failure.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

async function main(): Promise<void> {
  const { collectWallGold } = await import("../lib/wallgold/collector");
  const result = await collectWallGold();

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error("[collect-once] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
