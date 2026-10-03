import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTone = "default" | "positive" | "negative" | "muted";

/**
 * Dense KPI stat card used across flows / health pages.
 * Value accepts pre-formatted strings (callers keep raw values untouched).
 */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  className,
  dir = "ltr",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  className?: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <Card className={cn("py-3.5 shadow-sm", className)}>
      <CardContent className="space-y-1.5 px-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden="true" /> : null}
        </div>
        <div
          className={cn(
            "numeric text-lg font-bold leading-tight",
            tone === "positive" && "text-success",
            tone === "negative" && "text-destructive",
            tone === "muted" && "text-muted-foreground",
          )}
          dir={dir}
        >
          {value}
        </div>
        {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
