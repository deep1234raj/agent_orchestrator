"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { agentsApi } from "@/lib/api/resources";
import { ApiException } from "@/lib/api/client";
import { buildCronFromParts, describeCron } from "@/lib/cron-utils";

const PRESETS = [
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every day", cron: "0 9 * * *" },
  { label: "Every Monday", cron: "0 9 * * 1" },
  { label: "Every weekday", cron: "0 9 * * 1-5" },
] as const;

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Kolkata",
];

const MINUTES = ["0", "15", "30", "45", "*"];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i));
const DOM = ["*", ...Array.from({ length: 31 }, (_, i) => String(i + 1))];
const MONTHS = ["*", ...Array.from({ length: 12 }, (_, i) => String(i + 1))];
const DOW = [
  { value: "*", label: "Every day" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
  { value: "1-5", label: "Weekdays" },
];

const schema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  cron: z.string().min(1),
  timezone: z.string().default("UTC"),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  agentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateScheduleDialog({ agentId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [customMode, setCustomMode] = useState(false);
  const [cronParts, setCronParts] = useState({
    minute: "0",
    hour: "9",
    dom: "*",
    month: "*",
    dow: "*",
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", cron: "0 9 * * *", timezone: "UTC" },
  });

  const cron = form.watch("cron");

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      agentsApi.createSchedule(agentId, {
        name: values.name,
        cron: values.cron,
        timezone: values.timezone,
        input: {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents", agentId, "schedules"] });
      toast.success("Schedule created");
      form.reset();
      setCustomMode(false);
      setCronParts({ minute: "0", hour: "9", dom: "*", month: "*", dow: "*" });
      onOpenChange(false);
    },
    onError: (err) => {
      const msg =
        err instanceof ApiException ? err.detail : "Failed to create schedule.";
      toast.error("Could not create schedule", { description: msg });
    },
  });

  function selectPreset(presetCron: string) {
    form.setValue("cron", presetCron);
    setCustomMode(false);
  }

  function updateCronPart(part: keyof typeof cronParts, value: string) {
    const next = { ...cronParts, [part]: value };
    setCronParts(next);
    form.setValue(
      "cron",
      buildCronFromParts(
        next.minute,
        next.hour,
        next.dom,
        next.month,
        next.dow,
      ),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Schedule</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((v) => create.mutate(v))}
          className="space-y-5"
        >
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="sched-name">Name</Label>
            <Input
              id="sched-name"
              placeholder="Daily standup"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-danger">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* Frequency */}
          <div className="space-y-2">
            <Label>Frequency</Label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.cron}
                  type="button"
                  onClick={() => selectPreset(p.cron)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    cron === p.cron && !customMode
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-fg-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomMode(true)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  customMode
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-fg-muted hover:border-accent hover:text-accent"
                }`}
              >
                Custom
              </button>
            </div>

            {customMode && (
              <div className="mt-2 grid grid-cols-5 gap-2">
                {(
                  [
                    { key: "minute", label: "Min", options: MINUTES },
                    { key: "hour", label: "Hour", options: HOURS },
                    { key: "dom", label: "Day", options: DOM },
                    { key: "month", label: "Month", options: MONTHS },
                  ] as const
                ).map(({ key, label, options }) => (
                  <div key={key} className="space-y-1">
                    <p className="text-center text-xs text-fg-subtle">
                      {label}
                    </p>
                    <Select
                      value={cronParts[key]}
                      onValueChange={(v) => updateCronPart(key, v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((o) => (
                          <SelectItem key={o} value={o} className="text-xs">
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <div className="space-y-1">
                  <p className="text-center text-xs text-fg-subtle">Weekday</p>
                  <Select
                    value={cronParts.dow}
                    onValueChange={(v) => updateCronPart("dow", v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOW.map((o) => (
                        <SelectItem
                          key={o.value}
                          value={o.value}
                          className="text-xs"
                        >
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
            {describeCron(cron)}
          </div>

          {/* Timezone */}
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Select
              value={form.watch("timezone")}
              onValueChange={(v) => form.setValue("timezone", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Save Schedule"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
