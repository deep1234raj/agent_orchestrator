'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Play, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { workflowsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';

interface TriggerRunDialogProps {
  workflowId: string;
  workflowName: string;
}

export function TriggerRunDialog({ workflowId, workflowName }: TriggerRunDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      workflowsApi.triggerRun(workflowId, {
        input: inputText.trim() ? { input: inputText.trim() } : {},
      }),
    onSuccess: (run) => {
      toast.success('Run started');
      setOpen(false);
      router.push(`/runs/${run.id}`);
    },
    onError: (err) => {
      const msg = err instanceof ApiException ? err.detail : 'Failed to start run';
      toast.error(msg);
    },
  });

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Play className="h-4 w-4" />
        Trigger Run
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Trigger — {workflowName}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="block text-sm text-fg-muted">
              Input message
              <span className="ml-1 text-xs text-fg-subtle">
                (optional — seeded workflows have defaults)
              </span>
            </label>
            <textarea
              className="w-full min-h-[100px] rounded-md border border-border bg-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              placeholder="e.g. lithium battery recycling market"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={() => mutate()} disabled={isPending} className="gap-2">
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Start Run
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
