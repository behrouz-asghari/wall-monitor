import { DataHealthBadge, type HealthState } from "@/components/dashboard/data-health-badge";
import { getCollectorHealth } from "@/lib/supabase/queries";

/**
 * Header status pill: reads collector health server-side.
 *
 * Fails soft — if the database or environment is unavailable the header still
 * renders with an "unknown" state instead of breaking the whole layout.
 */
export async function CollectorStatus(): Promise<React.JSX.Element> {
  let state: HealthState = "unknown";
  let lastRunAt: string | null = null;

  try {
    const health = await getCollectorHealth();
    lastRunAt = health.lastRun?.startedAt ?? null;

    if (health.lastRun === null) {
      state = "unknown";
    } else if (health.lastRun.status === "failed") {
      state = "error";
    } else {
      const ageMs = Date.now() - new Date(health.lastRun.startedAt).getTime();
      state = ageMs <= 10 * 60 * 1000 ? "ok" : "stale";
    }
  } catch {
    state = "unknown";
  }

  return (
    <div className="flex items-center gap-2">
      {lastRunAt ? (
        <span className="hidden text-xs text-muted-foreground md:inline ltr">
          last run: {new Date(lastRunAt).toISOString().replace("T", " ").slice(0, 19)}
        </span>
      ) : null}
      <DataHealthBadge state={state} />
    </div>
  );
}
