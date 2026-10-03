import type { Metadata } from "next";
import Link from "next/link";
import { Activity } from "lucide-react";

import { CollectorStatus } from "@/components/dashboard/collector-status";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: "داشبورد",
};

/** Everything under /dashboard reads live data — render per request. */
export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-sm font-bold">
              <span
                className="flex size-7 items-center justify-center rounded-md bg-warning/15 text-warning"
                aria-hidden="true"
              >
                <Activity className="size-4" />
              </span>
              <span>{APP_NAME}</span>
            </Link>
          </div>
          <CollectorStatus />
        </div>
        <div className="border-t">
          <div className="mx-auto w-full max-w-[1400px] px-4 md:px-6">
            <DashboardNav />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-6 px-4 py-6 md:px-6">
        {children}
      </main>

      <footer className="border-t py-4">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 text-xs text-muted-foreground md:px-6">
          <span>
            داده‌های عمومی wallgold.ir — صرفاً جنبه نمایش و تحلیل دارند و توصیه سرمایه‌گذاری محسوب نمی‌شوند.
          </span>
          <span className="ltr">storage: UTC · display: Asia/Tehran</span>
        </div>
      </footer>
    </div>
  );
}
