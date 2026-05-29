"use client";

import {
  useState,
  useCallback,
  useMemo,
  createContext,
  useContext,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  BackgroundVariant,
  type NodeTypes,
  type Node,
  type Edge,
  type Connection,
  type OnConnect,
  type OnNodesDelete,
  type OnEdgesDelete,
  type IsValidConnection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Save, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NodePropertiesPanel } from "@/components/node-properties-panel";
import {
  validateWorkflow,
  getNodeErrorIds,
  hasBackEdge,
  type GraphNode,
  type GraphDocument,
  type GraphEdge,
} from "@/lib/workflow-validation";
import { workflowsApi } from "@/lib/api/resources";
import { ApiException } from "@/lib/api/client";
import type { Agent } from "@/lib/api/resources";

/* ── Error context — node components read this to show red outlines ── */
// Avoids storing __error in node.data, which would cause a render loop:
// setNodes(__error) → nodes change → buildGraphDocument strips __error →
// same graphDoc → same errors → setNodes again indefinitely.
const WorkflowErrorContext = createContext<Set<string>>(new Set());

/* ── Handle styles ── */
const handleStyle = {
  width: 8,
  height: 8,
  background: "rgb(var(--border))",
  border: "1px solid rgb(var(--border))",
};
const trueHandleStyle = {
  ...handleStyle,
  background: "#34d399",
  border: "1px solid #34d399",
};
const falseHandleStyle = {
  ...handleStyle,
  background: "#f87171",
  border: "1px solid #f87171",
};

/* ── Edit-mode node components ── */
// Each receives `id` from React Flow and reads error state via context.

function EditStartNode(_: { id: string; data: Record<string, unknown> }) {
  return (
    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-500/20 border-2 border-green-500/60 text-green-400 text-xs font-mono font-semibold">
      Start
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
}

function EditEndNode({ id }: { id: string; data: Record<string, unknown> }) {
  const errorIds = useContext(WorkflowErrorContext);
  return (
    <div
      className={`flex items-center justify-center w-14 h-14 rounded-full bg-danger/20 border-2 text-danger text-xs font-mono font-semibold ${errorIds.has(id) ? "border-red-500 ring-2 ring-red-500/40" : "border-danger/60"}`}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      End
    </div>
  );
}

function EditAgentNode({
  id,
  data,
}: {
  id: string;
  data: Record<string, unknown>;
}) {
  const errorIds = useContext(WorkflowErrorContext);
  const agentName =
    (data.agent_name as string | undefined) ??
    (data.agent_id ? "Agent" : "No agent selected");
  return (
    <div
      className={`min-w-[140px] rounded-lg border bg-elevated px-4 py-3 shadow-sm ${errorIds.has(id) ? "border-red-500 ring-2 ring-red-500/40" : "border-border"}`}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <p className="text-[10px] font-mono uppercase tracking-wider text-fg-subtle mb-0.5">
        Agent
      </p>
      <p
        className={`text-sm font-medium leading-tight ${!data.agent_id ? "text-fg-subtle italic" : "text-fg"}`}
      >
        {agentName}
      </p>
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
}

function EditConditionNode({
  id,
  data,
}: {
  id: string;
  data: Record<string, unknown>;
}) {
  const errorIds = useContext(WorkflowErrorContext);
  const expr = (data.expr as string | undefined) ?? "—";
  return (
    <div
      className={`min-w-[140px] rounded-lg border px-4 py-3 ${errorIds.has(id) ? "border-amber-500 ring-2 ring-amber-500/40 bg-amber-500/10" : "border-amber-500/40 bg-amber-500/10"}`}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <p className="text-[10px] font-mono uppercase tracking-wider text-amber-400/70 mb-0.5">
        Condition
      </p>
      <p className="text-xs text-amber-300 font-mono leading-tight truncate max-w-[160px]">
        {expr}
      </p>
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ ...trueHandleStyle, top: "30%" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        style={{ ...falseHandleStyle, top: "70%" }}
      />
    </div>
  );
}

const editNodeTypes: NodeTypes = {
  start: EditStartNode,
  agent: EditAgentNode,
  condition: EditConditionNode,
  end: EditEndNode,
};

/* ── Helpers ── */

function buildGraphDocument(nodes: Node[], edges: Edge[]): GraphDocument {
  const conditionIds = new Set(
    nodes.filter((n) => n.type === "condition").map((n) => n.id),
  );
  const conditionRoutes = new Map<
    string,
    { on_true?: string; on_false?: string }
  >();
  for (const e of edges) {
    if (!conditionIds.has(e.source)) continue;
    const existing = conditionRoutes.get(e.source) ?? {};
    if (e.sourceHandle === "true")
      conditionRoutes.set(e.source, { ...existing, on_true: e.target });
    else if (e.sourceHandle === "false")
      conditionRoutes.set(e.source, { ...existing, on_false: e.target });
  }
  return {
    nodes: nodes.map((n) => {
      const {
        agent_name: _agent_name,
        isActive: _isActive,
        ...data
      } = (n.data ?? {}) as Record<string, unknown>;
      const condData = conditionIds.has(n.id)
        ? (conditionRoutes.get(n.id) ?? {})
        : {};
      return {
        id: n.id,
        type: (n.type ?? "agent") as GraphNode["type"],
        position: n.position,
        data: { ...data, ...condData },
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
    })),
  };
}

function toFlowNodes(
  graphNodes: GraphNode[],
  agentsById: Map<string, Agent>,
): Node[] {
  return graphNodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    draggable: true,
    selectable: true,
    data: {
      ...n.data,
      agent_name: n.data.agent_id
        ? (agentsById.get(n.data.agent_id as string)?.name ?? n.data.agent_id)
        : undefined,
    },
  }));
}

