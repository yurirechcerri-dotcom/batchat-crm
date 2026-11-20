import { logger } from "@/lib/logger";

// Não usar classificarFalhaDeAlcance: lê texto livre e interpreta EAI_AGAIN
// como endereço inexistente. Aqui preservamos apenas códigos, sem inferir causa.
const CODIGOS = new Set([
  "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH",
  "ENETDOWN", "ETIMEDOUT", "ECONNRESET", "EPIPE", "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET",
  "UND_ERR_ABORTED", "ABORT_ERR", "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN", "CERT_HAS_EXPIRED",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NOS = 32;
const MAX_PROFUNDIDADE = 8;

/** Só propriedades de dados; não executa getters presentes em erros externos. */
function dado(objeto: object, chave: string): unknown {
  try {
    const propriedade = Object.getOwnPropertyDescriptor(objeto, chave);
    return propriedade && "value" in propriedade ? propriedade.value : undefined;
  } catch {
    return undefined;
  }
}

function codigosDe(erro: unknown): string[] {
  const fila = [{ erro, profundidade: 0 }];
  const vistos = new Set<object>();
  const codigos = new Set<string>();
  for (let i = 0; i < fila.length && i < MAX_NOS; i++) {
    const item = fila[i]!;
    if (item.erro === null || typeof item.erro !== "object" || vistos.has(item.erro)) continue;
    vistos.add(item.erro);
    const codigo = dado(item.erro, "code");
    if (typeof codigo === "string" && CODIGOS.has(codigo)) codigos.add(codigo);
    if (item.profundidade >= MAX_PROFUNDIDADE) continue;
    const adicionar = (filho: unknown) => {
      if (fila.length < MAX_NOS) fila.push({ erro: filho, profundidade: item.profundidade + 1 });
    };
    const causa = dado(item.erro, "cause");
    if (causa !== undefined) adicionar(causa);
    const erros = dado(item.erro, "errors");
    if (Array.isArray(erros)) {
      for (let j = 0; j < MAX_NOS && fila.length < MAX_NOS && j < erros.length; j++) {
        adicionar(dado(erros, String(j)));
      }
    }
  }
  return [...codigos];
}

interface Contexto {
  organizationId: string;
  messageId: string;
  requestId?: string;
}

/** Diagnóstico best-effort: o catch inclui pré-transporte e persistência também. */
export function registrarDiagnosticoDeFalhaDeEnvio(erro: unknown, contexto: Contexto): void {
  try {
    const requestId = contexto.requestId;
    const requestSeguro = typeof requestId === "string" && (
      UUID.test(requestId) || (requestId.startsWith("handoff-aviso-") && UUID.test(requestId.slice(14)))
    );
    logger.warn("messages.send_pipeline_failure", {
      phase: "send_pipeline",
      network_codes: codigosDe(erro),
      ...(UUID.test(contexto.organizationId) ? { organization_id: contexto.organizationId } : {}),
      ...(UUID.test(contexto.messageId) ? { message_id: contexto.messageId } : {}),
      ...(requestSeguro ? { requestId } : {}),
    });
  } catch {
    // Nem erro hostil nem falha do logger pode mudar o desfecho da mensagem.
  }
}
