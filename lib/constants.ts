/**
 * Application-wide constants: WallGold endpoints, time ranges and the
 * UI-configured list of important symbols.
 *
 * NOTE: symbol lists here are only a display convenience. The collector always
 * stores every indicator WallGold returns, including unknown/future ones.
 */

export const APP_NAME = "WallGold Data Monitor";
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";

/** Public WallGold JSON endpoints (no auth, no cookies, plain GET). */
export const WALLGOLD_ENDPOINTS = {
  livedata:
    "https://wallgold.ir/wp-content/plugins/wallgold-livedata/data/livedata.json",
  prices: "https://wallgold.ir/wp-content/uploads/wallgold/prices.json",
} as const;

/** Live data URL with a dynamically generated `?_wg=<timestamp>` cache buster. */
export function buildLiveDataUrl(now: number = Date.now()): string {
  return `${WALLGOLD_ENDPOINTS.livedata}?_wg=${now}`;
}

/** Prices URL with a dynamically generated `?_=<timestamp>` cache buster. */
export function buildPricesUrl(now: number = Date.now()): string {
  return `${WALLGOLD_ENDPOINTS.prices}?_=${now}`;
}

/* -------------------------------------------------------------------------- */
/* Time ranges                                                                 */
/* -------------------------------------------------------------------------- */

export type TimeRangeKey = "1H" | "6H" | "12H" | "24H" | "3D" | "7D" | "30D";

/** SQL `date_trunc` bucket used when aggregating a range. */
export type TimeBucket = "minute" | "hour" | "day";

