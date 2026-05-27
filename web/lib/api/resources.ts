/**
 * Resource functions.
 *
 * One module per backend entity. Call sites do:
 *   import { agentsApi } from '@/lib/api/resources';
 *   const agents = await agentsApi.list();
 *
 * Keeping these as namespaced objects (vs. flat exports) makes the
 * dependency graph obvious and lets us add cross-cutting concerns
 * (caching keys, optimistic updates) at one boundary.
 */

import { api } from './client';
import type {
  Agent,
  AgentCreate,
  AgentUpdate,
  Run,
  RunStatus,
  Tool,
  Workflow,
} from './schema';

export const agentsApi = {
  list: () => api<Agent[]>('/agents'),
  get: (id: string) => api<Agent>(`/agents/${id}`),
  create: (body: AgentCreate) =>
    api<Agent>('/agents', { method: 'POST', body }),
  update: (id: string, body: AgentUpdate) =>
    api<Agent>(`/agents/${id}`, { method: 'PATCH', body }),
  remove: (id: string) =>
    api<void>(`/agents/${id}`, { method: 'DELETE' }),
};

export const workflowsApi = {
  list: () => api<Workflow[]>('/workflows'),
  get: (id: string) => api<Workflow>(`/workflows/${id}`),
};

export const runsApi = {
  list: (params?: { workflow_id?: string; status?: RunStatus; limit?: number }) =>
    api<Run[]>('/runs', { query: params }),
  get: (id: string) => api<Run>(`/runs/${id}`),
};

export const toolsApi = {
  list: () => api<Tool[]>('/tools'),
};