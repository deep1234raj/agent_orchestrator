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
  const { data: workflows, isLoading, error } = useQuery({
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
        <div className="flex items-center gap-2 text-fg-muted text-sm py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading workflows…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div>
            <h3 className="text-fg font-medium">Couldn't load workflows</h3>
            <p className="mt-1 text-sm text-fg-muted">
              {error instanceof ApiException ? error.detail : 'Is the backend running?'}
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
        <div className="rounded-lg border border-border bg-surface/40 overflow-hidden animate-fade-in">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/30">
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Name
                </th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Description
                </th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Type
                </th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {workflows.map((wf) => (
                <tr
                  key={wf.id}
                  className="border-b border-border last:border-0 hover:bg-elevated/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/workflows/${wf.id}`}
                      className="group inline-flex items-center gap-1.5 font-medium text-fg hover:text-accent transition-colors"
                    >
                      {wf.name}
                      <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-fg-muted max-w-xs truncate">
                    {wf.description || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {wf.is_template ? (
                      <Badge
                        variant="outline"
                        className="border-accent/30 text-accent bg-accent/10 text-xs"
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
