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
import type { components } from './schema';

// ── Type aliases from the generated OpenAPI schema ──────────────────
export type Agent          = components['schemas']['AgentRead'];
export type AgentCreate    = components['schemas']['AgentCreate'];
export type AgentUpdate    = components['schemas']['AgentUpdate'];
export type Run            = components['schemas']['RunRead'];
export type RunDetail      = components['schemas']['RunDetail'];
export type RunRead        = components['schemas']['RunRead'];
export type RunStatus      = components['schemas']['RunStatus'];
export type Tool           = components['schemas']['ToolRead'];
export type Workflow       = components['schemas']['WorkflowRead'];
export type WorkflowUpdate = components['schemas']['WorkflowUpdate'];
export type MessageRead    = components['schemas']['MessageRead'];
export type ToolCallRead   = components['schemas']['ToolCallRead'];
export type UsageEventRead = components['schemas']['UsageEventRead'];
export type { components };

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
  update: (id: string, body: WorkflowUpdate) =>
    api<Workflow>(`/workflows/${id}`, { method: 'PATCH', body }),
  triggerRun: (id: string, body: { input?: Record<string, unknown> }) =>
    api<RunRead>(`/workflows/${id}/run`, { method: 'POST', body }),
};

export const runsApi = {
  list: (params?: { workflow_id?: string; status?: RunStatus; limit?: number }) =>
    api<Run[]>('/runs', { query: params }),
  get: (id: string) => api<RunDetail>(`/runs/${id}`),
  cancel: (id: string) => api<Run>(`/runs/${id}/cancel`, { method: 'POST' }),
};

export const toolsApi = {
  list: () => api<Tool[]>('/tools'),
};

export type Channel       = components['schemas']['ChannelRead'];
export type ChannelCreate = components['schemas']['ChannelCreate'];
export type ChannelUpdate = components['schemas']['ChannelUpdate'];
export type ChannelKind   = components['schemas']['ChannelKind'];

export const channelsApi = {
  list: () => api<Channel[]>('/channels'),
  create: (body: ChannelCreate) =>
    api<Channel>('/channels', { method: 'POST', body }),
  update: (id: string, body: ChannelUpdate) =>
    api<Channel>(`/channels/${id}`, { method: 'PATCH', body }),
  remove: (id: string) =>
    api<void>(`/channels/${id}`, { method: 'DELETE' }),
};
