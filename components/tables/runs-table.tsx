import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/tables/data-table";
import { formatTehranDateTime } from "@/lib/format";
import type { CollectorRunRow } from "@/lib/supabase/queries";
import { cn } from "@/lib/utils";

const STATUS_META: Record<string, { label: string; className: string }> = {
  ok: { label: "موفق", className: "bg-success/10 text-success border-success/40" },
  partial: { label: "جزئی", className: "bg-warning/10 text-warning border-warning/40" },
  duplicate: { label: "تکراری", className: "bg-muted text-muted-foreground border-border" },
  failed: { label: "ناموفق", className: "bg-destructive/10 text-destructive border-destructive/50" },
};

function OkCell({ ok }: { ok: boolean }) {
  return (
    <span className={cn("text-xs font-medium", ok ? "text-success" : "text-destructive")}>
      <span aria-hidden="true">{ok ? "✓" : "✗"}</span>
      <span className="sr-only">{ok ? "موفق" : "ناموفق"}</span>
    </span>
  );
}

/** Recent cron/collector invocations (status text + icon, never color alone). */
export function RunsTable({ runs }: { runs: CollectorRunRow[] }) {
  const columns: Column<CollectorRunRow>[] = [
    {
      key: "startedAt",
      header: "شروع (تهران)",
      className: "numeric text-start whitespace-nowrap",
      cell: (run) => formatTehranDateTime(run.startedAt),
    },
    {
      key: "status",
      header: "وضعیت",
      cell: (run) => {
        const meta = STATUS_META[run.status] ?? {
          label: run.status,
          className: "bg-muted text-muted-foreground",
        };
        return (
          <Badge variant="outline" className={cn("text-xs", meta.className)}>
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: "duration",
      header: "مدت",
      className: "numeric text-start",
      cell: (run) => (run.durationMs === null ? "—" : `${run.durationMs}ms`),
    },
    {
      key: "live",
      header: "livedata",
      cell: (run) => <OkCell ok={run.liveOk} />,
    },
    {
      key: "prices",
      header: "prices",
      cell: (run) => <OkCell ok={run.pricesOk} />,
    },
    {
      key: "inserted",
      header: "رکورد جدید",
      cell: (run) => <OkCell ok={run.liveInserted || run.pricesInserted} />,
    },
    {
      key: "error",
      header: "خطا",
      className: "max-w-[280px] truncate text-xs text-muted-foreground",
      cell: (run) => run.error ?? "—",
      // title attr for the full message:
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={runs}
      getRowKey={(run) => run.id}
      emptyText="هنوز اجرایی ثبت نشده است (کرون هنوز اجرا نشده یا مهاجرت‌ها اعمال نشده‌اند)."
    />
  );
}
