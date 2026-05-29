"use client";

import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Agent } from "@/lib/api/resources";
import type { GraphNode } from "@/lib/workflow-validation";

interface NodePropertiesPanelProps {
  node: GraphNode;
  agents: Agent[];
  onUpdate: (nodeId: string, patch: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
}

const EXPR_SOURCES = ["last_message", "iterations"] as const;
const EXPR_OPS = ["contains", "==", "!=", ">", "<", ">=", "<="] as const;
type ExprSource = (typeof EXPR_SOURCES)[number];
type ExprOp = (typeof EXPR_OPS)[number];

function buildExpr(source: string, op: string, value: string): string {
  return `${source} ${op} "${value}"`;
}

const EXPR_RE =
  /^\s*(?<src>last_message|iterations)\s+(?<op>contains|==|!=|>=|<=|>|<)\s+(?:"(?<strval>[^"]*)"|'(?<strval2>[^']*)'|(?<numval>-?\d+))\s*$/;

function parseExpr(
  expr: string,
): { source: ExprSource; op: ExprOp; value: string } | null {
  const m = EXPR_RE.exec(expr);
  if (!m?.groups) return null;
  return {
    source: m.groups.src as ExprSource,
    op: m.groups.op as ExprOp,
    value: m.groups.strval ?? m.groups.strval2 ?? m.groups.numval ?? "",
  };
}

