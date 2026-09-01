import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SurvivaLoop — Operations",
  description: "Capacity-aware intervention decision support for tree survival.",
};

import { I18nProvider } from "@/lib/i18n/I18nContext";
import { ThemeProvider } from "@/lib/theme";
import AiBot from "@/components/AiBot";
import AutoDemo from "@/components/AutoDemo";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <I18nProvider>
            {children}
            <AiBot />
            <AutoDemo />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
