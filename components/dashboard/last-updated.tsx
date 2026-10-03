import { formatTehranDateTime, formatTehranTime } from "@/lib/format";

/**
 * "Last update" renderer. Always converts UTC storage to Tehran time through
 * Intl (Asia/Tehran) — no manual offset arithmetic.
 *
 * Shows short time inline, full date/time in the tooltip and via aria-label.
 */
export function LastUpdated({
  value,
  label = "آخرین به‌روزرسانی",
  className,
}: {
  value: string | number | Date | null;
  label?: string;
  className?: string;
}) {
  if (value === null) {
    return (
      <span className={className}>
        {label}: <span className="text-muted-foreground">ناموجود</span>
      </span>
    );
  }

  const date = new Date(value);

  return (
    <span className={className}>
      {label}:{" "}
      <time dateTime={date.toISOString()} aria-label={formatTehranDateTime(date)} className="numeric">
        {formatTehranTime(date)}
      </time>
    </span>
  );
}
