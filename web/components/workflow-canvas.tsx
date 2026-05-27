'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type Node,
  type Edge,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { cn } from '@/lib/utils';
import type { Agent } from '@/lib/api/resources';

/* ── Graph document shape (matches backend compiler output) ── */
export interface GraphNode {
  id: string;
  type: 'start' | 'agent' | 'condition' | 'end';
  data: Record<string, unknown>;
  position: { x: number; y: number };
}
export interface GraphDocument {
  nodes: GraphNode[];
  edges: Array<{ id: string; source: string; target: string; [k: string]: unknown }>;
  viewport?: { x: number; y: number; zoom: number };
}

/* ── Custom node components ── */
function StartNode() {
  return (
    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-500/20 border-2 border-green-500/60 text-green-400 text-xs font-mono font-semibold">
      Start
    </div>
  );
}

function EndNode() {
  return (
    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-danger/20 border-2 border-danger/60 text-danger text-xs font-mono font-semibold">
      End
    </div>
  );
}

function AgentNode({ data }: { data: Record<string, unknown> }) {
  const isActive = Boolean(data.isActive);
  return (
    <div
      className={cn(
        'min-w-[140px] rounded-lg border bg-elevated px-4 py-3 shadow-sm',
        isActive
          ? 'border-accent/70 ring-2 ring-accent/40 ring-offset-1 ring-offset-bg'
          : 'border-border',
      )}
    >
      <p className="text-[10px] font-mono uppercase tracking-wider text-fg-subtle mb-0.5">Agent</p>
      <p className="text-sm font-medium text-fg leading-tight">
        {(data.agent_name as string) ?? 'Unknown'}
      </p>
    </div>
  );
}

function ConditionNode({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="min-w-[120px] rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-amber-400/70 mb-0.5">
        Condition
      </p>
      <p className="text-xs text-amber-300 font-mono leading-tight truncate max-w-[160px]">
        {(data.expr as string) ?? '—'}
      </p>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  start: StartNode,
  agent: AgentNode,
  condition: ConditionNode,
  end: EndNode,
};

/* ── Props ── */
interface WorkflowCanvasProps {
  graph: Record<string, unknown> | undefined;
  agents?: Agent[];
  activeAgentId?: string | null;
  editable?: boolean;
  /** Called with updated graph document after a drag-stop (editable=true only) */
  onGraphChange?: (graph: GraphDocument) => void;
  className?: string;
}

export function WorkflowCanvas({
  graph,
  agents = [],
  activeAgentId,
  editable = false,
  onGraphChange,
  className,
}: WorkflowCanvasProps) {
  const agentsById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const buildNodes = useCallback(
    (doc: GraphDocument): Node[] =>
      (doc.nodes ?? []).map((n) => {
        const data = n.data ?? {};
        return {
          id: n.id,
          type: n.type,
          position: n.position ?? { x: 0, y: 0 },
          data: {
            ...data,
            agent_name: data.agent_id
              ? (agentsById.get(data.agent_id as string)?.name ?? data.agent_id)
              : undefined,
            isActive:
              n.type === 'agent' && activeAgentId != null && data.agent_id === activeAgentId,
          },
          draggable: editable,
          selectable: editable,
          connectable: false,
        };
      }),
    [agentsById, activeAgentId, editable],
  );

  const buildEdges = useCallback(
    (doc: GraphDocument): Edge[] =>
      (doc.edges ?? []).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        style: { stroke: 'rgb(var(--border))', strokeWidth: 1.5 },
        animated: false,
      })),
    [],
  );

  const initDoc = graph as unknown as GraphDocument | undefined;
  const [nodes, setNodes, onNodesChange] = useNodesState(initDoc ? buildNodes(initDoc) : []);
  const [edges] = useEdgesState(initDoc ? buildEdges(initDoc) : []);

  // Reset when server graph changes (tracked by JSON key to avoid object identity churn)
  const prevGraphKey = useRef(JSON.stringify(graph));
  useEffect(() => {
    const key = JSON.stringify(graph);
    if (key !== prevGraphKey.current && graph) {
      prevGraphKey.current = key;
      setNodes(buildNodes(graph as unknown as GraphDocument));
    }
  }, [graph, buildNodes, setNodes]);

  // Update isActive on each node without resetting positions
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: {
          ...(n.data ?? {}),
          isActive:
            n.type === 'agent' &&
            activeAgentId != null &&
            (n.data?.['agent_id'] as string | undefined) === activeAgentId,
        },
      })),
    );
  }, [activeAgentId, setNodes]);

  // Notify parent after drag completes (not on every intermediate drag event).
  // Strip synthesized fields (agent_name, isActive) so they aren't persisted to the DB.
  const handleNodeDragStop = useCallback(
    (_: React.MouseEvent, _node: Node, allNodes: Node[]) => {
      if (onGraphChange && graph) {
        const doc = graph as unknown as GraphDocument;
        onGraphChange({
          ...doc,
          nodes: allNodes.map((n) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { agent_name, isActive, ...originalData } = (n.data ?? {}) as Record<string, unknown>;
            return {
              id: n.id,
              type: (n.type ?? 'agent') as GraphNode['type'],
              position: n.position,
              data: originalData,
            };
          }),
        });
      }
    },
    [onGraphChange, graph],
  );

  if (!graph || nodes.length === 0) {
    return (
      <div className={cn('flex items-center justify-center text-fg-subtle text-sm', className)}>
        No graph data
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border border-border overflow-hidden bg-bg', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={editable ? onNodesChange : undefined}
        onNodeDragStop={editable ? handleNodeDragStop : undefined}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={editable}
        nodesConnectable={false}
        elementsSelectable={editable}
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
    </div>
  );
}
