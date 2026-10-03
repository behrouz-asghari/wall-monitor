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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FLOW_RANGE_ORDER, TIME_RANGES, type TimeRangeKey } from "@/lib/constants";
import { formatCompact, formatTehranMonthDay, formatTehranShort, formatTehranTime, formatToman } from "@/lib/format";
import type { FlowSeriesResult } from "@/lib/supabase/queries";

interface FlowPoint {
  t: string;
  depositHour: number;
  withdrawHour: number;
  netFlow: number;
}

/**
 * Flow chart: deposit volume, withdraw volume and net flow on one timeline.
 *
 * `net_flow` is derived at query time (deposit_last_hour - withdraw_last_hour)
 * — it is never stored. All values are source toman amounts.
 */
export function FlowChart({
  initial,
  defaultRange = "24H",
  height = 320,
  showRangeSelector = true,
}: {
  initial: FlowSeriesResult | null;
  defaultRange?: TimeRangeKey;
  height?: number;
  showRangeSelector?: boolean;
}) {
  const [range, setRange] = useState<TimeRangeKey>(defaultRange);
  const [data, setData] = useState<FlowSeriesResult | null>(initial);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const loadedRangeRef = useRef<string | null>(initial ? defaultRange : null);

  useEffect(() => {
    if (loadedRangeRef.current === range) return;

    const controller = new AbortController();
    setStatus("loading");

    fetch(`/api/flows?range=${encodeURIComponent(range)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as { success: boolean; data: FlowSeriesResult };
      })
      .then((body) => {
        setData(body.data);
        loadedRangeRef.current = range;
        setStatus("idle");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
  }, [range]);

  const points: FlowPoint[] = (data?.points ?? []) as unknown as FlowPoint[];
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
          <h2 className="text-sm font-semibold">جریان واریز / برداشت / خالص</h2>
          <span className="text-xs text-muted-foreground">{TIME_RANGES[range].label}</span>
        </div>
        {showRangeSelector ? (
          <TimeRangeSelector value={range} onChange={setRange} ranges={FLOW_RANGE_ORDER} />
        ) : null}
      </div>

      {status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>خطا در دریافت جریان</AlertTitle>
          <AlertDescription>دریافت داده جریان از سرور ناموفق بود.</AlertDescription>
        </Alert>
      ) : status === "loading" && !data ? (
        <ChartSkeleton height={height} />
      ) : points.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          برای این بازه زمانی داده‌ای ثبت نشده است.
        </p>
      ) : (
        <div dir="ltr" className={status === "loading" ? "opacity-60" : undefined}>
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
                width={84}
                tickFormatter={(value: number | string) => formatCompact(Number(value))}
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
                          <span style={{ color: entry.color }}>{entry.name}</span>
                          <span className="font-semibold">{formatToman(Number(entry.value))}</span>
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <Legend
                verticalAlign="top"
                height={28}
                iconType="plainline"
                formatter={(value: string) => (
                  <span className="text-xs text-muted-foreground">{value}</span>
                )}
              />
              <Line
                type="monotone"
                dataKey="depositHour"
                name="واریز (ساعت)"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="withdrawHour"
                name="برداشت (ساعت)"
                stroke="hsl(var(--chart-5))"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="netFlow"
                name="خالص جریان"
                stroke="hsl(var(--chart-3))"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
