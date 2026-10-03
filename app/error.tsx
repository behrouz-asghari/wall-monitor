"use client";

import { useEffect } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Root error boundary (outside the dashboard layout). */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[root] render error:", error.message, error.digest ?? "");
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
      <Alert variant="destructive" className="max-w-lg">
        <AlertTitle>خطای غیرمنتظره</AlertTitle>
        <AlertDescription>در پردازش درخواست مشکلی پیش آمد. دوباره تلاش کنید.</AlertDescription>
      </Alert>
      <Button onClick={reset}>تلاش دوباره</Button>
    </main>
  );
}