function toFlowEdges(graphEdges: GraphEdge[]): Edge[] {
  return graphEdges.map((e) => {
    const isTrue = e.sourceHandle === "true";
    const isFalse = e.sourceHandle === "false";
    if (isTrue || isFalse) {
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        type: "smoothstep",
        label: isTrue ? "true" : "false",
        labelStyle: {
          fill: isTrue ? "#34d399" : "#f87171",
          fontSize: 10,
          fontFamily: "monospace",
        },
        labelBgStyle: { fill: "rgb(var(--bg))", fillOpacity: 0.85 },
        style: { stroke: isTrue ? "#34d399" : "#f87171", strokeWidth: 1.5 },
      };
    }
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      style: { stroke: "rgb(var(--border))", strokeWidth: 1.5 },
    };
  });
}

/* ── Inner editor (must be inside ReactFlowProvider) ── */
interface WorkflowEditorInnerProps {
  workflowId: string;
  workflowName: string;
  initialGraph: GraphDocument;
  agents: Agent[];
  onSaved: () => void;
  onCancel: () => void;
}

function WorkflowEditorInner({
  workflowId,
  workflowName,
  initialGraph,
  agents,
  onSaved,
  onCancel,
}: WorkflowEditorInnerProps) {
  const { screenToFlowPosition } = useReactFlow();
  const queryClient = useQueryClient();
  const agentsById = useMemo(
    () => new Map(agents.map((a) => [a.id, a])),
    [agents],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(
    toFlowNodes(initialGraph.nodes, agentsById),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    toFlowEdges(initialGraph.edges),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Derive validation state from current React Flow state — NOT stored in node.data to avoid render loops
  const graphDoc = useMemo(
    () => buildGraphDocument(nodes, edges),
    [nodes, edges],
  );
  const errors = useMemo(() => validateWorkflow(graphDoc), [graphDoc]);
  const errorIds = useMemo(() => getNodeErrorIds(errors), [errors]);
  const loopDetected = useMemo(
    () => hasBackEdge(graphDoc.nodes, graphDoc.edges),
    [graphDoc],
  );

  const addNode = useCallback(
    (type: "agent" | "condition" | "end") => {
      const position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const id = `${type}-${crypto.randomUUID().slice(0, 8)}`;
      setNodes((ns) => [
        ...ns,
        {
          id,
          type,
          position,
          draggable: true,
          selectable: true,
          data: type === "condition" ? { mode: "expr", expr: "" } : {},
        },
      ]);
      setSelectedNodeId(id);
      setIsDirty(true);
    },
    [screenToFlowPosition, setNodes],
  );

  const isValidConnection: IsValidConnection = useCallback(
    (connection: Edge | Connection) => {
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (targetNode?.type === "start") return false;
      const sourceNode = nodes.find((n) => n.id === connection.source);
      if (sourceNode?.type === "end") return false;
      if (sourceNode?.type === "condition" && connection.sourceHandle) {
        const conflict = edges.some(
          (e) =>
            e.source === connection.source &&
            e.sourceHandle === connection.sourceHandle,
        );
        if (conflict) return false;
      }
      return true;
    },
    [nodes, edges],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      const isTrue = connection.sourceHandle === "true";
      const isFalse = connection.sourceHandle === "false";
      const edge: Edge = {
        id: `e-${connection.source}-${connection.sourceHandle ?? "out"}-${connection.target}-${Date.now()}`,
        source: connection.source!,
        target: connection.target!,
        sourceHandle: connection.sourceHandle,
        type: "smoothstep",
        ...(isTrue || isFalse
          ? {
              label: isTrue ? "true" : "false",
              labelStyle: {
                fill: isTrue ? "#34d399" : "#f87171",
                fontSize: 10,
                fontFamily: "monospace",
              },
              labelBgStyle: { fill: "rgb(var(--bg))", fillOpacity: 0.85 },
              style: {
                stroke: isTrue ? "#34d399" : "#f87171",
                strokeWidth: 1.5,
              },
            }
          : { style: { stroke: "rgb(var(--border))", strokeWidth: 1.5 } }),
      };
      setEdges((es) => addEdge(edge, es));
      setIsDirty(true);
    },
    [setEdges],
  );

  const onNodesDelete: OnNodesDelete = useCallback(() => setIsDirty(true), []);
  const onEdgesDelete: OnEdgesDelete = useCallback(() => setIsDirty(true), []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => setSelectedNodeId(node.id),
    [],
  );
  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);
  const onNodeDragStop = useCallback(() => setIsDirty(true), []);

  const handleNodeUpdate = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  ...patch,
                  agent_name:
                    patch.agent_id !== undefined
                      ? (agentsById.get(patch.agent_id as string)?.name ??
                        patch.agent_id)
                      : n.data.agent_name,
                },
              }
            : n,
        ),
      );
      setIsDirty(true);
    },
    [setNodes, agentsById],
  );

  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      setNodes((ns) => ns.filter((n) => n.id !== nodeId));
      setEdges((es) =>
        es.filter((e) => e.source !== nodeId && e.target !== nodeId),
      );
      setSelectedNodeId(null);
      setIsDirty(true);
    },
    [setNodes, setEdges],
  );

  const { mutate: saveWorkflow, isPending: isSaving } = useMutation({
    mutationFn: (graph: GraphDocument) =>
      workflowsApi.update(workflowId, {
        graph: graph as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
      onSaved();
    },
    onError: (err) => {
      toast.error(err instanceof ApiException ? err.detail : "Save failed");
    },
  });

  const handleSave = useCallback(() => {
    if (!isDirty) return;
    if (errors.length > 0) {
      toast.error(
        <div>
          <p className="font-medium mb-1">
            Fix {errors.length} error{errors.length > 1 ? "s" : ""} before
            saving:
          </p>
          <ul className="text-sm list-disc list-inside space-y-0.5">
            {errors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>,
        { duration: 6000 },
      );
      return;
    }
    saveWorkflow(buildGraphDocument(nodes, edges));
  }, [errors, nodes, edges, saveWorkflow, isDirty]);

  const selectedGraphNode = useMemo(
    () => graphDoc.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [graphDoc, selectedNodeId],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface/40 flex-shrink-0">
        <button
          onClick={onCancel}
          className="text-xs text-fg-muted hover:text-fg transition-colors font-medium flex items-center gap-1"
        >
          ← {workflowName}
        </button>
        <span className="text-border text-sm mx-1">|</span>
        <Button
          size="sm"
          variant="outline"
          className="gap-1 text-xs h-7"
          onClick={() => addNode("agent")}
        >
          <Plus className="h-3 w-3" /> Agent
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1 text-xs h-7"
          onClick={() => addNode("condition")}
        >
          <Plus className="h-3 w-3" /> Condition
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1 text-xs h-7"
          onClick={() => addNode("end")}
        >
          <Plus className="h-3 w-3" /> End
        </Button>
        <span className="flex-1" />
        {loopDetected && (
          <Badge
            variant="outline"
            className="text-blue-400 border-blue-400/30 bg-blue-400/10 text-xs gap-1"
          >
            <RefreshCw className="h-2.5 w-2.5" /> loop
          </Badge>
        )}
        {errors.length > 0 && (
          <Badge
            variant="outline"
            className="text-danger border-danger/30 bg-danger/10 text-xs gap-1"
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            {errors.length} error{errors.length !== 1 ? "s" : ""}
          </Badge>
        )}
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="text-xs h-7 gap-1"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
        >
          <Save className="h-3 w-3" />
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* Canvas + properties panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <WorkflowErrorContext.Provider value={errorIds}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={editNodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodesDelete={onNodesDelete}
              onEdgesDelete={onEdgesDelete}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onNodeDragStop={onNodeDragStop}
              isValidConnection={isValidConnection}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              nodesDraggable
              nodesConnectable
              elementsSelectable
              deleteKeyCode="Delete"
              panOnDrag
              zoomOnScroll
              proOptions={{ hideAttribution: true }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color="rgb(var(--border))"
              />
              <Controls
                showInteractive={false}
                className="[&_button]:bg-elevated [&_button]:border-border [&_button]:text-fg-muted"
              />
            </ReactFlow>
          </WorkflowErrorContext.Provider>
        </div>

        {selectedGraphNode ? (
          <NodePropertiesPanel
            node={selectedGraphNode}
            nodes={graphDoc.nodes}
            agents={agents}
            onUpdate={handleNodeUpdate}
            onDelete={handleNodeDelete}
          />
        ) : (
          <div className="w-[280px] flex-shrink-0 border-l border-border bg-surface/40 flex items-center justify-center">
            <p className="text-xs text-fg-subtle text-center px-4">
              Select a node to configure it
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Public component ── */
export interface WorkflowEditorProps {
  workflowId: string;
  workflowName: string;
  initialGraph: GraphDocument;
  agents: Agent[];
  onSaved: () => void;
  onCancel: () => void;
}

export function WorkflowEditor(props: WorkflowEditorProps) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
