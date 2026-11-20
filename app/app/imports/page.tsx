import type { Metadata } from "next";
import { ImportsListClient } from "./_client";

export const metadata: Metadata = { title: "Importações" };

export default function ImportsPage() {
  return <ImportsListClient />;
}
