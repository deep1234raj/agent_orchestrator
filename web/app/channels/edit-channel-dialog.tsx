'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { agentsApi, channelsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';
import type { Channel } from '@/lib/api/resources';

export function EditChannelDialog({ channel }: { channel: Channel }) {
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState(channel.agent_id);
  const [enabled, setEnabled] = useState(channel.enabled);
  const qc = useQueryClient();

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
    staleTime: 30_000,
  });

  const channelAgents = agents.filter((a) => !!a.channel_kind);

  const update = useMutation({
    mutationFn: () =>
      channelsApi.update(channel.id, { agent_id: agentId, enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels'] });
      toast.success('Channel updated');
      setOpen(false);
    },
    onError: (err) => {
      toast.error('Could not update channel', {
        description:
          err instanceof ApiException ? err.detail : 'An error occurred.',
      });
    },
  });

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      setAgentId(channel.agent_id);
      setEnabled(channel.enabled);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Channel</DialogTitle>
          <DialogDescription>
            Update the routing rule for{' '}
            <span className="font-mono text-fg">{channel.external_id}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ch-agent">Channel Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger id="ch-agent">
                <SelectValue placeholder="Select channel agent" />
              </SelectTrigger>
              <SelectContent>
                {channelAgents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} · {a.channel_kind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Checkbox
              id="ch-enabled"
              checked={enabled}
              onCheckedChange={(v) => setEnabled(Boolean(v))}
            />
            <Label htmlFor="ch-enabled">Enabled</Label>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={update.isPending}
            onClick={() => update.mutate()}
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
