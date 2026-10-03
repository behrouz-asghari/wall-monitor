import { MarketCard } from "@/components/dashboard/market-card";
import type { LatestPriceItem } from "@/lib/supabase/queries";

/**
 * Responsive market card grid:
 *   desktop (xl) 5 per row, lg 3, tablet 2-3, mobile 1-2.
 * Items are ordered as provided (the featured symbol order from the query).
 */
export function MarketGrid({ items }: { items: LatestPriceItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        هنوز داده‌ای ثبت نشده است. پس از اولین اجرای کلنکتور، قیمت‌ها اینجا نمایش داده می‌شوند.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <MarketCard key={item.symbol} item={item} />
      ))}
    </div>
  );
}
