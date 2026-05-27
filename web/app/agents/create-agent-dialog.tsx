'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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

import { AgentForm, valuesToApiPayload } from './agent-form';
import { agentsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';
import type { AgentFormValues } from './agent-schema';

export function CreateAgentDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (values: AgentFormValues) =>
      agentsApi.create(valuesToApiPayload(values)),
    onSuccess: (agent) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent created', {
        description: `${agent.name} is ready to be wired into a workflow.`,
      });
      setOpen(false);
    },
    onError: (err) => {
      const msg =
        err instanceof ApiException ? err.detail : 'Failed to create agent.';
      toast.error('Could not create agent', { description: msg });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">
          <Plus className="h-4 w-4" />
          New Agent
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Agent</DialogTitle>
          <DialogDescription>
            Define an agent's persona, model, tools, and guardrails. You can
            edit any of this later.
          </DialogDescription>
        </DialogHeader>
        <AgentForm
          onSubmit={(v) => create.mutateAsync(v)}
          submitLabel="Create Agent"
          submitting={create.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
