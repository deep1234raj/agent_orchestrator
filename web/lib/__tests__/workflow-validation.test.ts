import { describe, it, expect } from "vitest";
import {
  validateWorkflow,
  getNodeErrorIds,
  hasBackEdge,
  type GraphDocument,
} from "../workflow-validation";

const baseGraph: GraphDocument = {
  nodes: [
    { id: "start", type: "start", data: {}, position: { x: 0, y: 0 } },
    {
      id: "a1",
      type: "agent",
      data: { agent_id: "uuid-1" },
      position: { x: 100, y: 0 },
    },
    { id: "end", type: "end", data: {}, position: { x: 200, y: 0 } },
  ],
  edges: [
    { id: "e1", source: "start", target: "a1" },
    { id: "e2", source: "a1", target: "end" },
  ],
};

describe("validateWorkflow", () => {
  it("returns no errors for a valid linear graph", () => {
    expect(validateWorkflow(baseGraph)).toHaveLength(0);
  });

  it("errors when no start node", () => {
    const g: GraphDocument = {
      nodes: [
        {
          id: "a1",
          type: "agent",
          data: { agent_id: "x" },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    };
    const errors = validateWorkflow(g);
    expect(errors.some((e) => e.rule === "one_start")).toBe(true);
  });

  it("errors when multiple start nodes", () => {
    const g: GraphDocument = {
      nodes: [
        { id: "s1", type: "start", data: {}, position: { x: 0, y: 0 } },
        { id: "s2", type: "start", data: {}, position: { x: 100, y: 0 } },
      ],
      edges: [],
    };
    expect(validateWorkflow(g).some((e) => e.rule === "one_start")).toBe(true);
  });

  it("errors when no end node", () => {
    const g: GraphDocument = {
      nodes: [
        { id: "start", type: "start", data: {}, position: { x: 0, y: 0 } },
        {
          id: "a1",
          type: "agent",
          data: { agent_id: "x" },
          position: { x: 100, y: 0 },
        },
      ],
      edges: [{ id: "e1", source: "start", target: "a1" }],
    };
    expect(validateWorkflow(g).some((e) => e.rule === "has_end")).toBe(true);
  });

  it("errors when agent node has no agent_id", () => {
    const g: GraphDocument = {
      ...baseGraph,
      nodes: baseGraph.nodes.map((n) =>
        n.id === "a1" ? { ...n, data: {} } : n,
      ),
    };
    expect(
      validateWorkflow(g).some(
        (e) => e.rule === "agent_selected" && e.nodeId === "a1",
      ),
    ).toBe(true);
  });

  it("errors when condition node missing true/false edges", () => {
    const g: GraphDocument = {
      nodes: [
        { id: "start", type: "start", data: {}, position: { x: 0, y: 0 } },
        {
          id: "c1",
          type: "condition",
          data: { expr: 'last_message contains "ok"' },
          position: { x: 100, y: 0 },
        },
        { id: "end", type: "end", data: {}, position: { x: 200, y: 0 } },
      ],
      edges: [
        { id: "e1", source: "start", target: "c1" },
        { id: "e2", source: "c1", target: "end", sourceHandle: "true" },
        // missing false edge
      ],
    };
    expect(
      validateWorkflow(g).some(
        (e) => e.rule === "condition_routes" && e.nodeId === "c1",
      ),
    ).toBe(true);
  });

  it("errors when node unreachable from start", () => {
    const g: GraphDocument = {
      nodes: [
        { id: "start", type: "start", data: {}, position: { x: 0, y: 0 } },
        {
          id: "a1",
          type: "agent",
          data: { agent_id: "x" },
          position: { x: 100, y: 0 },
        },
        {
          id: "orphan",
          type: "agent",
          data: { agent_id: "y" },
          position: { x: 300, y: 0 },
        },
        { id: "end", type: "end", data: {}, position: { x: 200, y: 0 } },
      ],
      edges: [
        { id: "e1", source: "start", target: "a1" },
        { id: "e2", source: "a1", target: "end" },
      ],
    };
    expect(
      validateWorkflow(g).some(
        (e) => e.rule === "reachable" && e.nodeId === "orphan",
      ),
    ).toBe(true);
  });
});

describe("getNodeErrorIds", () => {
  it("returns set of node ids with errors", () => {
    const g: GraphDocument = {
      nodes: [
        { id: "start", type: "start", data: {}, position: { x: 0, y: 0 } },
        { id: "a1", type: "agent", data: {}, position: { x: 100, y: 0 } }, // no agent_id
        { id: "end", type: "end", data: {}, position: { x: 200, y: 0 } },
      ],
      edges: [
        { id: "e1", source: "start", target: "a1" },
        { id: "e2", source: "a1", target: "end" },
      ],
    };
    const ids = getNodeErrorIds(validateWorkflow(g));
    expect(ids.has("a1")).toBe(true);
  });
});

describe("hasBackEdge", () => {
  it("returns false for a DAG", () => {
    expect(hasBackEdge(baseGraph.nodes, baseGraph.edges)).toBe(false);
  });

  it("returns true for a graph with a cycle", () => {
    const nodes = baseGraph.nodes;
    const edges = [
      ...baseGraph.edges,
      { id: "back", source: "end", target: "start" }, // artificial back edge
    ];
    expect(hasBackEdge(nodes, edges)).toBe(true);
  });
});
