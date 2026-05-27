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
import { agentsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';
import type { Agent } from '@/lib/api/resources';

export function DeleteAgentButton({ agent }: { agent: Agent }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => agentsApi.remove(agent.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent deleted', { description: agent.name });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiException ? err.detail : 'Failed to delete agent.';
      toast.error('Could not delete', { description: msg });
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${agent.name}`}
          className="text-fg-subtle hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this agent?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="text-fg font-medium">{agent.name}</span> will be
            permanently removed. Any messages it authored will remain in run
            history, but workflows referencing it will fail to compile until
            you update them.
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