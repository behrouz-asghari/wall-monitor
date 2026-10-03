import { AlertTriangle, CheckCircle2, CircleHelp, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type HealthState = "ok" | "stale" | "error" | "unknown";

interface Config {
  label: string;
  variant: "success" | "warning" | "destructive" | "secondary";
  icon: typeof CheckCircle2;
  className: string;
}

const CONFIG: Record<HealthState, Config> = {
  ok: {
    label: "Collector OK",
    variant: "success",
    icon: CheckCircle2,
    className: "border-success/40 bg-success/10 text-success",
  },
  stale: {
    label: "Collector دیرکرد دارد",
    variant: "warning",
    icon: AlertTriangle,
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  error: {
    label: "Collector خطا",
    variant: "destructive",
    icon: XCircle,
    className: "border-destructive/50 bg-destructive/10 text-destructive",
  },
  unknown: {
    label: "وضعیت نامشخص",
    variant: "secondary",
    icon: CircleHelp,
    className: "border-border bg-muted text-muted-foreground",
  },
};

/**
 * Status pill for collector/data health.
 * Communicates state with icon + text (never color alone).
 */
export function DataHealthBadge({
  state,
  className,
}: {
  state: HealthState;
  className?: string;
}) {
  const config = CONFIG[state];
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={cn("gap-1.5 border px-2.5 py-1", config.className, className)}
      data-state={state}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="ltr text-xs font-semibold">{config.label}</span>
    </Badge>
  );
}
