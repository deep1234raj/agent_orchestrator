/**
 * API schema types.
 *
 * In production, this file is **generated** from the live OpenAPI spec:
 *
 *   pnpm openapi   # hits http://localhost:8000/openapi.json
 *
 * The hand-written version below is a minimal fallback that lets the
 * project compile and develop before the backend is reachable. Once
 * you run `pnpm openapi` the generated types replace this file
 * entirely and the rest of the codebase keeps working.
 *
 * Why keep this stub at all? So `pnpm install && pnpm dev` succeeds on
 * a fresh clone even if the user hasn't started the backend yet.
 */

export type UUID = string;
export type Timestamp = string; // ISO-8601

export type MemoryMode = 'none' | 'windowed' | 'summary';
export type RunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface Agent {
  id: UUID;
  name: string;
  role: string;
  system_prompt: string;
  provider: string;
  model: string;
  temperature: number;
  max_tokens: number;
  tools: string[];
  memory_mode: MemoryMode;
  memory_window: number;
  guardrails: Record<string, unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AgentCreate {
  name: string;
  role: string;
  system_prompt: string;
  provider?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: string[];
  memory_mode?: MemoryMode;
  memory_window?: number;
  guardrails?: Record<string, unknown>;
}

export type AgentUpdate = Partial<AgentCreate>;

export interface Workflow {
  id: UUID;
  name: string;
  description: string;
  graph: Record<string, unknown>;
  is_template: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Run {
  id: UUID;
  workflow_id: UUID;
  status: RunStatus;
  trigger: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  started_at: Timestamp | null;
  finished_at: Timestamp | null;
  total_tokens: number;
  total_cost_usd: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ApiError {
  detail: string;
  code: string;
  errors?: unknown;
}