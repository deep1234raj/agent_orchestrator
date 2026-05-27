'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { agentsApi, channelsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';

export function CreateChannelDialog() {
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [externalId, setExternalId] = useState('*');
  const qc = useQueryClient();

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
    staleTime: 30_000,
  });

  // Only channel agents (those with channel_kind set) are valid selections.
  const channelAgents = agents.filter((a) => !!a.channel_kind);

  const selectedAgent = channelAgents.find((a) => a.id === agentId);

  const create = useMutation({
    mutationFn: () =>
      channelsApi.create({
        agent_id: agentId,
        kind:
          (selectedAgent?.channel_kind as 'telegram' | 'slack' | 'whatsapp') ??
          'telegram',
        external_id: externalId,
        enabled: true,
        config: {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels'] });
      toast.success('Channel created');
      setOpen(false);
      setAgentId('');
      setExternalId('*');
    },
    onError: (err) => {
      toast.error('Could not create channel', {
        description:
          err instanceof ApiException ? err.detail : 'An error occurred.',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">
          <Plus className="h-4 w-4" />
          New Channel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Channel Routing Rule</DialogTitle>
          <DialogDescription>
            Route incoming messages from a specific chat to a channel agent. Use{' '}
            <span className="font-mono">*</span> as External ID to accept
            messages from any chat.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ch-agent">Channel Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger id="ch-agent">
                <SelectValue placeholder="Select channel agent…" />
              </SelectTrigger>
              <SelectContent>
                {channelAgents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} · {a.channel_kind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {channelAgents.length === 0 && (
              <p className="text-xs text-fg-subtle">
                No channel agents found. Configure an agent with a channel kind
                first.
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ch-external-id">External ID</Label>
            <Input
              id="ch-external-id"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="* (any chat) or a specific chat_id"
              className="font-mono"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!agentId || !externalId || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Creating…' : 'Create Channel'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
