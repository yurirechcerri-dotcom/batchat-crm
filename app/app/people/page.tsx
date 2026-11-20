import type { Metadata } from "next";
import { PeopleListClient } from "./_client";

export const metadata: Metadata = { title: "Pessoas" };

export default function PeoplePage() {
  return <PeopleListClient />;
}
