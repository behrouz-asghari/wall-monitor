"use client";

import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartSkeleton } from "@/components/charts/chart-skeleton";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import type { SymbolOption } from "@/components/dashboard/symbol-selector";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FLOW_RANGE_ORDER, TIME_RANGES, type TimeRangeKey } from "@/lib/constants";
import { formatTehranMonthDay, formatTehranShort, formatTehranTime } from "@/lib/format";
import { normalizeToPercent } from "@/lib/utils";

interface SeriesPayload {
  key: string;
  label: string;
  /** Chronological (t, value) pairs — raw display values. */
  points: { t: string; value: number }[];
}

type MergedRow = Record<string, string | number | null>;

const SERIES_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

async function fetchPriceSeries(
  symbol: string,
  range: TimeRangeKey,
  signal: AbortSignal,
): Promise<SeriesPayload> {
  const query = new URLSearchParams({ symbol, range });
  const response = await fetch(`/api/prices/history?${query.toString()}`, { signal });
  if (!response.ok) throw new Error(`price series HTTP ${response.status}`);
  const body = (await response.json()) as {
    success: boolean;
    data: { label: string; points: { t: string; displayPrice: number }[] };
  };
  if (!body.success) throw new Error("price series request failed");
  return {
    key: symbol,
    label: body.data.label,
    points: body.data.points.map((point) => ({ t: point.t, value: point.displayPrice })),
  };
}

async function fetchNetFlowSeries(range: TimeRangeKey, signal: AbortSignal): Promise<SeriesPayload> {
  const response = await fetch(`/api/flows?range=${encodeURIComponent(range)}`, { signal });
  if (!response.ok) throw new Error(`flows HTTP ${response.status}`);
  const body = (await response.json()) as {
    success: boolean;
    data: { points: { t: string; netFlow: number }[] };
  };
  if (!body.success) throw new Error("flows request failed");
  return {
    key: "net_flow",
    label: "خالص جریان",
    points: body.data.points.map((point) => ({ t: point.t, value: point.netFlow })),
  };
}

/**
 * Correlation / Co-movement chart.
 *
 * Multiple series (market prices + flows) are min-max normalized to 0-100 and
 * drawn on a shared timeline so relative movement is comparable across units.
 * Explicitly NOT a prediction: see the disclaimer rendered above the chart.
 */
