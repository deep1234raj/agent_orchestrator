import { z } from 'zod';

/*
 * Agent form schema.
 *
 * Mirrors the backend AgentCreate Pydantic schema. We validate
 * client-side so users get immediate feedback; server-side validation
 * is the final word and any 422 from the backend surfaces via toast.
 */

export const memoryModes = ['none', 'windowed', 'summary'] as const;

export const agentFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Name is too long'),
  role: z.string().min(1, 'Role is required').max(120, 'Role is too long'),
  system_prompt: z.string().min(1, 'System prompt is required'),
  provider: z.string().min(1).default('anthropic'),
  model: z.string().min(1).default('claude-sonnet-4-5'),
  temperature: z.coerce.number().min(0).max(2).default(0.7),
  max_tokens: z.coerce.number().int().min(1).max(200_000).default(2048),
  tools: z.array(z.string()).default([]),
  memory_mode: z.enum(memoryModes).default('summary'),
  memory_window: z.coerce.number().int().min(0).max(200).default(10),
  // Guardrails — flattened to top-level form fields for ergonomics,
  // re-nested under `guardrails` before submitting.
  max_iterations: z.coerce.number().int().min(1).max(100).optional(),
  max_cost_usd: z.coerce.number().min(0).optional(),
});

export type AgentFormValues = z.infer<typeof agentFormSchema>;
