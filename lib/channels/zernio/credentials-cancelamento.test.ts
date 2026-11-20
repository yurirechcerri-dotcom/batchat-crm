import { beforeEach, expect, it, vi } from "vitest";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import { valorDaInstalacao } from "@/lib/instalacao/config";
import { zernioCredsForAccountId } from "./credentials";
vi.mock("@/lib/webhooks/secrets", () => ({ decryptWebhookSecret: vi.fn() }));
vi.mock("@/lib/instalacao/config", () => ({ valorDaInstalacao: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(decryptWebhookSecret).mockResolvedValue("segredo-sintetico");
  vi.mocked(valorDaInstalacao).mockResolvedValue({ valor: "segredo-sintetico" } as Awaited<ReturnType<typeof valorDaInstalacao>>);
});
it.each([false, true])("não inicia decifragem ou leitura de instalação depois de cancelar; instalação=%s", async (instalacao) => {
  let resolver!: (r: unknown) => void;
  const pendente = new Promise((resolve) => { resolver = resolve; });
  const q = { select: () => q, eq: () => q, is: () => q, abortSignal: () => q, maybeSingle: () => pendente };
  const db = { from: () => q } as never;
  const controller = new AbortController();
  const p = zernioCredsForAccountId(db, { organizationId: "org", accountId: "conta", signal: controller.signal });
  controller.abort(new Error("cancelado"));
  resolver({ data: { zernio_account_id: "conta", zernio_token_encrypted: "00", zernio_credencial_da_instalacao: instalacao }, error: null });
  await expect(p).rejects.toThrow("cancelado");
  expect(decryptWebhookSecret).not.toHaveBeenCalled();
  expect(valorDaInstalacao).not.toHaveBeenCalled();
});
