import { DataTable, type Column } from "@/components/tables/data-table";
import { Pagination } from "@/components/tables/pagination";
import { formatPercent, formatTehranDateTime, formatValueWithUnit } from "@/lib/format";
import type { Paginated, PriceTableRow } from "@/lib/supabase/queries";
import { cn } from "@/lib/utils";

/**
 * Server-side paginated price rows for one symbol + range.
 * Raw database values are formatted here only for display.
 */
export function PriceHistoryTable({
  data,
  symbol,
  range,
}: {
  data: Paginated<PriceTableRow>;
  symbol: string;
  range: string;
}) {
  const columns: Column<PriceTableRow>[] = [
    {
      key: "collectedAt",
      header: "زمان (تهران)",
      className: "numeric text-start whitespace-nowrap",
      cell: (row) => formatTehranDateTime(row.collectedAt),
    },
    {
      key: "price",
      header: "قیمت",
      className: "numeric text-start font-semibold",
      cell: (row) => formatValueWithUnit(row.displayPrice, row.unit ?? "", row.decimals),
    },
    {
      key: "changePercent",
      header: "تغییر٪",
      className: "numeric text-start",
      cell: (row) =>
        row.changePercent === null ? (
          "—"
        ) : (
          <span
            className={cn(
              row.direction === "high" && "text-success",
              row.direction === "low" && "text-destructive",
            )}
          >
            {row.direction === "high" ? "↑" : row.direction === "low" ? "↓" : "–"}{" "}
            {formatPercent(row.changePercent)}
          </span>
        ),
    },
    {
      key: "direction",
      header: "جهت منبع",
      cell: (row) =>
        row.direction === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="ltr text-xs">{row.direction}</span>
        ),
    },
    {
      key: "rawPrice",
      header: "مقدار خام",
      className: "numeric text-start text-xs text-muted-foreground",
      cell: (row) => String(row.price),
    },
  ];

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        rows={data.rows}
        getRowKey={(row) => row.id}
        emptyText="برای این نماد و بازه، ردیفی وجود ندارد."
      />
      <Pagination
        page={data.page}
        totalPages={data.totalPages}
        totalLabel={`${data.count} ردیف`}
        buildHref={(page) =>
          `/dashboard/history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}&page=${page}`
        }
      />
    </div>
  );
}
