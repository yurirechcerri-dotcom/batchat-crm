import { BatMarca } from "@/components/branding/BatSceneria";

/**
 * Mascote dos estados vazios (prancha 11): o morcego âmbar com um detalhe por situação
 * (zzz, lupa-balão, faíscas de erro...) e o distintivo redondo do ícone no canto.
 * SVG/CSS puro, cores só por token do tema.
 */
export type HumorDoMascote = "alegre" | "dormindo" | "procurando" | "erro" | "padrao";

function Detalhe({ humor }: { humor: HumorDoMascote }) {
  const comum = "absolute text-accent";
  if (humor === "dormindo") {
    return (
      <span aria-hidden="true" className={`${comum} -right-1 -top-3 text-sm font-bold leading-none tracking-tight`}>
        z<span className="text-base">z</span>
        <span className="text-lg">Z</span>
      </span>
    );
  }
  if (humor === "procurando") {
    return (
      <svg aria-hidden="true" className={`${comum} -right-4 -top-5 h-8 w-8`} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2">
        <ellipse cx="18" cy="11" rx="10" ry="7" />
        <circle cx="10" cy="22" r="2" />
        <circle cx="14" cy="11" r=".8" fill="currentColor" />
        <circle cx="18" cy="11" r=".8" fill="currentColor" />
        <circle cx="22" cy="11" r=".8" fill="currentColor" />
      </svg>
    );
  }
  if (humor === "erro") {
    return (
      <svg aria-hidden="true" className={`${comum} -right-3 -top-3 h-6 w-6`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M6 18 3 21M12 14 12 20M17 17 21 21" />
        <path d="M4 5 8 8M20 5 16 8" />
      </svg>
    );
  }
  if (humor === "alegre") {
    return (
      <svg aria-hidden="true" className={`${comum} -right-3 -top-2 h-5 w-5`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M5 9a8 8 0 0 1 8 0M3 4a13 13 0 0 1 12 0" />
      </svg>
    );
  }
  return null;
}

export function MascoteVazio({
  humor = "padrao",
  distintivo,
}: {
  humor?: HumorDoMascote;
  distintivo?: React.ReactNode;
}) {
  return (
    <div className="relative mb-4 h-20 w-28" data-testid="mascote-vazio" data-humor={humor}>
      <BatMarca
        className={`h-full w-full text-accent drop-shadow-[0_0_18px_var(--color-accent)] ${humor === "dormindo" ? "opacity-70" : ""}`}
      />
      <Detalhe humor={humor} />
      {distintivo && (
        <span
          className="absolute -bottom-1 right-0 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-elevated text-accent shadow"
          data-testid="mascote-distintivo"
        >
          {distintivo}
        </span>
      )}
    </div>
  );
}
