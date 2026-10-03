import type { Metadata } from "next";
import { Suspense } from "react";

import { HistoryControls } from "@/components/dashboard/history-controls";
import { PageHeader } from "@/components/layout/page-header";
import { PriceHistoryTable } from "@/components/tables/price-history-table";
import { RawSnapshotsTable } from "@/components/tables/raw-snapshots-table";
import { Skeleton } from "@/components/ui/skeleton";
import { FEATURED_SYMBOLS, type TimeRangeKey } from "@/lib/constants";
import { symbolLabel } from "@/lib/constants";
import {
  getLatestPrices,
  getPriceTablePage,
  getRawSnapshotsPage,
  resolveTimeRange,
} from "@/lib/supabase/queries";
import {
  PaginationParamSchema,
  RangeParamSchema,
  SymbolParamSchema,
} from "@/lib/validation";
import { z } from "zod";

const HistoryQuerySchema = z.object({
  symbol: SymbolParamSchema.default("gold18k"),
  range: RangeParamSchema.default("24H"),
  page: PaginationParamSchema.default(1),
  raw_page: PaginationParamSchema.default(1),
});

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = { title: "تاریخچه" };

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Invalid query input falls back to safe defaults instead of erroring. */
function parseQuery(params: SearchParams): z.infer<typeof HistoryQuerySchema> {
  const result = HistoryQuerySchema.safeParse({
    symbol: single(params.symbol),
    range: single(params.range),
    page: single(params.page),
    raw_page: single(params.raw_page),
  });
  if (result.success) return result.data;
  return HistoryQuerySchema.parse({});
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseQuery(await searchParams);
  const rangeKey = query.range as TimeRangeKey;
  const range = resolveTimeRange(rangeKey);

  const [latest, table, raw] = await Promise.all([
    getLatestPrices(),
    getPriceTablePage({ symbol: query.symbol, range, page: query.page, pageSize: 50 }),
    getRawSnapshotsPage(query.raw_page, 20),
  ]);

  const symbols =
    latest && latest.items.length > 0
      ? latest.items.map((item) => ({ symbol: item.symbol, label: item.label }))
      : FEATURED_SYMBOLS.map((meta) => ({ symbol: meta.symbol, label: meta.label }));

  const knownSymbols = symbols.some((option) => option.symbol === query.symbol)
    ? symbols
    : [...symbols, { symbol: query.symbol, label: symbolLabel(query.symbol) }];

  const rawHref = (page: number): string =>
    `/dashboard/history?symbol=${encodeURIComponent(query.symbol)}&range=${encodeURIComponent(query.range)}&page=${query.page}&raw_page=${page}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="تاریخچه"
        description="جدول صفحه‌بندی‌شده رکوردهای قیمت و فهرست پاسخ‌های خام ذخیره‌شده."
        actions={
          <Suspense fallback={<Skeleton className="h-8 w-[320px]" />}>
            <HistoryControls symbols={knownSymbols} symbol={query.symbol} range={rangeKey} />
          </Suspense>
        }
      />

      <section aria-labelledby="history-table-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="history-table-heading" className="text-sm font-semibold">
            رکوردهای قیمت — <span className="ltr">{query.symbol}</span> ({symbolLabel(query.symbol)})
          </h2>
          <p className="text-xs text-muted-foreground">
            {range.meta.label} · تفکیک {range.bucket === "minute" ? "دقیقه" : range.bucket === "hour" ? "ساعت" : "روز"}
          </p>
        </div>

        <Suspense fallback={<TableRowsSkeleton />}>
          <PriceHistoryTable data={table} symbol={query.symbol} range={query.range} />
        </Suspense>
      </section>

      <section aria-labelledby="raw-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="raw-heading" className="text-sm font-semibold">
            پاسخ‌های خام منبع
          </h2>
          <p className="text-xs text-muted-foreground">
            هر پاسخ موفق به‌صورت JSONB کامل نگه‌داری می‌شود (حفظ یکپارچگی داده در برابر تغییر API).
          </p>
        </div>

        <Suspense fallback={<TableRowsSkeleton />}>
          <RawSnapshotsTable data={raw} buildHref={rawHref} />
        </Suspense>
      </section>
    </div>
  );
}

function TableRowsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  );
}
