import type { Metadata } from "next";
import { Suspense } from "react";

import { CorrelationChart } from "@/components/charts/correlation-chart";
import { ChartSkeleton } from "@/components/charts/chart-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { FEATURED_SYMBOLS } from "@/lib/constants";
import { getLatestPrices } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "تحلیل همبستگی" };

async function CorrelationSection() {
  const latest = await getLatestPrices();

  const options =
    latest && latest.items.length > 0
      ? latest.items.map((item) => ({ symbol: item.symbol, label: item.label }))
      : FEATURED_SYMBOLS.map((meta) => ({ symbol: meta.symbol, label: meta.label }));

  const preferred = ["gold18k", "price_dollar_rl", "silver"].filter((symbol) =>
    options.some((option) => option.symbol === symbol),
  );
  const defaultSymbols =
    preferred.length > 0 ? preferred : options.slice(0, 3).map((option) => option.symbol);

  return <CorrelationChart symbols={options} defaultSymbols={defaultSymbols} defaultRange="24H" />;
}

/**
 * Analytics page: compare market prices and flows on a common timeline.
 * Labeled "Correlation / Co-movement" — never "Prediction".
 */
export default function CorrelationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="تحلیل همبستگی"
        description="مقایسه سری‌های قیمت و جریان روی یک خط زمانی (نرمال‌سازی min-max)."
      />

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <Suspense fallback={<ChartSkeleton height={360} />}>
          <CorrelationSection />
        </Suspense>
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        هر سری جداگانه بین ۰ تا ۱۰۰ نرمال می‌شود تا واحدهای مختلف (تومان، دلار، حجم جریان) قابل
        مقایسه باشند. نرمال‌سازی فقط مقیاس را تغییر می‌دهد و ترتیب زمانی و شکل داده دست‌نخورده
        می‌ماند.
      </p>
    </div>
  );
}
