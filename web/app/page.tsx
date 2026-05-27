'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { TelegramSetupDialog } from '@/components/telegram-setup-dialog';
import { Loader2, AlertTriangle } from 'lucide-react';
import {
  agentsApi,
  workflowsApi,
  runsApi,
  channelsApi,
  type Run,
} from '@/lib/api/resources';

function StatChip({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface/40 p-4 text-center">
      <div className="font-display text-3xl text-fg">{value}</div>
      <div className="mt-1 text-sm text-fg-muted">{label}</div>
    </div>
  );
}

function elapsed(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export default function Home() {
  const {
    data: activeRuns,
    isLoading: runsLoading,
    isError: runsError,
  } = useQuery({
    queryKey: ['runs', 'running'],
    queryFn: () => runsApi.list({ status: 'running', limit: 20 }),
    refetchInterval: 5000,
  });

  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: workflowsApi.list,
    staleTime: 30_000,
  });

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
    staleTime: 30_000,
  });

  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: channelsApi.list,
    staleTime: 30_000,
  });

  const { data: allRuns } = useQuery({
    queryKey: ['runs', 'all'],
    queryFn: () => runsApi.list({ limit: 200 }),
    staleTime: 60_000,
  });

  const workflowsById = useMemo(
    () => Object.fromEntries((workflows ?? []).map((w) => [w.id, w])),
    [workflows],
  );

  const { totalRuns, totalCost, successRate } = useMemo(() => {
    const total = allRuns?.length ?? 0;
    const succeeded =
      allRuns?.filter((r) => r.status === 'succeeded').length ?? 0;
    const cost =
      allRuns?.reduce((sum, r) => sum + (r.total_cost_usd ?? 0), 0) ?? 0;
    return {
      totalRuns: total,
      totalCost: cost,
      successRate: total > 0 ? Math.round((succeeded / total) * 100) : 0,
    };
  }, [allRuns]);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live status and quick actions." />

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-fg-muted">
          Active Runs
        </h2>
        {runsLoading && (
          <div className="flex items-center gap-2 text-fg-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        )}
        {runsError && (
          <div className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">Failed to load runs.</span>
          </div>
        )}
        {!runsLoading && !runsError && (activeRuns?.length ?? 0) === 0 && (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-10 text-sm text-fg-muted">
            No active runs
          </div>
        )}
        {!runsLoading && !runsError && activeRuns && activeRuns.length > 0 && (
          <div className="space-y-2">
            {activeRuns.map((run: Run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface/40 px-4 py-3 text-sm transition-colors hover:bg-surface"
              >
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
                <span className="flex-1 font-medium text-fg">
                  {workflowsById[run.workflow_id]?.name ?? run.workflow_id}
                </span>
                <span className="text-fg-muted">{run.trigger}</span>
                <span className="font-mono text-xs text-fg-subtle">
                  {elapsed(run.created_at)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-fg-muted">
            System Health
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <StatChip value={agents?.length ?? '—'} label="Agents" />
            <StatChip value={workflows?.length ?? '—'} label="Workflows" />
            <StatChip value={channels?.length ?? '—'} label="Channels" />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-fg-muted">
            All-Time Stats
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <StatChip value={totalRuns} label="Total Runs" />
            <StatChip value={`$${totalCost.toFixed(2)}`} label="Total Cost" />
            <StatChip value={`${successRate}%`} label="Success Rate" />
          </div>
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-fg-muted">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="primary">
            <Link href="/agents">+ New Agent</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/workflows">Open Workflows</Link>
          </Button>
          <TelegramSetupDialog
            trigger={<Button variant="ghost">Setup Telegram</Button>}
          />
        </div>
      </section>
    </>
  );
}
