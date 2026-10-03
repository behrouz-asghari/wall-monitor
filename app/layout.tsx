import type { Metadata } from "next";

import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/constants";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description:
    "داشبورد مانیتورینگ داده‌های لحظه‌ای WallGold — جمع‌آوری خودکار هر دقیقه، ذخیره‌سازی تاریخچه‌ای و تحلیل جریان نقدینگی.",
};

/**
 * Root layout: Persian RTL document with a self-hosted Vazirmatn font.
 * Technical identifiers inside the UI are wrapped in `.ltr` islands.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className="dark">
      <body className="min-h-screen font-sans">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
