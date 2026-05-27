'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Activity, Loader2, AlertTriangle, ArrowUpRight } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { RunStatusBadge } from '@/components/run-status-badge';
import { runsApi, workflowsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const secs = Math.round((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export default function RunsPage() {
  const { data: runs, isLoading, error } = useQuery({
    queryKey: ['runs'],
    queryFn: () => runsApi.list({ limit: 50 }),
    refetchInterval: 5000,
  });

  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows'],
    queryFn: workflowsApi.list,
  });

  const workflowsById = new Map(workflows.map((w) => [w.id, w]));

  return (
    <>
      <PageHeader
        title="Runs"
        subtitle="Every workflow execution is a run. Click one to watch agent messages and tool calls in real time."
      />

      {isLoading && (
        <div className="flex items-center gap-2 text-fg-muted text-sm py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading runs…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div>
            <h3 className="text-fg font-medium">Couldn't load runs</h3>
            <p className="mt-1 text-sm text-fg-muted">
              {error instanceof ApiException ? error.detail : 'Is the backend running?'}
            </p>
          </div>
        </div>
      )}

      {runs && runs.length === 0 && (
        <EmptyState
          icon={<Activity strokeWidth={1.5} />}
          title="No runs yet"
          description="Trigger a workflow from the Workflows tab, or send a message to the Telegram bot."
        />
      )}

      {runs && runs.length > 0 && (
        <div className="rounded-lg border border-border bg-surface/40 overflow-hidden animate-fade-in">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/30">
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Workflow
                </th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Trigger
                </th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Duration
                </th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Cost
                </th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Tokens
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
                  <td className="px-4 py-3">
                    <Link
                      href={`/workflows/${run.workflow_id}`}
                      className="text-fg-muted hover:text-accent transition-colors text-xs"
                    >
                      {workflowsById.get(run.workflow_id)?.name ?? run.workflow_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-muted">{run.trigger}</td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-muted">
                    {formatDuration(run.started_at, run.finished_at)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-muted">
                    ${run.total_cost_usd.toFixed(4)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-muted">
                    {run.total_tokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/runs/${run.id}`}>
                        <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
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
    </>
  );
}
