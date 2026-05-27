'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toolsApi } from '@/lib/api/resources';
import type { Agent } from '@/lib/api/resources';
import {
  agentFormSchema,
  memoryModes,
  type AgentFormValues,
} from './agent-schema';

/*
 * AgentForm.
 *
 * One form, used for both create and edit. The parent passes an
 * optional `defaultValues` (for edit) and an `onSubmit` handler that
 * does the create or update. The form is layout-only — it doesn't
 * know about the API.
 *
 * Layout: a two-column grid on wide screens (identity left, model
 * right), with the system prompt full-width because it's the
 * conceptual heart of the agent.
 */

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { value: 'claude-opus-4-1', label: 'Claude Opus 4.1' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { value: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o mini (OpenAI)' },
];

const PROVIDER_BY_MODEL: Record<string, string> = {
  'claude-sonnet-4-5': 'anthropic',
  'claude-opus-4-1': 'anthropic',
  'claude-haiku-4-5': 'anthropic',
  'gpt-4o': 'openai',
  'gpt-4o-mini': 'openai',
};

export function AgentForm({
  defaultValues,
  onSubmit,
  submitLabel = 'Save',
  submitting = false,
}: {
  defaultValues?: Partial<Agent>;
  onSubmit: (values: AgentFormValues) => unknown | Promise<unknown>;
  submitLabel?: string;
  submitting?: boolean;
}) {
  const { data: tools } = useQuery({
    queryKey: ['tools'],
    queryFn: toolsApi.list,
  });

  const guardrails = (defaultValues?.guardrails ?? {}) as {
    max_iterations?: number;
    max_cost_usd?: number;
  };

  const form = useForm<AgentFormValues>({
    resolver: zodResolver(agentFormSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      role: defaultValues?.role ?? '',
      system_prompt: defaultValues?.system_prompt ?? '',
      provider: defaultValues?.provider ?? 'anthropic',
      model: defaultValues?.model ?? 'claude-sonnet-4-5',
      temperature: defaultValues?.temperature ?? 0.7,
      max_tokens: defaultValues?.max_tokens ?? 2048,
      tools: defaultValues?.tools ?? [],
      memory_mode: defaultValues?.memory_mode ?? 'summary',
      memory_window: defaultValues?.memory_window ?? 10,
      max_iterations: guardrails.max_iterations,
      max_cost_usd: guardrails.max_cost_usd,
    },
  });

  const selectedTools = form.watch('tools');
  const memoryMode = form.watch('memory_mode');

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-8"
      noValidate
    >
      {/* IDENTITY */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="e.g. Researcher"
            {...form.register('name')}
            aria-invalid={!!form.formState.errors.name}
          />
          {form.formState.errors.name && (
            <p className="mt-1 text-xs text-danger">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <Input
            id="role"
            placeholder="e.g. research"
            {...form.register('role')}
          />
          {form.formState.errors.role && (
            <p className="mt-1 text-xs text-danger">
              {form.formState.errors.role.message}
            </p>
          )}
        </div>
      </section>

      {/* SYSTEM PROMPT */}
      <section className="space-y-2">
        <Label htmlFor="system_prompt">System Prompt</Label>
        <Textarea
          id="system_prompt"
          rows={8}
          placeholder="You are a Researcher. Given a topic from the user, use the web_search tool to gather..."
          {...form.register('system_prompt')}
          className="font-mono text-[13px] leading-relaxed"
        />
        {form.formState.errors.system_prompt && (
          <p className="mt-1 text-xs text-danger">
            {form.formState.errors.system_prompt.message}
          </p>
        )}
      </section>

      {/* MODEL */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-lg text-fg">Model</h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
            inference
          </span>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-2 md:col-span-1">
            <Label>Model</Label>
            <Select
              value={form.watch('model')}
              onValueChange={(v) => {
                form.setValue('model', v);
                form.setValue('provider', PROVIDER_BY_MODEL[v] ?? 'anthropic');
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="temperature">Temperature</Label>
            <Input
              id="temperature"
              type="number"
              step="0.05"
              min={0}
              max={2}
              {...form.register('temperature')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="max_tokens">Max tokens / call</Label>
            <Input
              id="max_tokens"
              type="number"
              min={1}
              {...form.register('max_tokens')}
            />
          </div>
        </div>
      </section>

      {/* TOOLS */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-lg text-fg">Tools</h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
            capabilities
          </span>
        </div>
        {!tools && (
          <div className="font-mono text-xs text-fg-subtle">Loading tools…</div>
        )}
        {tools && tools.length === 0 && (
          <div className="text-xs text-fg-subtle">
            No tools registered on the server.
          </div>
        )}
        {tools && tools.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {tools.map((tool) => {
              const checked = selectedTools.includes(tool.name);
              return (
                <li key={tool.name}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                      checked
                        ? 'border-accent/40 bg-accent/5'
                        : 'border-border bg-bg/40 hover:bg-elevated/40'
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => {
                        const next = c
                          ? [...selectedTools, tool.name]
                          : selectedTools.filter((t) => t !== tool.name);
                        form.setValue('tools', next, { shouldDirty: true });
                      }}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-fg">
                        {tool.name}
                      </div>
                      <div className="mt-0.5 text-xs leading-snug text-fg-muted">
                        {tool.description}
                      </div>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* MEMORY */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-lg text-fg">Memory</h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
            within a run
          </span>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Mode</Label>
            <Select
              value={memoryMode}
              onValueChange={(v) =>
                form.setValue('memory_mode', v as (typeof memoryModes)[number])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">none — agent is stateless</SelectItem>
                <SelectItem value="windowed">
                  windowed — last N turns
                </SelectItem>
                <SelectItem value="summary">
                  summary — rolling digest + tail
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="memory_window">Window (turns)</Label>
            <Input
              id="memory_window"
              type="number"
              min={0}
              disabled={memoryMode === 'none'}
              {...form.register('memory_window')}
            />
          </div>
        </div>
      </section>

      {/* GUARDRAILS */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-lg text-fg">Guardrails</h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
            per run
          </span>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="max_iterations">Max iterations</Label>
            <Input
              id="max_iterations"
              type="number"
              min={1}
              placeholder="25"
              {...form.register('max_iterations')}
            />
            <p className="text-xs text-fg-subtle">
              Cap on agent turns. Empty = use system default (25).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_cost_usd">Max cost (USD)</Label>
            <Input
              id="max_cost_usd"
              type="number"
              step="0.01"
              min={0}
              placeholder="1.00"
              {...form.register('max_cost_usd')}
            />
            <p className="text-xs text-fg-subtle">
              Hard cap. The run halts when exceeded.
            </p>
          </div>
        </div>
      </section>

      {/* ACTIONS */}
      <div className="flex items-center justify-end gap-2 border-t border-border pt-2">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/*
 * Helper used by both create and edit pages.
 * Re-nests the flat form into the AgentCreate/Update shape expected
 * by the backend.
 */
export function valuesToApiPayload(values: AgentFormValues) {
  const { max_iterations, max_cost_usd, ...rest } = values;
  const guardrails: Record<string, unknown> = {};
  if (max_iterations !== undefined) guardrails.max_iterations = max_iterations;
  if (max_cost_usd !== undefined) guardrails.max_cost_usd = max_cost_usd;
  return { ...rest, guardrails };
}
