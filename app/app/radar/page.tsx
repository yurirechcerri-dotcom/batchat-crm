import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { RadarComercial } from "./_components/RadarComercial";
import { RiskRadarList } from "./_components/RiskRadarList";
import { CabecalhoDePagina } from "@/components/shell/CabecalhoDePagina";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Radar" };

export default async function RadarPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  // `t` local em vez do hook: esta página é componente de SERVIDOR, e lá o
  // idioma vem resolvido em `user.idioma` (a cadeia pessoa → organização →
  // padrão vive em `lib/auth/server.ts`), sem reler o `locale` cru.
  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <div className="flex h-full flex-col gap-6 md:p-6">
      <CabecalhoDePagina
        className="px-4 pt-4 md:px-0 md:pt-0"
        titulo={t("Radar")}
        apoio={t("Oportunidades, dúvidas e atendimentos que precisam da sua atenção.")}
      />
      <RadarComercial orgId={activeOrg.orgId} />
      <RiskRadarList />
    </div>
  );
}
