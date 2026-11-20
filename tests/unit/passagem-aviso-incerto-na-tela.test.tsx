import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ptBR } from "date-fns/locale";
import { PassagemCard } from "@/components/inbox/PassagemCard";
import { montarCartoesDaPassagem, type PassagemDaConversa } from "@/lib/escalacao/cartao-da-passagem";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => ptBR }));

const passagem: PassagemDaConversa = {
  id: "passagem-teste", origem: "mcp_externo", motivo_codigo: "requested_human",
  title: "Falar com uma pessoa", body: "Contexto sintético de teste.",
  notes: null, content: null, tentativas: [], cliente_avisado: false,
  aviso_motivo_codigo: "falhou_no_envio", caso_id: null,
  criado_em: "2026-11-14T00:00:00Z", reconhecido_em: null,
  reconhecido_por: null, reconhecido_por_nome: null,
};

describe("incerteza de entrega na passagem persistida", () => {
  it("chega ao cartão sem afirmar recusa ou não recebimento", () => {
    const [cartao] = montarCartoesDaPassagem([passagem], {
      usuarioId: "operador-teste", donoId: null, donoNome: null,
    });
    render(<PassagemCard cartao={cartao!} contatoId={null} onAssumir={vi.fn()} assumindo={false} />);
    const aviso = screen.getByTestId("passagem-aviso-ao-cliente");
    expect(aviso).toHaveTextContent("Não há confirmação de que o cliente foi avisado");
    expect(aviso).toHaveTextContent("Confira a conversa antes de enviar outro aviso");
    expect(aviso.textContent).not.toMatch(/recusou|NÃO foi avisado|esperando sem saber/);
  });
});
