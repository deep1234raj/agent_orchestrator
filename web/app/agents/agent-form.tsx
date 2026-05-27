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
import { toolsApi, skillsApi } from '@/lib/api/resources';
import type { Agent } from '@/lib/api/resources';
import {
  agentFormSchema,
  memoryModes,
  outputFormats,
  toneOptions,
  channelKinds,
  type AgentFormValues,
} from './agent-schema';

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
  const { data: skills } = useQuery({
    queryKey: ['skills'],
    queryFn: skillsApi.list,
  });

  const guardrails = (defaultValues?.guardrails ?? {}) as {
    max_iterations?: number;
    max_cost_usd?: number;
  };
  const ir = (defaultValues?.interaction_rules ?? {}) as Record<
    string,
    unknown
  >;
  const cc = (defaultValues?.channel_config ?? {}) as Record<string, string>;

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
      // Skills
      skills: defaultValues?.skills ?? [],
      // Channel
      channel_kind:
        (defaultValues?.channel_kind as
          | (typeof channelKinds)[number]
          | undefined) ?? undefined,
      bot_token: cc.bot_token ?? '',
      webhook_secret: cc.webhook_secret ?? '',
      // Interaction rules
      output_format:
        (ir.output_format as (typeof outputFormats)[number] | undefined) ??
        undefined,
      tone: (ir.tone as (typeof toneOptions)[number] | undefined) ?? undefined,
      response_language: (ir.response_language as string | undefined) ?? '',
      forbidden_topics_raw: (
        (ir.forbidden_topics as string[] | undefined) ?? []
      ).join(', '),
      allowed_tools_raw: (
        (ir.allowed_tools as string[] | undefined) ?? []
      ).join(', '),
      denied_tools_raw: ((ir.denied_tools as string[] | undefined) ?? []).join(
        ', ',
      ),
      no_pii: (ir.no_pii as boolean | undefined) ?? false,
      require_human_approval:
        (ir.require_human_approval as boolean | undefined) ?? false,
      human_approval_actions_raw: (
        (ir.human_approval_actions as string[] | undefined) ?? []
      ).join(', '),
      authorized_delegators_raw: (
        (ir.authorized_delegators as string[] | undefined) ?? []
      ).join(', '),
      proactive_disclosure:
        (ir.proactive_disclosure as boolean | undefined) ?? true,
      domain_rules_raw: ((ir.domain_rules as string[] | undefined) ?? []).join(
        '\n',
      ),
    },
  });

  const selectedTools = form.watch('tools');
  const selectedSkills = form.watch('skills');
  const memoryMode = form.watch('memory_mode');
  const channelKind = form.watch('channel_kind');

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

      {/* CHANNEL */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-lg text-fg">Channel</h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
            entry point
          </span>
        </div>
        <p className="text-xs text-fg-subtle">
          Make this agent a bot entry point. One agent = one bot. Leave empty
          for internal-only agents.
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Channel kind</Label>
            <Select
              value={channelKind ?? ''}
              onValueChange={(v) =>
                form.setValue(
                  'channel_kind',
                  (v || undefined) as (typeof channelKinds)[number] | undefined,
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Not a channel agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="slack">Slack (stub)</SelectItem>
                <SelectItem value="whatsapp">WhatsApp (stub)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {channelKind && (
            <>
              <div className="space-y-2">
                <Label htmlFor="bot_token">Bot Token</Label>
                <Input
                  id="bot_token"
                  type="password"
                  placeholder="123456:ABC..."
                  {...form.register('bot_token')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="webhook_secret">Webhook Secret</Label>
                <Input
                  id="webhook_secret"
                  placeholder="optional"
                  {...form.register('webhook_secret')}
                />
              </div>
            </>
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

      {/* SKILLS */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-lg text-fg">Skills</h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
            procedural knowledge
          </span>
        </div>
        <p className="text-xs text-fg-subtle">
          Skills give the agent specialised procedural knowledge. Full
          instructions are loaded on demand via the{' '}
          <span className="font-mono">load_skill</span> tool, keeping context
          lean.
        </p>
        {skills && skills.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {skills.map((skill) => {
              const checked = selectedSkills.includes(skill.slug);
              return (
                <li key={skill.slug}>
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
                          ? [...selectedSkills, skill.slug]
                          : selectedSkills.filter((s) => s !== skill.slug);
                        form.setValue('skills', next, { shouldDirty: true });
                      }}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-fg">
                        {skill.name}
                      </div>
                      <div className="mt-0.5 text-xs leading-snug text-fg-muted">
                        {skill.description}
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

      {/* INTERACTION RULES */}
      <section className="space-y-6">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-lg text-fg">Interaction Rules</h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
            constraints
          </span>
        </div>

        {/* — 1. Operational Constraints — */}
        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
            1 · Operational
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="allowed_tools_raw">Allowed Tools</Label>
              <Input
                id="allowed_tools_raw"
                placeholder="e.g. web_search, calculator"
                {...form.register('allowed_tools_raw')}
              />
              <p className="text-xs text-fg-subtle">
                Comma-separated whitelist. Empty = all tools allowed.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="denied_tools_raw">Denied Tools</Label>
              <Input
                id="denied_tools_raw"
                placeholder="e.g. http_get"
                {...form.register('denied_tools_raw')}
              />
              <p className="text-xs text-fg-subtle">
                Comma-separated blacklist.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={form.watch('no_pii') ?? false}
                onCheckedChange={(c) => form.setValue('no_pii', !!c)}
              />
              <span className="text-sm text-fg">
                No PII — never transmit personal data
              </span>
            </label>
          </div>
        </div>

        {/* — 2. Communication Protocols — */}
        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
            2 · Protocols
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={form.watch('require_human_approval') ?? false}
                onCheckedChange={(c) =>
                  form.setValue('require_human_approval', !!c)
                }
              />
              <span className="text-sm text-fg">
                Require human approval before irreversible actions
              </span>
            </label>
            <div className="space-y-2">
              <Label htmlFor="human_approval_actions_raw">
                Irreversible Action Tools
              </Label>
              <Input
                id="human_approval_actions_raw"
                placeholder="e.g. send_message, http_get"
                {...form.register('human_approval_actions_raw')}
              />
              <p className="text-xs text-fg-subtle">
                Which tools need approval (comma-separated).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="authorized_delegators_raw">
                Authorized Delegators
              </Label>
              <Input
                id="authorized_delegators_raw"
                placeholder="e.g. ManagerAgent, OrchestratorAgent"
                {...form.register('authorized_delegators_raw')}
              />
              <p className="text-xs text-fg-subtle">
                Agent names that can delegate tasks here.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={form.watch('proactive_disclosure') ?? true}
                onCheckedChange={(c) =>
                  form.setValue('proactive_disclosure', !!c)
                }
              />
              <span className="text-sm text-fg">
                Proactive disclosure — explain why a request can&apos;t be
                fulfilled
              </span>
            </label>
          </div>
        </div>

        {/* — 3. Domain Rules / SOPs — */}
        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
            3 · Domain Rules
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Output Format</Label>
              <Select
                value={form.watch('output_format') ?? ''}
                onValueChange={(v) =>
                  form.setValue(
                    'output_format',
                    (v || undefined) as
                      | (typeof outputFormats)[number]
                      | undefined,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="markdown">Markdown</SelectItem>
                  <SelectItem value="plain">Plain text</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="bullet_points">Bullet points</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tone</Label>
              <Select
                value={form.watch('tone') ?? ''}
                onValueChange={(v) =>
                  form.setValue(
                    'tone',
                    (v || undefined) as
                      | (typeof toneOptions)[number]
                      | undefined,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="response_language">Response Language</Label>
              <Input
                id="response_language"
                placeholder="e.g. en, es, fr"
                {...form.register('response_language')}
              />
              <p className="text-xs text-fg-subtle">
                ISO 639-1. Empty = no constraint.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="forbidden_topics_raw">Forbidden Topics</Label>
              <Input
                id="forbidden_topics_raw"
                placeholder="e.g. politics, finance"
                {...form.register('forbidden_topics_raw')}
              />
              <p className="text-xs text-fg-subtle">Comma-separated.</p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="domain_rules_raw">Domain / SOP Rules</Label>
              <Textarea
                id="domain_rules_raw"
                rows={3}
                placeholder={
                  'Never book appointments on Sundays.\nAlways verify email format before sending.'
                }
                {...form.register('domain_rules_raw')}
              />
              <p className="text-xs text-fg-subtle">
                One rule per line. Injected as bullet points into the system
                prompt.
              </p>
            </div>
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

export function valuesToApiPayload(values: AgentFormValues) {
  const {
    max_iterations,
    max_cost_usd,
    output_format,
    tone,
    response_language,
    forbidden_topics_raw,
    allowed_tools_raw,
    denied_tools_raw,
    no_pii,
    require_human_approval,
    human_approval_actions_raw,
    authorized_delegators_raw,
    proactive_disclosure,
    domain_rules_raw,
    channel_kind,
    bot_token,
    webhook_secret,
    ...rest
  } = values;

  const guardrails: Record<string, unknown> = {};
  if (max_iterations !== undefined) guardrails.max_iterations = max_iterations;
  if (max_cost_usd !== undefined) guardrails.max_cost_usd = max_cost_usd;

  const interaction_rules: Record<string, unknown> = {};
  if (output_format) interaction_rules.output_format = output_format;
  if (tone) interaction_rules.tone = tone;
  if (response_language)
    interaction_rules.response_language = response_language;

  const forbidden = forbidden_topics_raw
    ? forbidden_topics_raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  if (forbidden.length) interaction_rules.forbidden_topics = forbidden;

  const allowed_tools = allowed_tools_raw
    ? allowed_tools_raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const denied_tools = denied_tools_raw
    ? denied_tools_raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const human_approval_actions = human_approval_actions_raw
    ? human_approval_actions_raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const authorized_delegators = authorized_delegators_raw
    ? authorized_delegators_raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const domain_rules = domain_rules_raw
    ? domain_rules_raw
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean)
    : [];

  if (allowed_tools.length) interaction_rules.allowed_tools = allowed_tools;
  if (denied_tools.length) interaction_rules.denied_tools = denied_tools;
  if (no_pii) interaction_rules.no_pii = no_pii;
  if (require_human_approval)
    interaction_rules.require_human_approval = require_human_approval;
  if (human_approval_actions.length)
    interaction_rules.human_approval_actions = human_approval_actions;
  if (authorized_delegators.length)
    interaction_rules.authorized_delegators = authorized_delegators;
  if (!proactive_disclosure)
    interaction_rules.proactive_disclosure = proactive_disclosure;
  if (domain_rules.length) interaction_rules.domain_rules = domain_rules;

  const channel_config: Record<string, unknown> = {};
  if (bot_token) channel_config.bot_token = bot_token;
  if (webhook_secret) channel_config.webhook_secret = webhook_secret;

  return {
    ...rest,
    guardrails,
    interaction_rules,
    channel_kind: channel_kind ?? null,
    channel_config,
  };
}
