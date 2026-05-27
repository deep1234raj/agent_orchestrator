'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Cable, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { channelsApi, workflowsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';

import { CreateChannelDialog } from './create-channel-dialog';
import { EditChannelDialog } from './edit-channel-dialog';

export default function ChannelsPage() {
  const qc = useQueryClient();
  const { data: channels, isLoading, error } = useQuery({
    queryKey: ['channels'],
    queryFn: channelsApi.list,
  });
  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: workflowsApi.list,
    staleTime: 30_000,
  });

  const workflowsById = new Map(workflows?.map((w) => [w.id, w]) ?? []);

  const del = useMutation({
    mutationFn: (id: string) => channelsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels'] });
      toast.success('Channel deleted');
    },
    onError: (err) => {
      toast.error('Could not delete', {
        description: err instanceof ApiException ? err.detail : 'An error occurred.',
      });
    },
  });

  return (
    <>
      <PageHeader
        title="Channels"
        subtitle="Bind messaging services to workflows. Telegram messages trigger the linked workflow automatically."
        actions={<CreateChannelDialog workflows={workflows ?? []} />}
      />

      {isLoading && (
        <div className="flex items-center gap-2 text-fg-muted text-sm py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading channels…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div>
            <h3 className="text-fg font-medium">Couldn't load channels</h3>
            <p className="mt-1 text-sm text-fg-muted">
              {error instanceof ApiException ? error.detail : "The API didn't respond. Is the backend running?"}
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
        <div className="rounded-lg border border-border bg-surface/40 overflow-hidden animate-fade-in">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/30">
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">Kind</th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">External ID</th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">Workflow</th>
                <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">Status</th>
                <th className="px-4 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr
                  key={channel.id}
                  className="border-b border-border last:border-0 hover:bg-elevated/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Badge variant="info">{channel.kind}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-muted">
                    {channel.external_id}
                    {channel.external_id === '*' && (
                      <span className="ml-1.5 text-fg-subtle text-[10px]">(any chat)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {workflowsById.get(channel.workflow_id)?.name ?? channel.workflow_id}
                  </td>
                  <td className="px-4 py-3">
                    {channel.enabled ? (
                      <span className="inline-flex items-center gap-1.5 text-success text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        enabled
                      </span>
                    ) : (
                      <span className="text-fg-subtle text-xs">○ disabled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <EditChannelDialog channel={channel} />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete channel"
                            className="text-fg-subtle hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this channel?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The{' '}
                              <span className="font-mono text-fg">{channel.kind}</span> binding
                              for <span className="font-mono text-fg">{channel.external_id}</span> will
                              be removed. The bot and workflow are not affected.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={(e) => {
                                e.preventDefault();
                                del.mutate(channel.id);
                              }}
                              disabled={del.isPending}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
