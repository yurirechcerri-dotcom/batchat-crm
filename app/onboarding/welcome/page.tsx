import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { WelcomeForm } from "./_form";
import { marcaDaSaida } from "@/lib/branding/saida";
import { createClient } from "@/lib/supabase/server";
import { lerRetratoDaInstalacao } from "@/lib/instalacao/retrato";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

/**
 * O começo do setup: três perguntas de clique, nada para ler nem escrever.
 *
 * A tela anterior abria com um quadro do que a INSTALAÇÃO já tinha pronto
 * (servidor, banco, chave) e pedia nome, ramo, fuso e aceite — texto demais
 * para quem acabou de criar a conta. O quadro saiu daqui (o `JaEstaPronto`
 * continua no repositório para a instalação por kit, se alguém quiser de volta);
 * o fuso vem do navegador e o ramo deixou de ser pergunta obrigatória.
 */
export default async function WelcomePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/login");
  const idioma = user.idioma;

  const marca = await marcaDaSaida(null);

  const supabase = await createClient();
  const retrato = await lerRetratoDaInstalacao({ supabase, orgId: activeOrg.orgId });

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          {traduzir("Boas-vindas ao", idioma)} {marca.nome}
        </h2>
        <p className="text-sm text-muted-foreground">
          {traduzir("Três cliques e a gente monta o resto do setup para você.", idioma)}
        </p>
      </header>

      {/* O nome da empresa só entra como sugestão quando já é de verdade o dela. */}
      <WelcomeForm
        defaultOrgName={retrato.empresa.aindaSemNomeProprio ? "" : activeOrg.name}
        orgId={activeOrg.orgId}
      />
    </div>
  );
}
