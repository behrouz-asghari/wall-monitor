import type { Metadata } from "next";
import { Suspense } from "react";

import { ChartSkeleton } from "@/components/charts/chart-skeleton";
import { FlowChart } from "@/components/charts/flow-chart";
import { FlowSummary } from "@/components/dashboard/flow-summary";
import { LastUpdated } from "@/components/dashboard/last-updated";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumberFa, formatTehranDateTime, formatToman } from "@/lib/format";
import { getFlowHistory, getLatestLiveData, resolveTimeRange } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "جریان‌ها" };

async function FlowStatsSection() {
  const live = await getLatestLiveData();

  if (!live) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        هنوز داده‌ای از livedata ذخیره نشده است. پس از اولین اجرای کلنکتور این بخش پر می‌شود.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">خلاصه جریان</h2>
        <LastUpdated
          value={live.collectedAt}
          label="آخرین نمونه"
          className="text-xs text-muted-foreground"
        />
      </div>

      <FlowSummary live={live} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="ترد (آخرین دقیقه)"
          value={
            live.tradeLastMinuteToman === null ? (
              "—"
            ) : (
              <span className="text-base">{formatToman(live.tradeLastMinuteToman)}</span>
            )
          }
        />
        <StatCard
          label="تحویل امروز"
          value={<span className="text-base">{formatNumberFa(live.deliveryTodayCount ?? 0)}</span>}
          sub={
            <>
              درخواست آخرین دقیقه:{" "}
              <span className="ltr">{formatNumberFa(live.deliveryLastMinuteCount ?? 0)}</span>
            </>
          }
        />
        <StatCard
          label="زمان مرجع منبع"
          value={<span className="text-base">{formatTehranDateTime(live.sourceUpdatedAt)}</span>}
          sub={<span className="ltr">updatedAt (source)</span>}
        />
        <StatCard
          label="اعتبار تا"
          value={
            <span className="text-base">
              {live.validUntil ? formatTehranDateTime(live.validUntil) : "—"}
            </span>
          }
          sub={<span className="ltr">validUntil (source)</span>}
        />
      </div>
    </div>
  );
}

async function FlowChartWrapper() {
  const series = await getFlowHistory(resolveTimeRange("24H"));
  return <FlowChart initial={series} defaultRange="24H" />;
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="h-[96px]" />
      ))}
    </div>
  );
}

export default function FlowsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="جریان‌ها"
        description="واریز، برداشت و خالص جریان — net_flow همیشه در زمان پرس‌وجو محاسبه می‌شود."
      />

      <Suspense fallback={<StatsSkeleton />}>
        <FlowStatsSection />
      </Suspense>

      <section aria-label="نمودار جریان" className="rounded-xl border bg-card p-4 shadow-sm">
        <Suspense fallback={<ChartSkeleton height={320} />}>
          <FlowChartWrapper />
        </Suspense>
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        فرمول:{" "}
        <span className="ltr" dir="ltr">
          net_flow = deposit_last_hour_volume_toman − withdraw_last_hour_volume_toman
        </span>{" "}
        — این مقدار ذخیره نمی‌شود و همیشه از ستون‌های مرجع محاسبه می‌گردد.
      </p>
    </div>
  );
}
