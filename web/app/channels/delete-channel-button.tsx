'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { channelsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';
import type { Channel } from '@/lib/api/resources';

export function DeleteChannelButton({ channel }: { channel: Channel }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => channelsApi.remove(channel.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels'] });
      toast.success('Channel deleted', {
        description: `${channel.kind} / ${channel.external_id}`,
      });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiException ? err.detail : 'Failed to delete channel.';
      toast.error('Could not delete', { description: msg });
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${channel.kind} channel`}
          className="text-fg-subtle hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this channel?</AlertDialogTitle>
          <AlertDialogDescription>
            The <span className="font-mono text-fg">{channel.kind}</span>{' '}
            binding for{' '}
            <span className="font-mono text-fg">{channel.external_id}</span>{' '}
            will be removed. The bot and workflow are not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              del.mutate();
            }}
            disabled={del.isPending}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