export function CorrelationChart({
  symbols,
  defaultSymbols,
  defaultRange = "24H",
  height = 360,
}: {
  symbols: SymbolOption[];
  defaultSymbols: string[];
  defaultRange?: TimeRangeKey;
  height?: number;
}) {
  const [selected, setSelected] = useState<string[]>(defaultSymbols);
  const [includeFlows, setIncludeFlows] = useState(true);
  const [range, setRange] = useState<TimeRangeKey>(defaultRange);
  const [series, setSeries] = useState<SeriesPayload[]>([]);
  const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
  const signatureRef = useRef<string | null>(null);

  /** Nothing to chart = derived at render time; no state churn needed. */
  const nothingSelected = selected.length === 0 && !includeFlows;

  const toggleSymbol = (symbol: string): void => {
    setSelected((current) =>
      current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : [...current, symbol],
    );
    // Loading transitions are driven by user events (allowed), not by the
    // effect below — the effect only fetches and applies results.
    setStatus("loading");
  };

  const toggleFlows = (): void => {
    setIncludeFlows((value) => !value);
    setStatus("loading");
  };

  const handleRangeChange = (next: TimeRangeKey): void => {
    if (next === range) return;
    setRange(next);
    setStatus("loading");
  };

  useEffect(() => {
    const signature = JSON.stringify([selected, includeFlows, range]);
    if (signatureRef.current === signature) return;
    // With nothing selected there is nothing to fetch — the render path
    // already shows the empty state without touching state here.
    if (selected.length === 0 && !includeFlows) return;    const controller = new AbortController();
    const requests: Promise<SeriesPayload>[] = selected.map((symbol) =>
      fetchPriceSeries(symbol, range, controller.signal),
    );
    if (includeFlows) requests.push(fetchNetFlowSeries(range, controller.signal));

    Promise.all(requests)
      .then((payloads) => {
        setSeries(payloads);
        signatureRef.current = signature;
        setStatus("idle");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
  }, [selected, includeFlows, range]);

  /** Union of timestamps, each row holding every series' normalized value. */
  const { rows, keys } = ((): { rows: MergedRow[]; keys: { key: string; label: string }[] } => {
    const activeSeries = nothingSelected ? [] : series;
    const keys = activeSeries.map((item) => ({ key: item.key, label: item.label }));
    if (activeSeries.length === 0) return { rows: [], keys };

    const timestamps = Array.from(
      new Set(activeSeries.flatMap((item) => item.points.map((p) => p.t))),
    );
    timestamps.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const normalized = activeSeries.map((item) => ({
      values: normalizeToPercent(item.points.map((point) => point.value)),
      normIndex: new Map<string, number>(
        item.points.map((point, i) => [point.t, i] as [string, number]),
      ),
    }));

    const rows: MergedRow[] = timestamps.map((t) => {
      const row: MergedRow = { t };
      for (let s = 0; s < activeSeries.length; s++) {
        const item = normalized[s];
        const seriesMeta = activeSeries[s];
        if (!item || !seriesMeta) continue;
        const normIdx = item.normIndex.get(t);
        if (normIdx === undefined) {
          row[seriesMeta.key] = null;
          continue;
        }
        row[seriesMeta.key] = Math.round((item.values[normIdx] ?? 0) * 10) / 10;
      }
      return row;
    });

    return { rows, keys };
  })();

  const bucket = TIME_RANGES[range].bucket;
  const tickFormatter = (value: string): string => {
    if (bucket === "day") return formatTehranMonthDay(value);
    if (bucket === "hour") return formatTehranShort(value);
    return formatTehranTime(value);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">Correlation / Co-movement</h2>
          <span className="text-xs text-muted-foreground">همبستگی / هم‌جهتی</span>
        </div>
        <TimeRangeSelector value={range} onChange={handleRangeChange} ranges={FLOW_RANGE_ORDER} />
      </div>

      <Alert>
        <AlertTitle>همبستگی ≠ علیت</AlertTitle>
        <AlertDescription>
          این نمودار فقط هم‌جهتی تاریخی سری‌های مختلف را روی یک خط زمانی نشان می‌دهد (هر سری جداگانه
          نرمال شده است). هیچ رابطه علّی یا پیش‌بینی‌ای ادعا نمی‌شود.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="انتخاب سری‌ها">
        {symbols.map((option) => {
          const active = selected.includes(option.symbol);
          return (
            <button
              key={option.symbol}
              type="button"
              aria-pressed={active}
              onClick={() => toggleSymbol(option.symbol)}
              className={
                active
                  ? "h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground"
                  : "h-7 rounded-md bg-muted px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              }
            >
              {option.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={includeFlows}
          onClick={toggleFlows}
          className={
            includeFlows
              ? "h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground"
              : "h-7 rounded-md bg-muted px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          }
        >
          خالص جریان
        </button>
      </div>

      {status === "error" && !nothingSelected ? (
        <Alert variant="destructive">
          <AlertTitle>خطا در دریافت داده</AlertTitle>
          <AlertDescription>دریافت یکی از سری‌ها ناموفق بود؛ دوباره تلاش کنید.</AlertDescription>
        </Alert>
      ) : status === "loading" && rows.length === 0 && !nothingSelected ? (
        <ChartSkeleton height={height} />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          حداقل یک سری را برای مقایسه انتخاب کنید.
        </p>
      ) : (
        <div dir="ltr">
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
                width={56}
                domain={[0, 100]}
                tickFormatter={(value: number | string) => `${Number(value)}`}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  return (
                    <div className="rounded-lg border bg-popover p-3 text-xs shadow-md">
                      <p className="mb-1.5 text-muted-foreground">
                        {formatTehranShort(String(label))}
                      </p>
                      {payload.map((entry) => (
                        <p
                          key={String(entry.dataKey)}
                          className="numeric flex items-center justify-between gap-4"
                          dir="ltr"
                        >
                          <span style={{ color: entry.color }}>{String(entry.name)}</span>
                          <span className="font-semibold">
                            {entry.value === null || entry.value === undefined
                              ? "—"
                              : `${Number(entry.value).toFixed(1)}%`}
                          </span>
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <Legend
                verticalAlign="top"
                height={28}
                formatter={(value: string) => (
                  <span className="text-xs text-muted-foreground">{value}</span>
                )}
              />
              {keys.map((entry, index) => (
                <Line
                  key={entry.key}
                  type="monotone"
                  dataKey={entry.key}
                  name={entry.label}
                  stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
