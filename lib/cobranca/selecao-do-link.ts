import { z } from "zod";

const idDePlano = z.string().uuid();

/** "Equipe" e "equipe" e "Équipe" são o mesmo pedido: o link da landing leva o nome do plano. */
const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** O link sugere uma opção já oferecida; não concede preço nem autoridade. */
export function selecionarPlanoDoLink(
  pedido: string | string[] | undefined,
  oferecidos: readonly { id: string; nome?: string }[],
  inicialPadrao: string | undefined,
  temConvite: boolean,
): { planoInicial: string | undefined; linkInvalido: boolean; linkEscolheuPlano: boolean } {
  // Convite sempre conserva o caminho nativo, mesmo se a URL trouxer um plano.
  if (temConvite || pedido === undefined) {
    return { planoInicial: inicialPadrao, linkInvalido: false, linkEscolheuPlano: false };
  }
  const id = idDePlano.safeParse(pedido);
  // Pelo identificador (UUID) ou pelo nome (`?plano=pro`). O nome só vale quando
  // é inequívoco: dois planos com o mesmo nome não resolvem nenhum dos dois.
  const pelaNome =
    typeof pedido === "string" && !id.success
      ? oferecidos.filter((p) => p.nome !== undefined && normalizar(p.nome) === normalizar(pedido))
      : [];
  const plano = id.success ? oferecidos.find((p) => p.id === id.data) : pelaNome.length === 1 ? pelaNome[0] : undefined;
  return {
    planoInicial: plano?.id ?? inicialPadrao,
    // Sem plano oferecido não há seletor: o aviso apontaria para uma tela que não existe.
    linkInvalido: !plano && oferecidos.length > 0,
    // Só o link que RESOLVEU tira o Google, que não carrega a escolha; um valor
    // qualquer na URL não muda a regra do doc 146.
    linkEscolheuPlano: Boolean(plano),
  };
}
