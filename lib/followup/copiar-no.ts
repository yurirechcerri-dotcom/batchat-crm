import type { RFNode } from "./graph-mappers";

/** Cópia desconectada: não herda seleção, erros nem ligações do nó original. */
export function copiarNoDoFluxo(node: RFNode, id: string): RFNode | null {
  if (node.type === "trigger") return null;
  return {
    id,
    type: node.type,
    position: { x: node.position.x + 280, y: node.position.y + 40 },
    data: { label: node.data.label, config: structuredClone(node.data.config) },
  };
}
