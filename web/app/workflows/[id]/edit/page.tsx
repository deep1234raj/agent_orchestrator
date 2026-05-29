'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useState, useCallback } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { WorkflowEditor } from '@/components/workflow-editor';
import { workflowsApi, agentsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';
import type { GraphDocument } from '@/lib/workflow-validation';

export default function WorkflowEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [discardOpen, setDiscardOpen] = useState(false);

  const {
    data: workflow,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['workflow', id],
    queryFn: () => workflowsApi.get(id),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
  });

  const handleSaved = useCallback(() => {
    router.push(`/workflows/${id}`);
  }, [router, id]);

  const handleCancel = useCallback(() => {
    setDiscardOpen(true);
  }, []);

  const confirmDiscard = useCallback(() => {
    setDiscardOpen(false);
    router.push(`/workflows/${id}`);
  }, [router, id]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-5rem)] items-center justify-center gap-2 text-sm text-fg-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading workflow…
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="flex h-[calc(100vh-5rem)] items-center justify-center">
        <div className="flex max-w-md items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div>
            <h3 className="font-medium text-fg">Couldn't load workflow</h3>
            <p className="mt-1 text-sm text-fg-muted">
              {error instanceof ApiException
                ? error.detail
                : 'Check the backend connection.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const initialGraph: GraphDocument = workflow.graph
    ? (workflow.graph as unknown as GraphDocument)
    : {
        nodes: [
          {
            id: 'start',
            type: 'start',
            data: {},
            position: { x: 100, y: 200 },
          },
        ],
        edges: [],
      };

  return (
    <>
      {/* Break out of the layout's py-10 padding so the editor fills the viewport */}
      <div
        className="-mx-6 -mb-10 -mt-10 h-[calc(100vh-0px)] sm:-mx-10"
        style={{ height: '100vh' }}
      >
        <WorkflowEditor
          workflowId={id}
          workflowName={workflow.name}
          initialGraph={initialGraph}
          agents={agents}
          onSaved={handleSaved}
          onCancel={handleCancel}
        />
      </div>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Unsaved changes to this workflow will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDiscard}
              className="bg-danger hover:bg-danger/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