function AgentPanel({
  node,
  agents,
  onUpdate,
  onDelete,
}: NodePropertiesPanelProps) {
  const agentId = node.data?.agent_id as string | undefined;
  const agent = agents.find((a) => a.id === agentId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label className="text-xs text-fg-subtle mb-1.5 block">Agent</Label>
        <Select
          value={agentId ?? ""}
          onValueChange={(val) => onUpdate(node.id, { agent_id: val })}
        >
          <SelectTrigger className="text-sm h-8">
            <SelectValue placeholder="Select an agent…" />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {agent && (
        <div className="rounded-md bg-bg/60 border border-border px-3 py-2 text-xs text-fg-muted space-y-0.5">
          <div>Model: {agent.model}</div>
          <div>Provider: {agent.provider}</div>
        </div>
      )}

      <p className="text-xs text-fg-subtle">
        Agent settings are configured on the Agent page.
      </p>

      <Button
        variant="ghost"
        size="sm"
        className="text-danger hover:text-danger hover:bg-danger/10 justify-start gap-2 mt-auto"
        onClick={() => onDelete(node.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete node
      </Button>
    </div>
  );
}

function ConditionPanel({
  node,
  nodes,
  onUpdate,
  onDelete,
}: {
  node: GraphNode;
  nodes: GraphNode[];
  onUpdate: (nodeId: string, patch: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
}) {
  const mode = (node.data?.mode as string | undefined) ?? "expr";
  const rawExpr = (node.data?.expr as string | undefined) ?? "";

  const parsed = parseExpr(rawExpr);
  const [exprSource, setExprSource] = useState<string>(
    parsed?.source ?? "last_message",
  );
  const [exprOp, setExprOp] = useState<string>(parsed?.op ?? "contains");
  const [exprValue, setExprValue] = useState<string>(parsed?.value ?? "");
  const [showRaw, setShowRaw] = useState(!parsed && rawExpr.length > 0);
  const [rawInput, setRawInput] = useState(rawExpr);

  useEffect(() => {
    if (!showRaw) {
      const built = buildExpr(exprSource, exprOp, exprValue);
      onUpdate(node.id, { expr: built });
    }
    // onUpdate is stable (defined with useCallback in WorkflowEditor).
    // node.id is intentionally excluded — we only want this effect to fire
    // when the user edits the expression fields, not on node selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exprSource, exprOp, exprValue, showRaw]);

  const nonConditionNodes = nodes.filter(
    (n) => n.id !== node.id && n.type !== "condition",
  );

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={mode} onValueChange={(v) => onUpdate(node.id, { mode: v })}>
        <TabsList className="h-7 text-xs">
          <TabsTrigger value="expr" className="text-xs px-3 h-6">
            Expression
          </TabsTrigger>
          <TabsTrigger value="hint" className="text-xs px-3 h-6">
            LLM Hint
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expr" className="mt-3 space-y-3">
          {!showRaw ? (
            <>
              <div>
                <Label className="text-xs text-fg-subtle mb-1.5 block">
                  When
                </Label>
                <Select value={exprSource} onValueChange={setExprSource}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPR_SOURCES.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Select value={exprOp} onValueChange={setExprOp}>
                  <SelectTrigger className="text-xs h-8 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPR_OPS.map((op) => (
                      <SelectItem key={op} value={op} className="text-xs">
                        {op}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="text-xs h-8 flex-1"
                  value={exprValue}
                  onChange={(e) => setExprValue(e.target.value)}
                  placeholder="value"
                />
              </div>
              <button
                className="text-xs text-accent underline-offset-2 hover:underline"
                onClick={() => {
                  setRawInput(buildExpr(exprSource, exprOp, exprValue));
                  setShowRaw(true);
                }}
              >
                ↗ Edit raw expression
              </button>
            </>
          ) : (
            <>
              <div>
                <Label className="text-xs text-fg-subtle mb-1.5 block">
                  Raw expression
                </Label>
                <Input
                  className="text-xs h-8 font-mono"
                  value={rawInput}
                  onChange={(e) => {
                    setRawInput(e.target.value);
                    onUpdate(node.id, { expr: e.target.value });
                  }}
                />
                <p className="mt-1 text-[10px] text-fg-subtle">
                  Supported: last_message · iterations · contains · == · != ·
                  &gt; · &lt;
                </p>
              </div>
              <button
                className="text-xs text-accent underline-offset-2 hover:underline"
                onClick={() => {
                  const p = parseExpr(rawInput);
                  if (p) {
                    setExprSource(p.source);
                    setExprOp(p.op);
                    setExprValue(p.value);
                    setShowRaw(false);
                  }
                }}
              >
                ← Back to builder
              </button>
            </>
          )}

          <div className="pt-1 space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              True → connect via handle
            </div>
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
              False → connect via handle
            </div>
          </div>
        </TabsContent>

        <TabsContent value="hint" className="mt-3 space-y-3">
          <p className="text-xs text-fg-muted">
            In LLM Hint mode the agent sets{" "}
            <code className="text-accent">next_hint</code> in its output and the
            condition routes based on the value.
          </p>
          <div>
            <Label className="text-xs text-fg-subtle mb-1.5 block">
              Default route
            </Label>
            <Select
              value={(node.data?.default as string | undefined) ?? ""}
              onValueChange={(v) => onUpdate(node.id, { default: v })}
            >
              <SelectTrigger className="text-xs h-8">
                <SelectValue placeholder="Pick a node…" />
              </SelectTrigger>
              <SelectContent>
                {nonConditionNodes.map((n) => (
                  <SelectItem key={n.id} value={n.id} className="text-xs">
                    {n.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-fg-subtle">
            Wire specific hint values to target nodes using edges from the
            True/False handles, or add routes in JSON.
          </p>
        </TabsContent>
      </Tabs>

      <Button
        variant="ghost"
        size="sm"
        className="text-danger hover:text-danger hover:bg-danger/10 justify-start gap-2 mt-2"
        onClick={() => onDelete(node.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete node
      </Button>
    </div>
  );
}

export function NodePropertiesPanel({
  node,
  nodes,
  agents,
  onUpdate,
  onDelete,
}: NodePropertiesPanelProps & { nodes: GraphNode[] }) {
  const typeLabel: Record<GraphNode["type"], string> = {
    start: "Start",
    agent: "Agent",
    condition: "Condition",
    end: "End",
  };

  return (
    <div className="w-[280px] flex-shrink-0 border-l border-border bg-surface/40 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-border">
        <p className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
          {typeLabel[node.type]} node
        </p>
        <p className="text-xs text-fg-muted mt-0.5 truncate">{node.id}</p>
      </div>

      <div className="px-4 py-4 flex-1 flex flex-col">
        {node.type === "agent" && (
          <AgentPanel
            node={node}
            agents={agents}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        )}
        {node.type === "condition" && (
          <ConditionPanel
            key={node.id}
            node={node}
            nodes={nodes}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        )}
        {(node.type === "start" || node.type === "end") && (
          <p className="text-xs text-fg-muted">No configurable properties.</p>
        )}
        {node.type === "end" && (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger hover:text-danger hover:bg-danger/10 justify-start gap-2 mt-4"
            onClick={() => onDelete(node.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete node
          </Button>
        )}
      </div>
    </div>
  );
}
