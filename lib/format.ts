/**
 * Reusable display formatters.
 *
 * These only ever operate on already-stored values — raw database values are
 * never mutated. All date rendering goes through Intl with an explicit
 * IANA time zone (Asia/Tehran); we never manually add or subtract UTC offsets.
 */

import { format } from "date-fns";

const TEHRAN = "Asia/Tehran";

const numberFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimalFmt = (min: number, max: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });

const faNumberFmt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });

/** `26,301,000` — Latin digits with thousands separators (default). */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return numberFmt.format(value);
}

/** `۲۶٬۳۰۱٬۰۰۰` — Persian digits, for counts and health metrics. */
export function formatNumberFa(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return faNumberFmt.format(value);
}

/** Compact value: `26.3M`, `17.8B` — used for dense cards and chart axes. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return formatNumber(value);
}

/** `26,301,000 تومان` */
export function formatToman(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${formatNumber(value)} تومان`;
}

/** `$4,140.19` */
export function formatUsd(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  return `$${decimalFmt(decimals, decimals).format(value)}`;
}

/** `+1.63%` / `-0.42%` / `0.00%` */
export function formatPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${decimalFmt(decimals, decimals).format(value)}%`;
}

/** `+533,000` / `-1,200` / `0` */
export function formatSigned(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${decimalFmt(decimals, decimals).format(value)}`;
}

/** Signed compact value used in dense stat cards: `+17.8B`. */
export function formatSignedCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCompact(Math.abs(value))}`;
}

/**
 * Format a value that is already in display units, appending the source unit.
 *   تومان -> `26,301,000 تومان`   دلار -> `$4,140.19`
 */
export function formatValueWithUnit(value: number, unit: string, decimals: number): string {
  if (!Number.isFinite(value)) return "—";
  const normalizedUnit = unit.trim();
  if (normalizedUnit === "تومان") {
    return formatToman(Math.round(value));
  }
  if (normalizedUnit === "دلار") {
    return formatUsd(value, Math.min(decimals, 4));
  }
  const suffix = normalizedUnit ? ` ${normalizedUnit}` : "";
  return `${decimalFmt(decimals, decimals).format(value)}${suffix}`;
}

/**
 * Format a raw source price for display using the source-provided metadata.
 *
 * The raw value is preserved in the database; `divide10` / `decimals` come
 * straight from the WallGold payload and are only applied for presentation.
 */
export function formatPriceByUnit(
  rawPrice: number,
  unit: string,
  decimals: number,
  divide10: boolean,
): string {
  return formatValueWithUnit(toDisplayPrice(rawPrice, divide10, decimals), unit, decimals);
}

/**
 * Convert a raw source price to its display value.
 *
 * Never mutates the stored value — this is a pure presentation helper.
 *   price=350265000, divide10=true,  decimals=0 -> 35026500
 *   price=4140.19,   divide10=false, decimals=2 -> 4140.19
 */
export function toDisplayPrice(price: number, divide10: boolean, decimals: number): number {
  const scaled = divide10 ? price / 10 : price;
  if (!Number.isFinite(scaled)) return scaled;
  const factor = 10 ** Math.max(0, Math.min(12, decimals));
  return Math.round(scaled * factor) / factor;
}

/* -------------------------------------------------------------------------- */
/* Dates — always via Intl with an explicit IANA time zone                     */
/* -------------------------------------------------------------------------- */

const tehranDateTime = new Intl.DateTimeFormat("fa-IR", {
  timeZone: TEHRAN,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const tehranTime = new Intl.DateTimeFormat("fa-IR", {
  timeZone: TEHRAN,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const tehranFull = new Intl.DateTimeFormat("fa-IR", {
  timeZone: TEHRAN,
  dateStyle: "medium",
  timeStyle: "medium",
});

const utcTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** `۱۴۰۵/۰۷/۱۲ ۱۳:۴۷:۲۶` — Tehran wall clock, no manual offset math. */
export function formatTehranDateTime(value: Date | string | number): string {
  return tehranDateTime.format(new Date(value));
}

/** `۱۳:۴۷` — short Tehran time (chart axes, "last update"). */
export function formatTehranTime(value: Date | string | number): string {
  return tehranTime.format(new Date(value));
}

const tehranShort = new Intl.DateTimeFormat("fa-IR", {
  timeZone: TEHRAN,
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const tehranMonthDay = new Intl.DateTimeFormat("fa-IR", {
  timeZone: TEHRAN,
  month: "2-digit",
  day: "2-digit",
});

/** `۰۷/۱۲ ۱۳:۴۷` — chart tick for hourly buckets. */
export function formatTehranShort(value: Date | string | number): string {
  return tehranShort.format(new Date(value));
}

/** `۰۷/۱۲` — chart tick for daily buckets. */
export function formatTehranMonthDay(value: Date | string | number): string {
  return tehranMonthDay.format(new Date(value));
}

/** Long form with date + time in Tehran. */
export function formatTehranFull(value: Date | string | number): string {
  return tehranFull.format(new Date(value));
}

/** UTC `HH:mm` — used for ISO bucket labels where Persian digits are unwanted. */
export function formatUtcTime(value: Date | string | number): string {
  return utcTime.format(new Date(value));
}

/** `2026-10-03 13:47:26` — date-fns formatting for machine-friendly strings. */
export function formatIsoLocal(value: Date | string | number): string {
  return format(new Date(value), "yyyy-MM-dd HH:mm:ss");
}