export interface TimeRangeMeta {
  key: TimeRangeKey;
  /** Persian label for the UI. */
  label: string;
  labelEn: string;
  durationMs: number;
  /**
   * Resolution returned by the query layer:
   * 1H..24H -> raw (source collects once per minute),
   * 3D/7D   -> hourly aggregation,
   * 30D     -> daily aggregation.
   */
  bucket: TimeBucket;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const TIME_RANGES: Record<TimeRangeKey, TimeRangeMeta> = {
  "1H": { key: "1H", label: "۱ ساعت", labelEn: "1H", durationMs: 60 * MINUTE, bucket: "minute" },
  "6H": { key: "6H", label: "۶ ساعت", labelEn: "6H", durationMs: 6 * HOUR, bucket: "minute" },
  "12H": { key: "12H", label: "۱۲ ساعت", labelEn: "12H", durationMs: 12 * HOUR, bucket: "minute" },
  "24H": { key: "24H", label: "۲۴ ساعت", labelEn: "24H", durationMs: DAY, bucket: "minute" },
  "3D": { key: "3D", label: "۳ روز", labelEn: "3D", durationMs: 3 * DAY, bucket: "hour" },
  "7D": { key: "7D", label: "۷ روز", labelEn: "7D", durationMs: 7 * DAY, bucket: "hour" },
  "30D": { key: "30D", label: "۳۰ روز", labelEn: "30D", durationMs: 30 * DAY, bucket: "day" },
};

/** Selector order for price charts. */
export const PRICE_RANGE_ORDER: TimeRangeKey[] = [
  "1H",
  "6H",
  "12H",
  "24H",
  "3D",
  "7D",
  "30D",
];

/** Selector order for flow charts (per spec: no 3D for flows). */
export const FLOW_RANGE_ORDER: TimeRangeKey[] = [
  "1H",
  "6H",
  "12H",
  "24H",
  "7D",
  "30D",
];

/* -------------------------------------------------------------------------- */
/* Symbols                                                                     */
/* -------------------------------------------------------------------------- */

export interface SymbolMeta {
  symbol: string;
  /** Persian display label. */
  label: string;
}

/**
 * The market cards / default selectors. Unknown symbols are still collected,
 * stored and selectable — they simply render with their raw key as a label.
 */
export const FEATURED_SYMBOLS: SymbolMeta[] = [
  { symbol: "gold18k", label: "طلای ۱۸" },
  { symbol: "ons", label: "اونس" },
  { symbol: "silver", label: "نقره" },
  { symbol: "silver_999", label: "نقره ۹۹۹" },
  { symbol: "price_dollar_rl", label: "دلار" },
  { symbol: "price_eur", label: "یورو" },
  { symbol: "sekee", label: "سکه امامی" },
  { symbol: "nim", label: "نیم سکه" },
  { symbol: "rob", label: "ربع سکه" },
];

/**
 * Known symbol -> Persian display label mapping.
 *
 * The API/DB keys (`symbol`) are never renamed — they stay exactly as WallGold
 * sends them. This map is display-only: the UI must render these Persian
 * labels and must never expose the raw technical field names to the user.
 */
export const SYMBOL_LABELS: Record<string, string> = {
  // Metals & coins
  gold18k: "طلای ۱۸",
  ons: "اونس طلا",
  silver: "نقره",
  silver_999: "نقره ۹۹۹",
  slv925: "نقره ۹۲۵",
  platinum: "پلاتین",
  palladium: "پالادیوم",
  geram24: "مثقال طلای ۲۴ عیار",
  gerami: "گرمی طلا",
  gold_mini_size: "طلای آب شده",
  mesghal: "مثقال",
  gold_futures: "آتی طلا",
  gold_17_transfer: "طلای ۱۷ انتقالی",
  sekee: "سکه امامی",
  sekeb: "سکه بهار آزادی",
  nim: "نیم سکه",
  rob: "ربع سکه",

  // حباب (bubble)
  coin_blubber: "حباب سکه",
  sekeb_blubber: "حباب سکه بهار آزادی",
  nim_blubber: "حباب نیم سکه",
  rob_blubber: "حباب ربع سکه",
  gerami_blubber: "حباب سکه گرمی",

  // Currencies
  price_dollar_rl: "دلار",
  price_eur: "یورو",
  price_aed: "درهم",
  price_gbp: "پوند",
  price_afn: "افغانی افغانستان",
  price_amd: "درام ارمنستان",
  price_aud: "دلار استرالیا",
  price_azn: "منات آذربایجان",
  price_bhd: "دینار بحرین",
  price_cad: "دلار کانادا",
  price_chf: "فرانک سوئیس",
  price_cny: "یوان چین",
  price_dkk: "کرون دانمارک",
  price_gel: "لاری گرجستان",
  price_hkd: "دلار هنگ کنگ",
  price_inr: "روپیه هند",
  price_iqd: "دینار عراق",
  price_jpy: "ین ژاپن",
  price_kgs: "سوم قرقیزستان",
  price_krw: "وون کره جنوبی",
  price_kwd: "دینار کویت",
  price_myr: "رینگیت مالزی",
  price_nok: "کرون نروژ",
  price_nzd: "دلار نیوزیلند",
  price_omr: "ریال عمان",
  price_pkr: "روپیه پاکستان",
  price_qar: "ریال قطر",
  price_rub: "روبل روسیه",
  price_sar: "ریال عربستان سعودی",
  price_sek: "کرون سوئد",
  price_sgd: "دلار سنگاپور",
  price_syp: "لیره سوریه",
  price_thb: "بات تایلند",
  price_tjs: "سامانی تاجیکستان",
  price_tmt: "منات ترکمنستان",
  price_try: "لیر ترکیه",
};

/**
 * Persian display label for a symbol. Unknown/future symbols get a neutral
 * Persian placeholder — the raw API key is never surfaced to the user.
 */
export function symbolLabel(symbol: string): string {
  return SYMBOL_LABELS[symbol] ?? "نماد ناشناخته";
}

/** Collector cadence (target: once per minute, no aggressive polling). */
export const COLLECTOR_INTERVAL_MINUTES = 1;

/** HTTP timeout for upstream WallGold requests. */
export const WALLGOLD_TIMEOUT_MS = 10_000;

/** Backoff between retry attempts (attempt 1 -> 500ms -> attempt 2 -> 1000ms -> attempt 3). */
export const WALLGOLD_RETRY_DELAYS_MS: readonly number[] = [500, 1_000];
