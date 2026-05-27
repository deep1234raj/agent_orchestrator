'use client';

import { useQuery } from '@tanstack/react-query';
import { Cable, Loader2, AlertTriangle } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { channelsApi, workflowsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';

import { CreateChannelDialog } from './create-channel-dialog';
import { EditChannelDialog } from './edit-channel-dialog';
import { DeleteChannelButton } from './delete-channel-button';

export default function ChannelsPage() {
  const {
    data: channels,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['channels'],
    queryFn: channelsApi.list,
  });
  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: workflowsApi.list,
    staleTime: 30_000,
  });

  const workflowsById = new Map(workflows?.map((w) => [w.id, w]) ?? []);

  return (
    <>
      <PageHeader
        title="Channels"
        subtitle="Bind messaging services to workflows. Telegram messages trigger the linked workflow automatically."
        actions={<CreateChannelDialog workflows={workflows ?? []} />}
      />

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading channels…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div>
            <h3 className="font-medium text-fg">Couldn't load channels</h3>
            <p className="mt-1 text-sm text-fg-muted">
              {error instanceof ApiException
                ? error.detail
                : "The API didn't respond. Is the backend running?"}
            </p>
          </div>
        </div>
      )}

      {channels && channels.length === 0 && (
        <EmptyState
          icon={<Cable strokeWidth={1.5} />}
          title="No channels yet"
          description="Create a channel to connect a Telegram bot to a workflow. Use * as External ID to accept messages from any chat."
          action={<CreateChannelDialog workflows={workflows ?? []} />}
        />
      )}

      {channels && channels.length > 0 && (
        <div className="animate-fade-in overflow-hidden rounded-lg border border-border bg-surface/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/30">
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Kind
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  External ID
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Workflow
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Status
                </th>
                <th className="w-28 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr
                  key={channel.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-elevated/30"
                >
                  <td className="px-4 py-3">
                    <Badge variant="info">{channel.kind}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-muted">
                    {channel.external_id}
                    {channel.external_id === '*' && (
                      <span className="ml-1.5 text-[10px] text-fg-subtle">
                        (any chat)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {workflowsById.get(channel.workflow_id)?.name ??
                      channel.workflow_id}
                  </td>
                  <td className="px-4 py-3">
                    {channel.enabled ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-success">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        enabled
                      </span>
                    ) : (
                      <span className="text-xs text-fg-subtle">○ disabled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <EditChannelDialog channel={channel} />
                      <DeleteChannelButton channel={channel} />
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
