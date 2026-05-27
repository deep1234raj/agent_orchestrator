'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { channelsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';
import type { Workflow } from '@/lib/api/resources';

interface CreateChannelDialogProps {
  workflows: Workflow[];
}

export function CreateChannelDialog({ workflows }: CreateChannelDialogProps) {
  const [open, setOpen] = useState(false);
  const [workflowId, setWorkflowId] = useState('');
  const [externalId, setExternalId] = useState('*');
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: () =>
      channelsApi.create({
        workflow_id: workflowId,
        kind: 'telegram',
        external_id: externalId,
        enabled: true,
        config: {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels'] });
      toast.success('Channel created');
      setOpen(false);
      setWorkflowId('');
      setExternalId('*');
    },
    onError: (err) => {
      toast.error('Could not create channel', {
        description: err instanceof ApiException ? err.detail : 'An error occurred.',
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
          <DialogTitle>New Channel</DialogTitle>
          <DialogDescription>
            Bind a Telegram bot to a workflow. Use{' '}
            <span className="font-mono">*</span> as External ID to accept
            messages from any chat.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ch-workflow">Workflow</Label>
            <Select value={workflowId} onValueChange={setWorkflowId}>
              <SelectTrigger id="ch-workflow">
                <SelectValue placeholder="Select a workflow" />
              </SelectTrigger>
              <SelectContent>
                {workflows.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ch-kind">Kind</Label>
            <Select defaultValue="telegram" disabled>
              <SelectTrigger id="ch-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="telegram">Telegram</SelectItem>
              </SelectContent>
            </Select>
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
            disabled={!workflowId || !externalId || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Creating…' : 'Create Channel'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
