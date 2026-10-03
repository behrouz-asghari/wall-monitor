"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { SymbolSelector, type SymbolOption } from "@/components/dashboard/symbol-selector";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { PRICE_RANGE_ORDER, type TimeRangeKey } from "@/lib/constants";

/**
 * URL-driven filters for the history page: changing symbol/range navigates to
 * `?symbol=..&range=..&page=1`, so the server does the filtering, pagination
 * state stays shareable, and no client-side data fetching is needed.
 */
export function HistoryControls({
  symbols,
  symbol,
  range,
}: {
  symbols: SymbolOption[];
  symbol: string;
  range: TimeRangeKey;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const update = (patch: Record<string, string>): void => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      next.set(key, value);
    }
    if (!("page" in patch)) next.delete("page");
    const query = next.toString();
    router.replace(query ? `/dashboard/history?${query}` : "/dashboard/history");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SymbolSelector
        id="history-symbol"
        symbols={symbols}
        value={symbol}
        onChange={(value) => update({ symbol: value })}
        ariaLabel="نماد"
      />
      <TimeRangeSelector
        id="history-range"
        value={range}
        onChange={(value) => update({ range: value })}
        ranges={PRICE_RANGE_ORDER}
      />
    </div>
  );
}
