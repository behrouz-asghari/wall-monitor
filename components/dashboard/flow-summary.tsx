import { ArrowDownToLine, ArrowUpFromLine, Scale, Wallet } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import { formatCompact, formatNumberFa, formatToman } from "@/lib/format";
import type { LatestLiveDataResult } from "@/lib/supabase/queries";

/**
 * Flow KPI cards: last-minute, last-hour, net flow and deposit/withdraw ratio.
 *
 * All values come from the source columns; net flow and ratio are derived at
 * query time (never stored).
 */
export function FlowSummary({ live }: { live: LatestLiveDataResult }) {
  const { metrics } = live;
  const netTone =
    metrics.netDirection === "inflow"
      ? "positive"
      : metrics.netDirection === "outflow"
        ? "negative"
        : "muted";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="واریز (آخرین ساعت)"
        icon={ArrowDownToLine}
        value={formatCompact(live.depositLastHourVolumeToman ?? Number.NaN)}
        sub={
          <>
            <span className="ltr">{formatNumberFa(live.depositLastMinuteToman ?? 0)}</span> تومان در دقیقه
          </>
        }
      />
      <StatCard
        label="برداشت (آخرین ساعت)"
        icon={ArrowUpFromLine}
        value={formatCompact(live.withdrawLastHourVolumeToman ?? Number.NaN)}
        sub={
          <>
            <span className="ltr">{formatNumberFa(live.withdrawLastMinuteToman ?? 0)}</span> تومان در دقیقه
          </>
        }
      />
      <StatCard
        label="خالص جریان (ساعت)"
        icon={Scale}
        tone={netTone as "positive" | "negative" | "muted"}
        value={
          metrics.netFlowHourToman === null ? "—" : formatCompact(metrics.netFlowHourToman)
        }
        sub={
          metrics.netFlowHourToman === null ? (
            "داده ناکافی"
          ) : (
            <span className="ltr">
              {metrics.netFlowHourToman > 0 ? "inflow" : metrics.netFlowHourToman < 0 ? "outflow" : "flat"}
            </span>
          )
        }
      />
      <StatCard
        label="نسبت واریز / برداشت"
        icon={Wallet}
        value={
          metrics.depositWithdrawRatio === null
            ? "—"
            : metrics.depositWithdrawRatio.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
        }
        sub={
          <>
            ترد لحظه‌ای:{" "}
            <span className="ltr">{formatToman(live.tradeLastMinuteToman ?? 0)}</span>
          </>
        }
      />
    </div>
  );
}
