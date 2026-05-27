'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { channelsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';
import type { Channel } from '@/lib/api/resources';

export function EditChannelDialog({ channel }: { channel: Channel }) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(channel.enabled);
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: () => channelsApi.update(channel.id, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels'] });
      toast.success('Channel updated');
      setOpen(false);
    },
    onError: (err) => {
      toast.error('Could not update channel', {
        description: err instanceof ApiException ? err.detail : 'An error occurred.',
      });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setEnabled(channel.enabled);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Channel</DialogTitle>
          <DialogDescription>
            Update the binding for{' '}
            <span className="font-mono text-fg">{channel.external_id}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 py-2">
          <input
            id="ch-enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 accent-amber-400"
          />
          <Label htmlFor="ch-enabled">Enabled</Label>
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
