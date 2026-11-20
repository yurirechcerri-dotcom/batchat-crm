import type { Metadata } from "next";
import { CallsClient } from "./_client";

export const metadata: Metadata = { title: "Ligações" };

export const dynamic = "force-dynamic";

export default function CallsPage() {
  return <CallsClient />;
}
