"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Play, Pause, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/alert-dialog";
import { agentsApi } from "@/lib/api/resources";
import type { ScheduleRead } from "@/lib/api/resources";
import { ApiException } from "@/lib/api/client";
import { describeCron } from "@/lib/cron-utils";
import { CreateScheduleDialog } from "./create-schedule-dialog";

interface Props {
  agentId: string;
}

export function ScheduleSection({ agentId }: Props) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: schedules = [] } = useQuery({
    queryKey: ["agents", agentId, "schedules"],
    queryFn: () => agentsApi.listSchedules(agentId),
  });

  const toggle = useMutation({
    mutationFn: (sched: ScheduleRead) => {
      setTogglingId(sched.id);
      return agentsApi.updateSchedule(agentId, sched.id, {
        status: sched.status === "active" ? "paused" : "active",
      });
    },
    onSettled: () => setTogglingId(null),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["agents", agentId, "schedules"] }),
    onError: () => toast.error("Failed to update schedule."),
  });

  const trigger = useMutation({
    mutationFn: (scheduleId: string) =>
      agentsApi.triggerSchedule(agentId, scheduleId),
    onSuccess: () => toast.success("Run queued."),
    onError: (err) => {
      const msg =
        err instanceof ApiException ? err.detail : "Failed to trigger run.";
      toast.error(msg);
    },
  });

  const remove = useMutation({
    mutationFn: (scheduleId: string) => {
      setDeletingId(scheduleId);
      return agentsApi.deleteSchedule(agentId, scheduleId);
    },
    onSettled: () => setDeletingId(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents", agentId, "schedules"] });
      toast.success("Schedule deleted.");
    },
    onError: () => toast.error("Failed to delete schedule."),
  });

  return (
    <div id="schedules" className="mt-8 rounded-lg border border-border p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-accent" />
            <h3 className="font-display text-sm font-semibold text-fg">
              Schedules
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-fg-subtle">
            Cron jobs that trigger this agent automatically
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          + Add Schedule
        </Button>
      </div>

      {schedules.length === 0 ? (
        <p className="text-xs text-fg-subtle">
          No schedules yet. Add one to run this agent automatically.
        </p>
      ) : (
        <ul className="space-y-2">
          {schedules.map((sched) => (
            <li
              key={sched.id}
              className="flex items-center gap-3 rounded-md border border-border bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">
                  {sched.name}
                </p>
                <p className="text-xs text-accent">
                  {describeCron(sched.cron)}
                </p>
                <p className="text-xs text-fg-subtle">
                  {sched.status === "paused"
                    ? "Paused"
                    : sched.next_fire_at
                      ? `Next: ${formatDistanceToNow(new Date(sched.next_fire_at), { addSuffix: true })}`
                      : null}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Badge
                  variant={sched.status === "active" ? "default" : "outline"}
                  className="text-xs"
                >
                  {sched.status}
                </Badge>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title={sched.status === "active" ? "Pause" : "Resume"}
                  disabled={togglingId === sched.id}
                  onClick={() => toggle.mutate(sched)}
                >
                  {sched.status === "active" ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Run now"
                  disabled={trigger.isPending}
                  onClick={() => trigger.mutate(sched.id)}
                >
                  <Zap className="h-3.5 w-3.5" />
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-danger hover:text-danger"
                      title="Delete schedule"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete schedule?</AlertDialogTitle>
                      <AlertDialogDescription>
                        &quot;{sched.name}&quot; will be permanently removed.
                        This will not affect runs already in progress.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => remove.mutate(sched.id)}
                        disabled={deletingId === sched.id}
                        className="bg-danger text-white hover:bg-danger/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateScheduleDialog
        agentId={agentId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
