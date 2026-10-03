"use client";

import { TIME_RANGES, type TimeRangeKey } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Segmented time-range control (keyboard accessible buttons with aria-pressed).
 * Ranges are validated centrally in lib/constants.ts.
 */
export function TimeRangeSelector({
  value,
  onChange,
  ranges,
  label = "بازه زمانی",
  id = "time-range",
}: {
  value: TimeRangeKey;
  onChange: (key: TimeRangeKey) => void;
  ranges?: readonly TimeRangeKey[];
  label?: string;
  id?: string;
}) {
  const keys = ranges ?? (Object.keys(TIME_RANGES) as TimeRangeKey[]);

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      {keys.map((key) => {
        const active = key === value;
        return (
          <button
            key={key}
            id={`${id}-${key}`}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(key)}
            className={cn(
              "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            <span className="ltr">{TIME_RANGES[key].labelEn}</span>
            <span className="sr-only"> {TIME_RANGES[key].label}</span>
          </button>
        );
      })}
    </div>
  );
}
