import FieldView from "@/components/FieldView";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Field View - SurvivaLoop",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function FieldPage() {
  return <FieldView />;
}
