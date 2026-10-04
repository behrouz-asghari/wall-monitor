import Link from "next/link";
import { Activity, ArrowLeft, Database, LineChart, Timer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";

/**
 * Public landing page. Deliberately static (no Supabase access) so it renders
 * even before the environment is fully configured.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-6 py-16">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-warning/15 text-warning">
            <Activity className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{APP_NAME}</h1>
            <p className="text-sm text-muted-foreground">مانیتورینگ داده‌های بازار WallGold</p>
          </div>
        </div>
        <Badge variant="secondary">Cloudflare Worker Cron · هر 5 دقیقه</Badge>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: Timer,
            title: "جمع‌آوری هر دقیقه",
            body: "دریافت مستقیم JSON عمومی wallgold.ir بدون کوکی، بدون مرورگر و بدون وابستگی به نشست کاربر.",
          },
          {
            icon: Database,
            title: "ذخیره‌سازی تاریخچه‌ای",
            body: "ذخیره کامل raw JSON به همراه داده‌نرمال‌شده در Supabase PostgreSQL با جلوگیری از رکورد تکراری.",
          },
          {
            icon: LineChart,
            title: "تحلیل و نمودار",
            body: "نمودارهای قیمت، جریان واریز/برداشت و همبستگی با تفکیک زمانی مناسب برای هر بازه.",
          },
          {
            icon: Activity,
            title: "سلامت داده",
            body: "پایش وضعیت کرون، تشخیص بازه‌های خالی جمع‌آوری و نمایش آخرین زمان‌های مرجع.",
          },
        ].map((feature) => (
          <article
            key={feature.title}
            className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm"
          >
            <feature.icon className="mb-3 size-5 text-warning" aria-hidden="true" />
            <h2 className="mb-1.5 font-semibold">{feature.title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
          </article>
        ))}
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="mb-2 font-semibold">مسیر داده</h2>
        <pre
          className="ltr overflow-x-auto rounded-lg bg-muted/50 p-4 text-xs leading-6 text-muted-foreground"
          dir="ltr"
        >
{`WallGold
   ↓  server-side fetch (no cookies / no browser)
Zod validation
   ↓
Normalization (raw values preserved)
   ↓  ON CONFLICT DO NOTHING
Supabase PostgreSQL
   ↓
Next.js server queries (aggregated, paginated)
   ↓
Dashboard → Charts`}
        </pre>
      </section>

      <footer className="mt-auto flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          داده‌های خام از منابع عمومی WallGold — داده‌های نمایش‌داده‌شده توصیه سرمایه‌گذاری نیست.
        </p>
        <Button asChild>
          <Link href="/dashboard">
            ورود به داشبورد
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </footer>
    </main>
  );
}
