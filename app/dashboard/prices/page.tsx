import type { Metadata } from "next";
import { Suspense } from "react";

import { ChartSkeleton } from "@/components/charts/chart-skeleton";
import { PriceHistoryChart } from "@/components/charts/price-history-chart";
import { LastUpdated } from "@/components/dashboard/last-updated";
import { PageHeader } from "@/components/layout/page-header";
import { QuotesTable } from "@/components/tables/quotes-table";
import { Skeleton } from "@/components/ui/skeleton";
import { getPriceHistory, getLatestPrices, resolveTimeRange } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "قیمت‌ها" };

async function PriceChartSection() {
  const [latest, series] = await Promise.all([
    getLatestPrices(),
    getPriceHistory("gold18k", resolveTimeRange("24H")),
  ]);

  const symbols = (latest?.items ?? []).map((item) => ({
    symbol: item.symbol,
    label: item.label,
  }));

  return (
    <PriceHistoryChart
      initial={series}
      defaultSymbol={series.symbol}
      defaultRange="24H"
      symbols={symbols.length > 0 ? symbols : undefined}
      height={360}
      title="تاریخچه قیمت"
    />
  );
}

async function QuotesSection() {
  const latest = await getLatestPrices();
  const items = latest?.items ?? [];

  return (
    <section aria-labelledby="quotes-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="quotes-heading" className="text-sm font-semibold">
          آخرین قیمت‌ها
          <span className="mr-2 text-xs font-normal text-muted-foreground">
            ({items.length} نماد)
          </span>
        </h2>
        <LastUpdated
          value={latest?.collectedAt ?? null}
          label="آخرین جمع‌آوری"
          className="text-xs text-muted-foreground"
        />
      </div>

      <QuotesTable items={items} />

      <p className="text-xs leading-relaxed text-muted-foreground">
        مقادیر خام دقیقاً مطابق منبع ذخیره می‌شوند؛ ضریب نمایش و تعداد اعشار فقط برای نمایش به کار
        می‌روند و مقدار ذخیره‌شده را تغییر نمی‌دهند. نمادهای ناشناخته منبع نیز کامل نگه‌داری
        می‌شوند.
      </p>
    </section>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  );
}

export default function PricesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="قیمت‌ها"
        description="نمودار تاریخچه‌ای و جدول آخرین قیمت همه نمادهای منبع."
      />

      <Suspense fallback={<ChartSkeleton height={360} />}>
        <PriceChartSection />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <QuotesSection />
      </Suspense>
    </div>
  );
}
