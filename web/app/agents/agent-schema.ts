import { z } from 'zod';

export const memoryModes = ['none', 'windowed', 'summary'] as const;
export const outputFormats = [
  'markdown',
  'plain',
  'json',
  'bullet_points',
] as const;
export const toneOptions = [
  'formal',
  'casual',
  'technical',
  'friendly',
] as const;
export const channelKinds = ['telegram', 'slack', 'whatsapp'] as const;

export const agentFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  role: z.string().min(1, 'Role is required').max(120),
  system_prompt: z.string().min(1, 'System prompt is required'),
  provider: z.string().min(1).default('anthropic'),
  model: z.string().min(1).default('claude-sonnet-4-6'),
  temperature: z.coerce.number().min(0).max(2).default(0.7),
  max_tokens: z.coerce.number().int().min(1).max(200_000).default(2048),
  tools: z.array(z.string()).default([]),
  memory_mode: z.enum(memoryModes).default('summary'),
  memory_window: z.coerce.number().int().min(0).max(200).default(10),
  // Guardrails (flattened; re-nested before submit)
  max_iterations: z.coerce.number().int().min(1).max(100).optional(),
  max_cost_usd: z.coerce.number().min(0).optional(),
  // Skills
  skills: z.array(z.string()).default([]),
  // Interaction rules — flattened; re-nested before submit
  output_format: z.enum(outputFormats).optional(),
  tone: z.enum(toneOptions).optional(),
  response_language: z.string().max(10).optional(),
  forbidden_topics_raw: z.string().optional(),
  no_pii: z.boolean().default(false),
  require_human_approval: z.boolean().default(false),
  human_approval_actions_raw: z.string().optional(),
  authorized_delegators_raw: z.string().optional(),
  proactive_disclosure: z.boolean().default(true),
  domain_rules_raw: z.string().optional(),
  // Channel agent (flattened; re-nested before submit)
  channel_kind: z.enum(channelKinds).optional(),
  bot_token: z.string().optional(),
  webhook_secret: z.string().optional(),
});

export type AgentFormValues = z.infer<typeof agentFormSchema>;
