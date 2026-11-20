import type { ReactNode } from "react";

/**
 * Cabeçalho único das telas internas (DESIGN.md: "Página interna: título 28–36,
 * no máx. uma linha de apoio"). Antes cada tela montava o seu `<header>` com
 * tamanhos e espaços diferentes; agora o título, o apoio e as ações ficam num só
 * lugar. No celular as ações descem para baixo do título e o apoio some depois
 * de duas linhas (o texto inteiro fica no atributo `title`).
 */
export function CabecalhoDePagina({
  titulo,
  apoio,
  acoes,
  className = "",
  como = "header",
}: {
  titulo: ReactNode;
  apoio?: string;
  acoes?: ReactNode;
  className?: string;
  /** `div` quando o cabeçalho já está dentro de outro `<header>` (a tela põe as ações ao lado). */
  como?: "header" | "div";
}) {
  const Raiz = como;
  return (
    <Raiz
      data-testid="cabecalho-de-pagina"
      className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4 ${className}`}
    >
      <div className="min-w-0">
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-4xl">{titulo}</h1>
        {apoio ? (
          <p title={apoio} className="mt-1 line-clamp-2 text-sm text-text-muted sm:line-clamp-1">
            {apoio}
          </p>
        ) : null}
      </div>
      {acoes ? <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div> : null}
    </Raiz>
  );
}
