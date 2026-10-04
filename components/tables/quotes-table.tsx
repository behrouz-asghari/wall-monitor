import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { DataTable, type Column } from "@/components/tables/data-table";
import {
  formatPercent,
  formatPriceByUnit,
  formatSigned,
  formatTehranTime,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LatestPriceItem } from "@/lib/supabase/queries";

function DirectionCell({ item }: { item: LatestPriceItem }) {
  const isUp = item.direction === "high";
  const isDown = item.direction === "low";
  const Icon = isUp ? ArrowUpRight : isDown ? ArrowDownRight : Minus;
  const label = isUp ? "افزایش" : isDown ? "کاهش" : "بدون تغییر";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        isUp && "text-success",
        isDown && "text-destructive",
        !isUp && !isDown && "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Full quote table for the latest snapshot — every indicator WallGold sent.
 * Only the Persian display label is rendered; the raw API field key is kept as
 * the row identity but never shown to the user.
 */
export function QuotesTable({ items }: { items: LatestPriceItem[] }) {
  const columns: Column<LatestPriceItem>[] = [
    {
      key: "symbol",
      header: "نماد",
      cell: (item) => <span className="font-medium">{item.label}</span>,
    },
    {
      key: "price",
      header: "قیمت",
      className: "numeric text-start font-semibold",
      cell: (item) => formatPriceByUnit(item.price, item.unit ?? "", item.decimals, item.divide10),
    },
    {
      key: "changeAmount",
      header: "تغییر",
      className: "numeric text-start",
      cell: (item) =>
        item.changeAmount === null ? "—" : formatSigned(item.changeAmount, item.decimals > 0 ? item.decimals : 0),
    },
    {
      key: "changePercent",
      header: "تغییر٪",
      className: "numeric text-start",
      cell: (item) =>
        item.changePercent === null ? "—" : formatPercent(item.changePercent),
    },
    {
      key: "direction",
      header: "جهت",
      cell: (item) => <DirectionCell item={item} />,
    },
    {
      key: "updated",
      header: "به‌روزرسانی",
      className: "numeric text-start text-muted-foreground",
      cell: (item) => (item.updatedAt ? formatTehranTime(item.updatedAt) : "—"),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      getRowKey={(item) => item.symbol}
      emptyText="هنوز قیمتی ثبت نشده است."
    />
  );
}
