export interface GraphNode {
  id: string;
  type: "start" | "agent" | "condition" | "end";
  data: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  [k: string]: unknown;
}

export interface GraphDocument {
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

export type ValidationRule =
  | "one_start"
  | "has_end"
  | "agent_selected"
  | "condition_routes"
  | "condition_expr"
  | "reachable";

export interface ValidationError {
  rule: ValidationRule;
  nodeId?: string;
  message: string;
}

export function validateWorkflow(graph: GraphDocument): ValidationError[] {
  const { nodes, edges } = graph;
  const errors: ValidationError[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Rule: exactly one start
  const starts = nodes.filter((n) => n.type === "start");
  if (starts.length !== 1) {
    errors.push({
      rule: "one_start",
      message:
        starts.length === 0
          ? "Workflow must have exactly one Start node."
          : "Workflow has more than one Start node.",
    });
  }

  // Rule: at least one end
  const ends = nodes.filter((n) => n.type === "end");
  if (ends.length === 0) {
    errors.push({
      rule: "has_end",
      message: "Workflow must have at least one End node.",
    });
  }

  // Rule: every agent node has agent_id
  for (const n of nodes) {
    if (n.type === "agent" && !n.data?.agent_id) {
      errors.push({
        rule: "agent_selected",
        nodeId: n.id,
        message: `Agent node "${n.id}" has no agent selected.`,
      });
    }
  }

  // Rule: condition nodes must have true and false outgoing edges
  for (const n of nodes) {
    if (n.type !== "condition") continue;
    const outEdges = edges.filter((e) => e.source === n.id);
    const hasTrue = outEdges.some((e) => e.sourceHandle === "true");
    const hasFalse = outEdges.some((e) => e.sourceHandle === "false");
    if (!hasTrue || !hasFalse) {
      errors.push({
        rule: "condition_routes",
        nodeId: n.id,
        message: `Condition node "${n.id}" must have both a True and False outgoing edge.`,
      });
    }
    // Rule: condition expression must not be empty (expr mode)
    if (n.data?.mode !== "hint" && !n.data?.expr) {
      errors.push({
        rule: "condition_expr",
        nodeId: n.id,
        message: `Condition node "${n.id}" has an empty expression.`,
      });
    }
  }

  // Rule: every node reachable from start (BFS)
  const startNode = starts[0];
  if (startNode) {
    const adj = new Map<string, string[]>();
    for (const id of nodeIds) adj.set(id, []);
    for (const e of edges) {
      if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
        adj.get(e.source)!.push(e.target);
      }
    }
    const visited = new Set<string>();
    const queue = [startNode.id];
    while (queue.length) {
      const curr = queue.shift()!;
      if (visited.has(curr)) continue;
      visited.add(curr);
      queue.push(...(adj.get(curr) ?? []));
    }
    for (const n of nodes) {
      if (!visited.has(n.id)) {
        errors.push({
          rule: "reachable",
          nodeId: n.id,
          message: `Node "${n.id}" is not reachable from Start.`,
        });
      }
    }
  }

  return errors;
}

export function getNodeErrorIds(errors: ValidationError[]): Set<string> {
  return new Set(errors.flatMap((e) => (e.nodeId ? [e.nodeId] : [])));
}

export function hasBackEdge(
  nodes: Pick<GraphNode, "id">[],
  edges: Pick<GraphEdge, "source" | "target">[],
): boolean {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(id: string): boolean {
    visited.add(id);
    inStack.add(id);
    for (const next of adj.get(id) ?? []) {
      if (inStack.has(next)) return true;
      if (!visited.has(next) && dfs(next)) return true;
    }
    inStack.delete(id);
    return false;
  }

  for (const n of nodes) {
    if (!visited.has(n.id) && dfs(n.id)) return true;
  }
  return false;
}
