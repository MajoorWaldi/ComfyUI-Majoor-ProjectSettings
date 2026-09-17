export function asGraph(candidate) {
    if (!candidate || typeof candidate !== "object")
        return null;
    return candidate;
}
export function getInnerGraphFromNode(node) {
    if (!node)
        return null;
    const candidates = [
        node.subgraph,
        node._subgraph,
        node?.subgraph?.graph,
        node?.subgraph?.lgraph,
        node?.properties?.subgraph,
        node.subgraph_instance,
        node?.subgraph_instance?.graph,
    ];
    for (const candidate of candidates) {
        if (!candidate)
            continue;
        const graph = asGraph(candidate);
        if (Array.isArray(graph?._nodes))
            return graph;
        const nested = asGraph(candidate?.graph);
        if (Array.isArray(nested?._nodes))
            return nested;
    }
    return null;
}
export function collectAllNodes(graph) {
    const allNodes = [];
    const visitedGraphs = new WeakSet();
    const visitedNodes = new WeakSet();
    function collectFromGraph(g) {
        const cg = asGraph(g);
        if (!cg || !Array.isArray(cg._nodes))
            return;
        if (visitedGraphs.has(cg))
            return;
        visitedGraphs.add(cg);
        for (const node of cg._nodes) {
            if (!node || typeof node !== "object")
                continue;
            if (visitedNodes.has(node))
                continue;
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
//# sourceMappingURL=graph_utils.js.map