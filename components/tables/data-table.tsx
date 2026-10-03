import type { ReactNode } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

/**
 * Generic, framework-free data table (server-render friendly).
 * Pagination and data fetching are handled by callers — this component only
 * renders what it is given.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyText = "داده‌ای موجود نیست.",
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string | number;
  emptyText?: string;
  rowClassName?: (row: T) => string | undefined;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key} className={column.className}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-sm text-muted-foreground"
              >
                {emptyText}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow key={getRowKey(row, index)} className={rowClassName?.(row)}>
                {columns.map((column) => (
                  <TableCell key={column.key} className={column.className}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
