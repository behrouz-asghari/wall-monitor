"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartSkeleton } from "@/components/charts/chart-skeleton";
import { SymbolSelector, type SymbolOption } from "@/components/dashboard/symbol-selector";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TIME_RANGES, type TimeRangeKey } from "@/lib/constants";
import {
  formatCompact,
  formatTehranMonthDay,
  formatTehranShort,
  formatTehranTime,
  formatValueWithUnit,
} from "@/lib/format";
import type { PriceSeriesResult } from "@/lib/supabase/queries";
import { cn } from "@/lib/utils";

interface ChartPoint {
  t: string;
  displayPrice: number;
  price: number;
  changePercent: number | null;
  direction: string | null;
}

/**
 * Reusable price history chart.
 *
 * - First render uses server-fetched `initial` data (no waterfall).
 * - Changing symbol/range refetches through GET /api/prices/history.
 * - The Y axis plots the DISPLAY value (divide10/decimals applied for
 *   presentation only); the raw value stays untouched in the database and is
 *   available as `price` on every point.
 */
export function PriceHistoryChart({
  initial,
  defaultSymbol,
  defaultRange = "24H",
  symbols,
  showSelectors = true,
  height = 320,
  title = "تاریخچه قیمت",
}: {
  initial: PriceSeriesResult | null;
  defaultSymbol?: string;
  defaultRange?: TimeRangeKey;
  symbols?: SymbolOption[];
  showSelectors?: boolean;
  height?: number;
  title?: string;
}) {
  const gradientId = useId();

  const [symbol, setSymbol] = useState(defaultSymbol ?? initial?.symbol ?? "gold18k");
  const [range, setRange] = useState<TimeRangeKey>(defaultRange);
  const [data, setData] = useState<PriceSeriesResult | null>(initial);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  // Records which (symbol, range) combo `data` currently represents so the
  // first render can skip an unnecessary refetch.
  const loadedComboRef = useRef<string | null>(
    initial ? `${initial.symbol}|${defaultRange}` : null,
  );

  useEffect(() => {
    const combo = `${symbol}|${range}`;
    if (loadedComboRef.current === combo) return;

    const controller = new AbortController();
    setStatus("loading");

    const query = new URLSearchParams({ symbol, range });
    fetch(`/api/prices/history?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? `HTTP ${response.status}`);
        }
        return (await response.json()) as { success: boolean; data: PriceSeriesResult };
      })
      .then((body) => {
        setData(body.data);
        loadedComboRef.current = combo;
        setStatus("idle");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
  }, [symbol, range]);

  const points: ChartPoint[] = (data?.points ?? []) as unknown as ChartPoint[];
  const bucket = data?.bucket ?? TIME_RANGES[range].bucket;

  const tickFormatter = (value: string): string => {
    if (bucket === "day") return formatTehranMonthDay(value);
    if (bucket === "hour") return formatTehranShort(value);
    return formatTehranTime(value);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          {data ? (
            <span className="text-xs text-muted-foreground">
              <span className="ltr">{data.label}</span> · {TIME_RANGES[range].label}
            </span>
          ) : null}
        </div>

        {showSelectors ? (
          <div className="flex flex-wrap items-center gap-2">
            {symbols && symbols.length > 0 ? (
              <SymbolSelector symbols={symbols} value={symbol} onChange={setSymbol} />
            ) : null}
            <TimeRangeSelector value={range} onChange={setRange} />
          </div>
        ) : null}
      </div>

      {status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>خطا در دریافت تاریخچه</AlertTitle>
          <AlertDescription>
            دریافت داده از سرور ناموفق بود. چند لحظه دیگر دوباره تلاش کنید.
          </AlertDescription>
        </Alert>
      ) : status === "loading" && !data ? (
        <ChartSkeleton height={height} />
      ) : points.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          برای این نماد و بازه زمانی داده‌ای وجود ندارد.
        </p>
      ) : (
        <div dir="ltr" className={cn("w-full", status === "loading" && "opacity-60")}>
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="t"
                tickFormatter={tickFormatter}
                minTickGap={48}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis
                orientation="right"
                width={78}
                tickFormatter={(value: number | string) => formatCompact(Number(value))}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const raw = payload[0]?.payload as ChartPoint | undefined;
                  const value = Number(payload[0]?.value ?? 0);
                  return (
                    <div className="rounded-lg border bg-popover p-3 text-xs shadow-md">
                      <p className="mb-1.5 text-muted-foreground">
                        {formatTehranShort(String(label))}
                      </p>
                      <p className="numeric font-semibold" dir="ltr">
                        {formatValueWithUnit(value, data?.unit ?? "", data?.decimals ?? 0)}
                      </p>
                      {raw?.changePercent !== null && raw?.changePercent !== undefined ? (
                        <p className="numeric text-muted-foreground" dir="ltr">
                          {raw.changePercent > 0 ? "+" : ""}
                          {raw.changePercent.toFixed(2)}%
                        </p>
                      ) : null}
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="displayPrice"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 3 }}
                name="قیمت"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
