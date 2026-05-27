'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Workflow, Loader2, AlertTriangle, ArrowUpRight } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { workflowsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';

export default function WorkflowsPage() {
  const {
    data: workflows,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['workflows'],
    queryFn: workflowsApi.list,
  });

  return (
    <>
      <PageHeader
        title="Workflows"
        subtitle="Workflows wire agents into graphs. The seeded templates run the demo — select one to inspect its graph or trigger a run."
      />

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading workflows…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div>
            <h3 className="font-medium text-fg">Couldn't load workflows</h3>
            <p className="mt-1 text-sm text-fg-muted">
              {error instanceof ApiException
                ? error.detail
                : 'Is the backend running?'}
            </p>
          </div>
        </div>
      )}

      {workflows && workflows.length === 0 && (
        <EmptyState
          icon={<Workflow strokeWidth={1.5} />}
          title="No workflows yet"
          description="Workflows are seeded on first boot. Start the backend and they'll appear here."
        />
      )}

      {workflows && workflows.length > 0 && (
        <div className="animate-fade-in overflow-hidden rounded-lg border border-border bg-surface/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/30">
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Description
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Type
                </th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {workflows.map((wf) => (
                <tr
                  key={wf.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-elevated/30"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/workflows/${wf.id}`}
                      className="group inline-flex items-center gap-1.5 font-medium text-fg transition-colors hover:text-accent"
                    >
                      {wf.name}
                      <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-fg-muted">
                    {wf.description || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {wf.is_template ? (
                      <Badge
                        variant="outline"
                        className="border-accent/30 bg-accent/10 text-xs text-accent"
                      >
                        Template
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Custom
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/workflows/${wf.id}`}>Open</Link>
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
