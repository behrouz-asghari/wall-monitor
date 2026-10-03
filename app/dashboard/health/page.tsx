import type { Metadata } from "next";
import { Database, Timer, TriangleAlert } from "lucide-react";
import { Suspense } from "react";

import { DataHealthBadge, type HealthState } from "@/components/dashboard/data-health-badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { RunsTable } from "@/components/tables/runs-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  formatNumberFa,
  formatTehranDateTime,
  formatTehranFull,
} from "@/lib/format";
import {
  getCollectorHealth,
  getMissingIntervals,
  type CollectorHealth,
} from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "سلامت داده" };

function stateFromHealth(health: CollectorHealth): HealthState {
  if (health.lastRun === null) return "unknown";
  if (health.lastRun.status === "failed") return "error";
  const ageMs = Date.now() - new Date(health.lastRun.startedAt).getTime();
  return ageMs <= 10 * 60 * 1000 ? "ok" : "stale";
}

async function MissingIntervalsSection() {
  const to = new Date();
  const from = new Date(to.getTime() - 6 * 60 * 60 * 1000);
  const missing = await getMissingIntervals(from, to);

  return (
    <section aria-labelledby="missing-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="missing-heading" className="text-sm font-semibold">
          بازه‌های خالی جمع‌آوری (۶ ساعت اخیر)
        </h2>
        <span className="text-xs text-muted-foreground">
          {missing.length === 0 ? (
            <span className="text-success">بدون بازه خالی</span>
          ) : (
            <>
              <span className="ltr">{formatNumberFa(missing.length)}</span> دقیقه بدون اجرای کلنکتور
            </>
          )}
        </span>
      </div>

      {missing.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          همه دقیقه‌های این بازه پوشش داده شده‌اند.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {missing.slice(0, 96).map((iso) => (
            <li
              key={iso}
              className="rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
              dir="ltr"
            >
              <time dateTime={iso} className="numeric">
                {formatTehranDateTime(iso)}
              </time>
            </li>
          ))}
          {missing.length > 96 ? (
            <li className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
              و <span className="ltr">{formatNumberFa(missing.length - 96)}</span> مورد دیگر…
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}

function MissingSkeleton() {
  return <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />;
}

export default async function HealthPage() {
  const health = await getCollectorHealth();
  const state = stateFromHealth(health);

  const lastPriceSource = health.lastPriceSourceTs
    ? new Date(health.lastPriceSourceTs * 1000)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="سلامت داده"
        description="وضعیت کلنکتور، پایگاه داده، بازه‌های خالی و زمان‌های مرجع منبع."
        actions={<DataHealthBadge state={state} />}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="آخرین اجرای کلنکتور"
          icon={Timer}
          value={
            health.lastRun ? (
              <span className="text-base">{formatTehranFull(health.lastRun.startedAt)}</span>
            ) : (
              "—"
            )
          }
          sub={
            health.lastRun ? (
              <>
                وضعیت: <span className="ltr">{health.lastRun.status}</span> ·{" "}
                <span className="ltr">{health.lastRun.durationMs ?? "?"}ms</span>
              </>
            ) : (
              "اجرایی ثبت نشده — کرون پیکربندی نشده یا مهاجرت‌ها اعمال نشده‌اند"
            )
          }
        />
        <StatCard
          label="آخرین جمع‌آوری موفق"
          icon={Timer}
          value={
            health.lastSuccessAt ? (
              <span className="text-base">{formatTehranFull(health.lastSuccessAt)}</span>
            ) : (
              "—"
            )
          }
          sub={
            <>
              مجموع اجراها: <span className="ltr">{formatNumberFa(health.totalRuns)}</span>
            </>
          }
        />
        <StatCard
          label="وضعیت پایگاه داده"
          icon={Database}
          tone="positive"
          value={<span className="text-base">اتصال برقرار</span>}
          sub={
            <>
              <span className="ltr">{formatNumberFa(health.priceSnapshots)}</span> ردیف قیمت ·{" "}
              <span className="ltr">{formatNumberFa(health.pricePayloads)}</span> پاسخ خام ·{" "}
              <span className="ltr">{formatNumberFa(health.livedataSnapshots)}</span> livedata
            </>
          }
        />
        <StatCard
          label="خطا / تکراری (۲۴ ساعت)"
          icon={TriangleAlert}
          tone={health.failedRuns24h === 0 ? "positive" : "negative"}
          value={
            <span className="text-base">
              {formatNumberFa(health.failedRuns24h)} / {formatNumberFa(health.duplicateRuns24h)}
            </span>
          }
          sub="ناموفق / اجرای بدون تغییر منبع"
        />
      </div>

      <section aria-labelledby="sources-heading" className="space-y-3">
        <h2 id="sources-heading" className="text-sm font-semibold">
          آخرین زمان‌های مرجع منبع
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="livedata — source_updated_at"
            value={
              health.lastSourceUpdatedAt ? (
                <span className="text-base">{formatTehranDateTime(health.lastSourceUpdatedAt)}</span>
              ) : (
                "—"
              )
            }
            dir="ltr"
          />
          <StatCard
            label="prices — last_realtime_ts"
            value={
              lastPriceSource ? (
                <span className="text-base">{formatTehranDateTime(lastPriceSource)}</span>
              ) : (
                "—"
              )
            }
            dir="ltr"
          />
          <StatCard
            label="قیمت‌ها — collected_at"
            value={
              health.lastCollectedAt ? (
                <span className="text-base">{formatTehranDateTime(health.lastCollectedAt)}</span>
              ) : (
                "—"
              )
            }
            dir="ltr"
          />
        </div>
      </section>

      <Suspense fallback={<MissingSkeleton />}>
        <MissingIntervalsSection />
      </Suspense>

      <section aria-labelledby="runs-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="runs-heading" className="text-sm font-semibold">
            آخرین اجراهای کلنکتور
          </h2>
          <p className="text-xs text-muted-foreground">
            زمان‌بندی: <span className="ltr">*/5 * * * *</span> (هر ۵ دقیقه، از طریق GitHub
            Actions) · احراز هویت با <span className="ltr">CRON_SECRET</span>
          </p>
        </div>
        <RunsTable runs={health.recentRuns} />
      </section>

      <Alert>
        <AlertTitle>تشخیص بازه خالی</AlertTitle>
        <AlertDescription>
          بازه خالی یعنی در آن دقیقه هیچ اجرای کلنکتوری ثبت نشده است. اگر منبع تغییری نکرده باشد،
          اجرا با وضعیت <span className="ltr">duplicate</span> ثبت می‌شود و بازه خالی محسوب نمی‌شود —
          چون جمع‌آوری عملاً انجام شده است.
        </AlertDescription>
      </Alert>
    </div>
  );
}
