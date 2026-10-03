import { z } from "zod";

import { TIME_RANGES, type TimeRangeKey } from "@/lib/constants";

/**
 * Zod schemas for API query-string validation.
 *
 * Nothing from the query string ever reaches SQL as a string literal: symbol
 * and range are validated here and then passed to parameterized PostgREST /
 * RPC calls only.
 */

const RANGE_KEYS = Object.keys(TIME_RANGES) as [TimeRangeKey, ...TimeRangeKey[]];

/** Case-insensitive range key: `24h` / `24H` / `30d` ... */
export const RangeParamSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.enum(RANGE_KEYS));

/**
 * Symbol keys as emitted by WallGold: letters, digits and underscores only.
 * Strictly bounded so a hostile value can never surprise a downstream system.
 */
export const SymbolParamSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_]+$/, "symbol must match /^[A-Za-z0-9_]+$/");

export const PaginationParamSchema = z.coerce.number().int().min(1).max(10_000);

export const PriceHistoryQuerySchema = z.object({
  symbol: SymbolParamSchema,
  range: RangeParamSchema.default("24H"),
});

export const PricesQuerySchema = z.object({
  symbol: SymbolParamSchema.optional(),
});

export const FlowsQuerySchema = z.object({
  range: RangeParamSchema.default("24H"),
});

export const PriceTableQuerySchema = z.object({
  symbol: SymbolParamSchema,
  range: RangeParamSchema.default("24H"),
  page: PaginationParamSchema.default(1),
  page_size: PaginationParamSchema.max(200).default(50),
});

export type PriceHistoryQuery = z.infer<typeof PriceHistoryQuerySchema>;
export type FlowsQuery = z.infer<typeof FlowsQuerySchema>;
export type PriceTableQuery = z.infer<typeof PriceTableQuerySchema>;
