"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { workflowsApi } from "@/lib/api/resources";
import { ApiException } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface CreateWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BLANK_GRAPH = {
  nodes: [
    { id: "start", type: "start", data: {}, position: { x: 100, y: 200 } },
  ],
  edges: [],
};

export function CreateWorkflowDialog({
  open,
  onOpenChange,
}: CreateWorkflowDialogProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<
    string | "blank"
  >("blank");

  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: workflowsApi.list,
    enabled: open,
  });

  const templates = workflows.filter((w) => w.is_template);

  const { mutate: createWorkflow, isPending } = useMutation({
    mutationFn: async () => {
      const template = templates.find((t) => t.id === selectedTemplateId);
      return workflowsApi.create({
        name: name.trim(),
        description: template ? `Based on: ${template.name}` : "",
        graph: template?.graph ?? BLANK_GRAPH,
        is_template: false,
      });
    },
    onSuccess: (workflow) => {
      onOpenChange(false);
      setName("");
      setSelectedTemplateId("blank");
      router.push(`/workflows/${workflow.id}/edit`);
    },
    onError: (err) => {
      if (err instanceof ApiException && err.status === 409) {
        setNameError("A workflow with this name already exists.");
      } else {
        toast.error(err instanceof ApiException ? err.detail : "Create failed");
      }
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      setNameError("Name is required.");
      return;
    }
    if (name.trim().length > 120) {
      setNameError("Name must be 120 characters or fewer.");
      return;
    }
    setNameError(null);
    createWorkflow();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Workflow</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-fg-muted">
            Start from a template or a blank canvas.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {templates.map((t) => {
              const nodeCount =
                (t.graph as Record<string, unknown[]> | undefined)?.nodes
                  ?.length ?? 0;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplateId(t.id)}
                  className={cn(
                    "rounded-lg border p-3 text-left text-sm transition-colors hover:bg-elevated/60",
                    selectedTemplateId === t.id
                      ? "border-accent bg-accent/10"
                      : "border-border bg-bg",
                  )}
                >
                  <p className="font-medium text-fg">{t.name}</p>
                  <p className="text-xs text-fg-muted mt-0.5 line-clamp-2">
                    {t.description || `${nodeCount} nodes`}
                  </p>
                </button>
              );
            })}

            <button
              onClick={() => setSelectedTemplateId("blank")}
              className={cn(
                "rounded-lg border border-dashed p-3 text-left text-sm transition-colors hover:bg-elevated/60",
                selectedTemplateId === "blank"
                  ? "border-accent bg-accent/10"
                  : "border-border bg-bg",
              )}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <Plus className="h-3.5 w-3.5 text-fg-muted" />
                <span className="font-medium text-fg">Blank canvas</span>
              </div>
              <p className="text-xs text-fg-muted">
                Start with just a Start node
              </p>
            </button>
          </div>

          <div>
            <Label htmlFor="wf-name" className="text-sm">
              Workflow name
            </Label>
            <Input
              id="wf-name"
              className="mt-1.5"
              placeholder="My workflow…"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
            {nameError && (
              <p className="mt-1 text-xs text-danger">{nameError}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !name.trim()}>
            {isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Creating…
              </>
            ) : (
              "Create Workflow →"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
