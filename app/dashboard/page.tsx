import Link from "next/link";
import { ArrowLeft, Database, Timer, TriangleAlert } from "lucide-react";
import { Suspense } from "react";

import { ChartSkeleton } from "@/components/charts/chart-skeleton";
import { FlowChart } from "@/components/charts/flow-chart";
import { PriceHistoryChart } from "@/components/charts/price-history-chart";
import { FlowSummary } from "@/components/dashboard/flow-summary";
import { LastUpdated } from "@/components/dashboard/last-updated";
import { MarketGrid } from "@/components/dashboard/market-grid";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FEATURED_SYMBOLS, type TimeRangeKey } from "@/lib/constants";
import { formatNumberFa, formatTehranFull } from "@/lib/format";
import {
  getCollectorHealth,
  getFlowHistory,
  getLatestLiveData,
  getLatestPrices,
  getPriceHistory,
  resolveTimeRange,
} from "@/lib/supabase/queries";

/** Skeleton for the market card grid while the section streams in. */
function MarketSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, index) => (
        <Skeleton key={index} className="h-[132px]" />
      ))}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-[96px]" />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sections (async server components streamed via Suspense)                    */
/* -------------------------------------------------------------------------- */

async function MarketSection() {
  const latest = await getLatestPrices();
  const items = latest?.items ?? [];

  // Featured order first; if WallGold renamed everything, fall back to whatever
  // the source actually sent (unknown symbols must always be visible).
  const bySymbol = new Map(items.map((item) => [item.symbol, item]));
  const featured = FEATURED_SYMBOLS.flatMap((meta) => {
    const item = bySymbol.get(meta.symbol);
    return item ? [{ ...item, label: meta.label }] : [];
  });
  const visible = featured.length > 0 ? featured : items.slice(0, 10);

  return (
    <section aria-labelledby="market-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="market-heading" className="text-sm font-semibold">
          بازار
        </h2>
        <LastUpdated
          value={latest?.collectedAt ?? null}
          label="آخرین جمع‌آوری"
          className="text-xs text-muted-foreground"
        />
      </div>
      <MarketGrid items={visible} />
    </section>
  );
}

async function FlowSection() {
  const live = await getLatestLiveData();

  if (!live) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        هنوز داده‌ای از livedata ذخیره نشده است.
      </p>
    );
  }

  return (
    <section aria-labelledby="flows-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="flows-heading" className="text-sm font-semibold">
          جریان نقدینگی
        </h2>
        <LastUpdated
          value={live.collectedAt}
          label="آخرین نمونه"
          className="text-xs text-muted-foreground"
        />
      </div>
      <FlowSummary live={live} />
    </section>
  );
}

async function PriceChartSection() {
  const latest = await getLatestPrices();
  const range = resolveTimeRange("24H");
  const series = await getPriceHistory("gold18k", range);

  const symbols = (latest?.items ?? []).map((item) => ({
    symbol: item.symbol,
    label: item.label,
  }));

  return (
    <section aria-label="نمودار تاریخچه قیمت">
      <PriceHistoryChart
        initial={series}
        defaultSymbol={series.symbol}
        defaultRange={"24H" as TimeRangeKey}
        symbols={symbols.length > 0 ? symbols : undefined}
        height={320}
      />
    </section>
  );
}

async function FlowChartSection() {
  const range = resolveTimeRange("24H");
  const series = await getFlowHistory(range);
  return (
    <section aria-label="نمودار جریان">
      <FlowChart initial={series} defaultRange={"24H" as TimeRangeKey} />
    </section>
  );
}

async function HealthSection() {
  const health = await getCollectorHealth();
  const missingCount = health.missingIntervalsLast2h.length;

  return (
    <section aria-labelledby="health-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="health-heading" className="text-sm font-semibold">
          سلامت داده
        </h2>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/health">
            جزئیات
            <ArrowLeft className="size-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            health.lastRun ? (
              <>
                وضعیت آخرین اجرا: <span className="ltr">{health.lastRun.status}</span>
              </>
            ) : (
              "اجرایی ثبت نشده است"
            )
          }
        />
        <StatCard
          label="تعداد ردیف قیمت"
          icon={Database}
          value={<span className="text-base">{formatNumberFa(health.priceSnapshots)}</span>}
          sub={
            <>
              <span className="ltr">{formatNumberFa(health.pricePayloads)}</span> پاسخ خام ·{" "}
              <span className="ltr">{formatNumberFa(health.livedataSnapshots)}</span> livedata
            </>
          }
        />
        <StatCard
          label="بازه‌های خالی (۲ ساعت اخیر)"
          icon={TriangleAlert}
          tone={missingCount === 0 ? "positive" : "negative"}
          value={<span className="text-base">{formatNumberFa(missingCount)}</span>}
          sub={
            missingCount === 0
              ? "همه دقیقه‌ها پوشش داده شده‌اند"
              : `نمونه: ${formatTehranFull(health.missingIntervalsLast2h[0] as string)}`
          }
        />
        <StatCard
          label="خطاهای ۲۴ ساعت اخیر"
          icon={TriangleAlert}
          tone={health.failedRuns24h === 0 ? "positive" : "negative"}
          value={<span className="text-base">{formatNumberFa(health.failedRuns24h)}</span>}
          sub={
            <>
              <span className="ltr">{formatNumberFa(health.duplicateRuns24h)}</span> اجرای تکراری
              (منبع تغییر نکرده)
            </>
          }
        />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function DashboardOverviewPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="نمای کلی"
        description="جمع‌آوری خودکار هر دقیقه از WallGold — قیمت‌ها، جریان نقدینگی و سلامت کلنکتور."
      />

      <Suspense fallback={<MarketSkeleton />}>
        <MarketSection />
      </Suspense>

      <Suspense fallback={<StatSkeleton />}>
        <FlowSection />
      </Suspense>

      <Suspense fallback={<ChartSkeleton />}>
        <PriceChartSection />
      </Suspense>

      <Suspense fallback={<ChartSkeleton />}>
        <FlowChartSection />
      </Suspense>

      <Suspense fallback={<StatSkeleton />}>
        <HealthSection />
      </Suspense>
    </div>
  );
}
