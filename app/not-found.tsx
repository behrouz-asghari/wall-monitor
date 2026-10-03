import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-6xl font-bold text-muted-foreground/40 ltr" dir="ltr">
        404
      </p>
      <h1 className="text-xl font-bold">صفحه پیدا نشد</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        آدرس مورد نظر وجود ندارد یا جابه‌جا شده است.
      </p>
      <Button asChild>
        <Link href="/dashboard">بازگشت به داشبورد</Link>
      </Button>
    </main>
  );
}
