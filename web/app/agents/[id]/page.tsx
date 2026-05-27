'use client';

import Link from 'next/link';
import { use } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { agentsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';

import { AgentForm, valuesToApiPayload } from '../agent-form';
import type { AgentFormValues } from '../agent-schema';
import { DeleteAgentButton } from '../delete-agent-button';

/*
 * Edit an existing agent.
 *
 * In Next 15, page params come as a Promise — we unwrap with React.use().
 * The same AgentForm component handles both create and edit; we pass
 * defaultValues from the fetched agent and an onSubmit that PATCHes.
 */

export default function EditAgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();

  const { data: agent, isLoading, error } = useQuery({
    queryKey: ['agents', id],
    queryFn: () => agentsApi.get(id),
  });

  const update = useMutation({
    mutationFn: (values: AgentFormValues) =>
      agentsApi.update(id, valuesToApiPayload(values)),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.setQueryData(['agents', id], updated);
      toast.success('Agent updated', { description: updated.name });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiException ? err.detail : 'Failed to update agent.';
      toast.error('Could not update', { description: msg });
    },
  });

  return (
    <>
      <Link
        href="/agents"
        className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-fg-subtle hover:text-fg transition-colors mb-4"
      >
        <ArrowLeft className="h-3 w-3" />
        Agents
      </Link>

      {isLoading && (
        <div className="flex items-center gap-2 text-fg-muted text-sm py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading agent…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div>
            <h3 className="text-fg font-medium">Couldn't load this agent</h3>
            <p className="mt-1 text-sm text-fg-muted">
              {error instanceof ApiException
                ? error.detail
                : 'The API didn\'t respond.'}
            </p>
          </div>
        </div>
      )}

      {agent && (
        <>
          <PageHeader
            title={agent.name}
            subtitle={`Role: ${agent.role}`}
            actions={
              <>
                <Badge variant="outline" className="hidden sm:inline-flex">
                  <span className="font-mono">{agent.id.slice(0, 8)}</span>
                </Badge>
                <DeleteAgentButton agent={agent} />
              </>
            }
          />

          <AgentForm
            defaultValues={agent}
            onSubmit={(v) => update.mutateAsync(v)}
            submitLabel="Save Changes"
            submitting={update.isPending}
          />

          <div className="mt-10 pt-6 border-t border-border">
            <div className="flex items-center gap-6 text-xs font-mono text-fg-subtle">
              <span>
                ID: <span className="text-fg-muted">{agent.id}</span>
              </span>
              <span>
                Created:{' '}
                <span className="text-fg-muted">
                  {new Date(agent.created_at).toLocaleString()}
                </span>
              </span>
              <span>
                Updated:{' '}
                <span className="text-fg-muted">
                  {new Date(agent.updated_at).toLocaleString()}
                </span>
              </span>
            </div>
          </div>

          <div className="flex justify-start mt-6">
            <Button asChild variant="ghost" size="sm">
              <Link href="/agents">
                <ArrowLeft className="h-3 w-3" />
                Back to agents
              </Link>
            </Button>
          </div>
        </>
      )}
    </>
  );
}