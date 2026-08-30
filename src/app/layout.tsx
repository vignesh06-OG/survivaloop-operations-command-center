import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SurvivaLoop — Operations",
  description: "Capacity-aware intervention decision support for tree survival.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
