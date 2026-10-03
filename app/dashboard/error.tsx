"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Dashboard-specific error boundary.
 * Shows a friendly Persian message + retry; the raw error goes to the console
 * for debugging (never any secret — query errors only contain messages).
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] render error:", error.message, error.digest ?? "");
  }, [error]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 py-16">
      <Alert variant="destructive">
        <AlertTitle>خطا در نمایش داشبورد</AlertTitle>
        <AlertDescription>
          دریافت یا پردازش داده با خطا مواجه شد. اگر محیط متغیرهای Supabase را ندارد، ابتدا
          <span className="ltr"> .env.local </span>
          را بر اساس <span className="ltr">.env.example</span> پر کنید و مهاجرت‌ها را اجرا کنید.
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-2">
        <Button onClick={reset}>
          <RefreshCw className="size-4" aria-hidden="true" />
          تلاش دوباره
        </Button>
        <Button asChild variant="outline">
          <a href="/api/health">بررسی سلامت سیستم</a>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground ltr" dir="ltr">
        {error.message}
      </p>
    </div>
  );
}
