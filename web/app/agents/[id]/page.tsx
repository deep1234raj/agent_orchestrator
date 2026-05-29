'use client';

import Link from 'next/link';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { agentsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';

import { AgentForm, valuesToApiPayload } from '../agent-form';
import type { AgentFormValues } from '../agent-schema';
import { DeleteAgentButton } from '../delete-agent-button';
import { RegisterWebhookButton } from '../register-webhook-button';
import { ScheduleSection } from '@/components/schedule-section';

export default function EditAgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();

  const {
    data: agent,
    isLoading,
    error,
  } = useQuery({
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
        className="mb-4 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-fg-subtle transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-3 w-3" />
        Agents
      </Link>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading agent…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div>
            <h3 className="font-medium text-fg">
              Couldn&apos;t load this agent
            </h3>
            <p className="mt-1 text-sm text-fg-muted">
              {error instanceof ApiException
                ? error.detail
                : "The API didn't respond."}
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
                <DeleteAgentButton
                  agent={agent}
                  onDeleted={() => router.push('/agents')}
                />
              </>
            }
          />

          <AgentForm
            defaultValues={agent}
            onSubmit={(v) => update.mutateAsync(v)}
            submitLabel="Save Changes"
            submitting={update.isPending}
          />

          <div className="mt-10 border-t border-border pt-6">
            <div className="flex items-center gap-6 font-mono text-xs text-fg-subtle">
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

          <ScheduleSection agentId={id} />

          {/* WEBHOOK URL */}
          {agent.channel_kind && (
            <div className="mt-8 space-y-1 rounded-md border border-accent/30 bg-accent/5 p-4">
              <p className="text-xs font-medium text-fg">Webhook URL</p>
              <p className="break-all font-mono text-xs text-fg-muted">
                {'<YOUR_BASE_URL>'}/webhooks/{agent.channel_kind}/{agent.id}
              </p>
              <p className="text-xs text-fg-subtle">
                Register this URL with your {agent.channel_kind} bot. All
                workflows containing this agent will be triggered on each
                incoming message.
              </p>
              {agent.channel_kind === 'telegram' && (
                <div className="pt-2">
                  <RegisterWebhookButton agent={agent} />
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex justify-start">
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
