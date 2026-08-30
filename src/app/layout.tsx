import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SurvivaLoop — Operations",
  description: "Capacity-aware intervention decision support for tree survival.",
};

import { I18nProvider } from "@/lib/i18n/I18nContext";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
