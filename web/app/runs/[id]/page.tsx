'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertTriangle, ArrowLeft, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { WorkflowCanvas } from '@/components/workflow-canvas';
import { RunStatusBadge } from '@/components/run-status-badge';
import { runsApi, workflowsApi, agentsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';
import type { RunStatus } from '@/lib/api/resources';

import { useRunEvents } from './use-run-events';
import { EventFeed } from './event-feed';
import { CostCounter } from './cost-counter';

function formatDuration(startedAt: string | null, finishedAt: string | null) {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const secs = Math.round((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();

  const {
    data: run,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['run', id],
    queryFn: () => runsApi.get(id),
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string } | undefined)
        ?.status;
      return status && TERMINAL.has(status) ? false : 3000;
    },
  });

  const { data: workflow } = useQuery({
    queryKey: ['workflow', run?.workflow_id],
    queryFn: () => workflowsApi.get(run!.workflow_id),
    enabled: !!run,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
  });

  const {
    liveEvents,
    activeAgentId,
    liveCostDelta,
    liveTokensDelta,
    liveStatus,
    isConnected,
  } = useRunEvents(id, run?.status ?? 'pending');

  const queryClient = useQueryClient();

  const { mutate: cancelRun, isPending: isCancelling } = useMutation({
    mutationFn: () => runsApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['run', id] });
      toast.success('Run cancelled');
    },
    onError: (err) => {
      toast.error(err instanceof ApiException ? err.detail : 'Cancel failed');
    },
  });

  const agentsById = new Map(agents.map((a) => [a.id, a.name]));
  const currentStatus = (liveStatus ?? run?.status ?? 'pending') as RunStatus;

  const canCancel = currentStatus === 'running' || currentStatus === 'pending';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-fg-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading run…
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <div>
          <h3 className="font-medium text-fg">Couldn't load run</h3>
          <p className="mt-1 text-sm text-fg-muted">
            {error instanceof ApiException
              ? error.detail
              : 'Check the backend connection.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            Run
            <RunStatusBadge status={currentStatus} />
            {isConnected && (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-green-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                Live
              </span>
            )}
          </span>
        }
        subtitle={`Triggered by ${run.trigger} · ${formatDuration(run.started_at, run.finished_at) ?? 'not started'}`}
        actions={
          canCancel ? (
            <Button
              variant="danger"
              size="sm"
              className="gap-1.5"
              onClick={() => cancelRun()}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              Cancel Run
            </Button>
          ) : undefined
        }
      />

      <div className="-mt-2 mb-4 flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/runs">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            All Runs
          </Link>
        </Button>
        {workflow && (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/workflows/${workflow.id}`}>{workflow.name}</Link>
          </Button>
        )}
      </div>

      {/* Main layout: 2/3 feed + 1/3 sidebar */}
      <div className="grid h-[520px] grid-cols-3 gap-4">
        {/* Event feed */}
        <div className="col-span-2 flex flex-col overflow-hidden rounded-lg border border-border bg-surface/40 p-4">
          <h2 className="mb-3 shrink-0 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
            Events
          </h2>
          <div className="flex-1 overflow-hidden">
            <EventFeed
              messages={run.messages ?? []}
              toolCalls={run.tool_calls ?? []}
              liveEvents={liveEvents}
              agentsById={agentsById}
            />
          </div>
        </div>

        {/* Right sidebar: cost + graph */}
        <div className="col-span-1 flex flex-col gap-4 overflow-hidden">
          <CostCounter
            totalCostUsd={run.total_cost_usd}
            totalTokens={run.total_tokens}
            liveCostDelta={liveCostDelta}
            liveTokensDelta={liveTokensDelta}
          />

          {workflow?.graph && (
            <div className="min-h-0 flex-1">
              <WorkflowCanvas
                graph={workflow.graph}
                agents={agents}
                activeAgentId={activeAgentId}
                className="h-full"
              />
            </div>
          )}
        </div>
      </div>

      {/* Error output if failed */}
      {run.error && (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-4">
          <h3 className="mb-1 text-sm font-medium text-danger">Run failed</h3>
          <p className="font-mono text-xs text-fg-muted">{run.error}</p>
        </div>
      )}

      {/* Final output */}
      {run.output && (
        <div className="mt-4 rounded-lg border border-border bg-surface/40 p-4">
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
            Output
          </h3>
          <pre className="whitespace-pre-wrap break-words font-mono text-sm text-fg-muted">
            {JSON.stringify(run.output, null, 2)}
          </pre>
        </div>
      )}
    </>
  );
}
