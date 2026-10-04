import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent, formatPriceByUnit, formatSigned, formatTehranTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LatestPriceItem } from "@/lib/supabase/queries";

/**
 * Market quote card for one indicator.
 *
 * Direction comes from the source (`direction`: "high" | "low" | null) — we
 * never infer or invent price movement. Change is communicated with an arrow
 * icon AND a signed number (never color alone) for accessibility.
 */
export function MarketCard({ item }: { item: LatestPriceItem }) {
  const direction = item.direction;
  const isUp = direction === "high";
  const isDown = direction === "low";
  const DirectionIcon = isUp ? ArrowUpRight : isDown ? ArrowDownRight : Minus;
  const directionLabel = isUp ? "افزایش" : isDown ? "کاهش" : "بدون تغییر";

  const changeAmount = item.changeAmount;
  const changePercent = item.changePercent;

  const ariaSummary = [
    item.label,
    formatPriceByUnit(item.price, item.unit ?? "", item.decimals, item.divide10),
    directionLabel,
    changePercent !== null ? formatPercent(changePercent) : "",
  ]
    .filter(Boolean)
    .join("، ");

  return (
    <Card aria-label={ariaSummary} className="py-3.5 shadow-sm">
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pb-1.5">
        <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold",
            isUp && "bg-success/10 text-success",
            isDown && "bg-destructive/10 text-destructive",
            !isUp && !isDown && "bg-muted text-muted-foreground",
          )}
        >
          <DirectionIcon className="size-3.5" aria-hidden="true" />
          <span>{directionLabel}</span>
        </span>
      </CardHeader>
      <CardContent className="space-y-1.5 px-4">
        <div className="numeric text-xl font-bold leading-tight" dir="ltr">
          {formatPriceByUnit(item.price, item.unit ?? "", item.decimals, item.divide10)}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {changeAmount !== null ? (
            <span className="numeric text-muted-foreground" dir="ltr">
              {formatSigned(changeAmount, item.decimals > 0 ? item.decimals : 0)}
            </span>
          ) : null}
          {changePercent !== null ? (
            <span
              className={cn(
                "numeric font-semibold",
                isUp && "text-success",
                isDown && "text-destructive",
                !isUp && !isDown && "text-muted-foreground",
              )}
              dir="ltr"
            >
              {isUp ? "↑" : isDown ? "↓" : "–"} {formatPercent(changePercent)}
            </span>
          ) : (
            <span className="text-muted-foreground">تغییر ناموجود</span>
          )}
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="ltr">{item.updatedAt ? formatTehranTime(item.updatedAt) : "—"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
