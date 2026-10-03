import { DataTable, type Column } from "@/components/tables/data-table";
import { Pagination } from "@/components/tables/pagination";
import { formatTehranDateTime } from "@/lib/format";
import type { Paginated, RawSnapshotRow } from "@/lib/supabase/queries";

/**
 * Raw `wallgold_prices` payload list — proof that every successful response is
 * preserved as JSONB for future re-processing.
 */
export function RawSnapshotsTable({
  data,
  buildHref,
}: {
  data: Paginated<RawSnapshotRow>;
  buildHref: (page: number) => string;
}) {
  const columns: Column<RawSnapshotRow>[] = [
    {
      key: "id",
      header: "ID",
      className: "numeric text-start",
      cell: (row) => row.id,
    },
    {
      key: "collectedAt",
      header: "زمان جمع‌آوری (تهران)",
      className: "numeric text-start whitespace-nowrap",
      cell: (row) => formatTehranDateTime(row.collectedAt),
    },
    {
      key: "sourceLastRealtime",
      header: "آخرین به‌روزرسانی منبع",
      className: "ltr text-start text-xs",
      cell: (row) => row.sourceLastRealtime ?? "—",
    },
    {
      key: "sourceTs",
      header: "منبع TS",
      className: "numeric text-start text-xs text-muted-foreground",
      cell: (row) => row.sourceLastRealtimeTs,
    },
  ];

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        rows={data.rows}
        getRowKey={(row) => row.id}
        emptyText="هنوز پاسخ خامی ذخیره نشده است."
      />
      <Pagination
        page={data.page}
        totalPages={data.totalPages}
        totalLabel={`${data.count} پاسخ خام`}
        buildHref={buildHref}
      />
    </div>
  );
}
