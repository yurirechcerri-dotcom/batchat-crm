import type { Role, VisibilityMode } from "@/lib/auth/types";

/** Visibilidade da aba, nao autorizacao de dados: o deep-link segue sob RLS. */
export function abaTodasVisivel(role: Role | undefined, mode: VisibilityMode | undefined): boolean {
  return role !== "agent" || mode === "all" || mode === "own_and_sector";
}
