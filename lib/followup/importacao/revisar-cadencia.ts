import type { FlowGraph, FlowNode } from "../graph-schema";

export interface RevisaoDaMensagem {
  nodeId: string;
  texto: string;
  somenteSemResposta: boolean;
}

/** Produz outra versão; nunca muda a captura nem inscrições em execução. */
export function revisarCadencia(original: FlowGraph, revisoes: RevisaoDaMensagem[], duracoes: Record<string, number>) {
  const graph = structuredClone(original);
  const changes: string[] = [];
  for (const revisao of revisoes) {
    const node = graph.nodes.find((n) => n.id === revisao.nodeId);
    if (!node || node.type !== "action" || node.config.mode !== "text" || node.config.media_url) {
      throw new Error(`mensagem_nao_revisavel:${revisao.nodeId}`);
    }
    node.config.body = revisao.texto;
    if (!revisao.somenteSemResposta) continue;
    const outgoing = graph.edges.filter((e) => e.source === node.id);
    const question = graph.nodes.find((n) => n.id === outgoing[0]?.target);
    if (outgoing.length !== 1 || !question || question.type !== "match_reply" || question.config.entrada_importada !== "text") {
      throw new Error(`espera_nao_encontrada:${node.id}`);
    }
    const timeout = graph.edges.find((e) => e.source === question.id && e.condition.type === "branch" && e.condition.branch_id === "no_reply");
    if (!timeout) throw new Error(`sem_ramo_de_silencio:${question.id}`);
    const afterId = `apos-lembrete-${node.id}`;
    if (graph.nodes.some((n) => n.id === afterId)) throw new Error("revisao_ja_aplicada");
    const after: FlowNode = { ...structuredClone(question), id: afterId, label: "Aguardar resposta ao lembrete",
      position: { x: question.position.x + 400, y: question.position.y + 120 } };
    const originalBranches = graph.edges.filter((e) => e.source === question.id).map((edge) => ({
      ...structuredClone(edge), id: `apos-${edge.id}`, source: afterId,
    }));
    for (const edge of graph.edges) if (edge.target === node.id) edge.target = question.id;
    timeout.target = node.id;
    outgoing[0]!.target = afterId;
    node.label = "Lembrete: somente sem resposta";
    graph.nodes.push(after);
    graph.edges.push(...originalBranches);
    changes.push(`lembrete:${node.id}`);
  }

  // Áudios seguidos: tempo para ouvir o anterior + 3s. Somente o intervalo
  // imediatamente entre dois áudios; esperas comerciais e perguntas não mudam.
  for (const node of [...graph.nodes]) {
    if (node.type !== "action" || node.config.mode !== "text" || !node.config.media_url) continue;
    const duration = duracoes[node.config.media_url];
    if (!duration || !Number.isFinite(duration) || duration <= 0) continue;
    const firstEdge = graph.edges.find((e) => e.source === node.id && e.condition.type === "always");
    const next = graph.nodes.find((n) => n.id === firstEdge?.target);
    if (!next || !firstEdge) continue;
    const nextAfterWait = next.type === "wait"
      ? graph.nodes.find((n) => n.id === graph.edges.find((e) => e.source === next.id && e.condition.type === "always")?.target)
      : next;
    if (nextAfterWait?.type !== "action" || nextAfterWait.config.mode !== "text" || !duracoes[nextAfterWait.config.media_url ?? ""]) continue;
    const milliseconds = Math.max(5_000, Math.ceil(duration * 1000) + 3_000);
    if (next.type === "wait" && next.config.mode === "fixed") {
      next.config.duration_ms = milliseconds;
      next.config.preservar_prazo = true;
    } else if (next.type === "action") {
      const id = `ouvir-${node.id}`;
      graph.nodes.push({ id, type: "wait", label: "Tempo para ouvir o áudio", position: { x: node.position.x, y: node.position.y + 60 },
        config: { mode: "fixed", duration_ms: milliseconds, preservar_prazo: true } });
      graph.edges.push({ id: `apos-${id}`, source: id, target: next.id, priority: 0, condition: { type: "always" } });
      firstEdge.target = id;
    }
    changes.push(`intervalo:${node.id}:${milliseconds}`);
  }
  return { graph, changes };
}
