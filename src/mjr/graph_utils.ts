import type { ComfyGraph, ComfyNode } from "../types/domain.js";

export function asGraph(candidate: unknown): ComfyGraph | null {
  if (!candidate || typeof candidate !== "object") return null;
  return candidate as ComfyGraph;
}

export function getInnerGraphFromNode(node: ComfyNode | null | undefined): ComfyGraph | null {
  if (!node) return null;
  const candidates = [
    node.subgraph,
    node._subgraph,
    (node?.subgraph as { graph?: unknown } | undefined)?.graph,
    (node?.subgraph as { lgraph?: unknown } | undefined)?.lgraph,
    node?.properties?.subgraph,
    node.subgraph_instance,
    (node?.subgraph_instance as { graph?: unknown } | undefined)?.graph,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const graph = asGraph(candidate);
    if (Array.isArray(graph?._nodes)) return graph;
    const nested = asGraph((candidate as { graph?: unknown })?.graph);
    if (Array.isArray(nested?._nodes)) return nested;
  }
  return null;
}

export function collectAllNodes(graph: ComfyGraph | null | undefined): ComfyNode[] {
  const allNodes: ComfyNode[] = [];
  const visitedGraphs = new WeakSet<object>();
  const visitedNodes = new WeakSet<object>();

  function collectFromGraph(g: unknown): void {
    const cg = asGraph(g);
    if (!cg || !Array.isArray(cg._nodes)) return;
    if (visitedGraphs.has(cg)) return;
    visitedGraphs.add(cg);

    for (const node of cg._nodes) {
      if (!node || typeof node !== "object") continue;
      if (visitedNodes.has(node)) continue;
      visitedNodes.add(node);
      allNodes.push(node);

      const inner = getInnerGraphFromNode(node);
      if (inner) {
        collectFromGraph(inner);
      }
      if (node.graph && typeof node.graph === "object" && node.graph !== cg) {
        collectFromGraph(node.graph);
      }
    }
  }

  collectFromGraph(graph);
  return allNodes;
}
