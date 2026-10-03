import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Server-side pagination controls rendered as plain links (works without
 * JavaScript, keeps URLs shareable, respects RTL: previous points right).
 */
export function Pagination({
  page,
  totalPages,
  buildHref,
  totalLabel,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
  totalLabel?: string;
}) {
  if (totalPages <= 1) {
    return totalLabel ? <p className="text-xs text-muted-foreground">{totalLabel}</p> : null;
  }

  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const baseClass = buttonVariants({ variant: "outline", size: "sm" });

  return (
    <nav aria-label="صفحه‌بندی جدول" className="flex items-center justify-between gap-3">
      <div className="text-xs text-muted-foreground">
        <span className="numeric ltr">
          {page} / {totalPages}
        </span>
        {totalLabel ? <span className="mr-2">{totalLabel}</span> : null}
      </div>

      <div className="flex items-center gap-2">
        {hasPrev ? (
          <Link href={buildHref(page - 1)} rel="prev" className={baseClass}>
            <ChevronRight className="size-4" aria-hidden="true" />
            قبلی
          </Link>
        ) : (
          <span className={cn(baseClass, "pointer-events-none opacity-50")} aria-disabled="true">
            <ChevronRight className="size-4" aria-hidden="true" />
            قبلی
          </span>
        )}

        {hasNext ? (
          <Link href={buildHref(page + 1)} rel="next" className={baseClass}>
            بعدی
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <span className={cn(baseClass, "pointer-events-none opacity-50")} aria-disabled="true">
            بعدی
            <ChevronLeft className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}
