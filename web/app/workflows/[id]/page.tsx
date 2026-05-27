'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertTriangle, ArrowLeft, Clock, Save } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkflowCanvas } from '@/components/workflow-canvas';
import { RunStatusBadge } from '@/components/run-status-badge';
import { workflowsApi, runsApi, agentsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';
import type { GraphDocument } from '@/components/workflow-canvas';

import { TriggerRunDialog } from './trigger-run-dialog';

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [pendingGraph, setPendingGraph] = useState<GraphDocument | null>(null);

  const { data: workflow, isLoading, error } = useQuery({
    queryKey: ['workflow', id],
    queryFn: () => workflowsApi.get(id),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
  });

  const { data: runs = [] } = useQuery({
    queryKey: ['runs', id],
    queryFn: () => runsApi.list({ workflow_id: id, limit: 10 }),
    refetchInterval: 5000,
  });

  const { mutate: saveLayout, isPending: isSaving } = useMutation({
    mutationFn: (graph: GraphDocument) =>
      workflowsApi.update(id, { graph: graph as Record<string, unknown> }),
    onSuccess: () => {
      toast.success('Layout saved');
      setPendingGraph(null);
      queryClient.invalidateQueries({ queryKey: ['workflow', id] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiException ? err.detail : 'Save failed');
    },
  });

  const handleGraphChange = useCallback(
    (updated: GraphDocument) => setPendingGraph(updated),
    [],
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-fg-muted text-sm py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading workflow…
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/5 p-5 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
        <div>
          <h3 className="text-fg font-medium">Couldn't load workflow</h3>
          <p className="mt-1 text-sm text-fg-muted">
            {error instanceof ApiException ? error.detail : 'Check the backend connection.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={workflow.name}
        subtitle={workflow.description || 'No description.'}
        actions={<TriggerRunDialog workflowId={id} workflowName={workflow.name} />}
      />

      <div className="flex items-center gap-2 mb-6 -mt-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/workflows">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Workflows
          </Link>
        </Button>
        {workflow.is_template && (
          <Badge variant="outline" className="border-accent/30 text-accent bg-accent/10 text-xs">
            Template
          </Badge>
        )}
      </div>

      {/* Canvas */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">Graph</h2>
          {pendingGraph && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              disabled={isSaving}
              onClick={() => saveLayout(pendingGraph)}
            >
              {isSaving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Save Layout
            </Button>
          )}
        </div>
        <WorkflowCanvas
          graph={workflow.graph}
          agents={agents}
          editable
          onGraphChange={handleGraphChange}
          className="h-[380px]"
        />
        <p className="mt-1.5 text-xs text-fg-subtle">
          Drag nodes to reposition. Click <strong>Save Layout</strong> to persist.
        </p>
      </section>

      {/* Recent runs */}
      <section>
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle mb-3">
          Recent Runs
        </h2>
        {runs.length === 0 ? (
          <p className="text-sm text-fg-muted">No runs yet. Trigger one above.</p>
        ) : (
          <div className="rounded-lg border border-border bg-surface/40 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg/30">
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                    Trigger
                  </th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                    Cost
                  </th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                    Started
                  </th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-border last:border-0 hover:bg-elevated/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <RunStatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3 text-fg-muted font-mono text-xs">{run.trigger}</td>
                    <td className="px-4 py-3 font-mono text-xs text-fg-muted">
                      ${run.total_cost_usd.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-fg-subtle text-xs">
                      {run.started_at ? new Date(run.started_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/runs/${run.id}`}>
                          <Clock className="h-3.5 w-3.5 mr-1" />
                          View
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
