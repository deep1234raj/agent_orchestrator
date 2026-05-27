'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bot, Loader2, AlertTriangle, ArrowUpRight } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { agentsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';

import { CreateAgentDialog } from './create-agent-dialog';
import { DeleteAgentButton } from './delete-agent-button';

/*
 * Agents list.
 *
 * Tabular layout — one row per agent — because the data is
 * homogeneous and reviewers will scan it. The "name" column is a
 * link to the edit page; everything else is contextual metadata
 * (model, tool count, memory mode) and an actions column.
 */

export default function AgentsPage() {
  const { data: agents, isLoading, error } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
  });

  return (
    <>
      <PageHeader
        title="Agents"
        subtitle="Each agent is a row in the database — a persona, a model, a set of tools, and the rules it follows. Compose them into workflows under the Workflows tab."
        actions={<CreateAgentDialog />}
      />

      {isLoading && (
        <div className="flex items-center gap-2 text-fg-muted text-sm py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading agents…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div>
            <h3 className="text-fg font-medium">Couldn't load agents</h3>
            <p className="mt-1 text-sm text-fg-muted">
              {error instanceof ApiException
                ? error.detail
                : 'The API didn\'t respond. Is the backend running at the configured URL?'}
            </p>
          </div>
        </div>
      )}

      {agents && agents.length === 0 && (
        <EmptyState
          icon={<Bot strokeWidth={1.5} />}
          title="No agents yet"
          description="Create your first agent to start building workflows. Two pre-built agents arrive automatically when you boot the system — they may already be here."
          action={<CreateAgentDialog />}
        />
      )}

      {agents && agents.length > 0 && (
        <div className="rounded-lg border border-border bg-surface/40 overflow-hidden animate-fade-in">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/30">
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Name
                </th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Role
                </th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Model
                </th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Tools
                </th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Memory
                </th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr
                  key={agent.id}
                  className="border-b border-border last:border-0 hover:bg-elevated/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/agents/${agent.id}`}
                      className="group inline-flex items-center gap-1.5 font-medium text-fg hover:text-accent transition-colors"
                    >
                      {agent.name}
                      <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{agent.role}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-fg-muted">
                      {agent.model}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(agent.tools ?? []).length === 0 ? (
                      <span className="text-fg-subtle text-xs">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(agent.tools ?? []).slice(0, 3).map((t) => (
                          <Badge key={t} variant="outline">
                            {t}
                          </Badge>
                        ))}
                        {(agent.tools ?? []).length > 3 && (
                          <Badge variant="outline">
                            +{(agent.tools ?? []).length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="default">{agent.memory_mode}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/agents/${agent.id}`}>Edit</Link>
                      </Button>
                      <DeleteAgentButton agent={agent} />
                    </div>
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