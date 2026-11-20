import { cn } from "@/lib/utils";

function iniciais(nome: string | null | undefined, reserva: string): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return reserva.slice(0, 2).toUpperCase();
  if (partes.length === 1) return (partes[0] ?? "").slice(0, 2).toUpperCase();
  return ((partes[0]?.[0] ?? "") + (partes[partes.length - 1]?.[0] ?? "")).toUpperCase();
}

/** Avatar do card do contato: iniciais com anel âmbar, como no BatChat antigo e nas pranchas 04/05. */
export function AvatarComAnel({ nome, reserva = "?", className }: { nome: string | null | undefined; reserva?: string; className?: string }) {
  return (
    <span
      aria-hidden
      data-testid="avatar-com-anel"
      className={cn(
        "flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-surface-elevated text-base font-semibold text-text",
        className,
      )}
    >
      {iniciais(nome, reserva)}
    </span>
  );
}
