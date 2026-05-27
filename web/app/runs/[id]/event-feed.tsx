'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { WsEvent } from './use-run-events';
import type { MessageRead, ToolCallRead } from '@/lib/api/resources';

type FeedItem =
  | { kind: 'history-message'; data: MessageRead; ts: number }
  | { kind: 'history-toolcall'; data: ToolCallRead; ts: number }
  | { kind: 'live'; data: WsEvent };

interface EventFeedProps {
  messages: MessageRead[];
  toolCalls: ToolCallRead[];
  liveEvents: WsEvent[];
  agentsById: Map<string, string>;
}

function RoleBadge({ role }: { role: string }) {
  const cfg: Record<string, string> = {
    user: 'bg-fg-subtle/20 text-fg-muted',
    agent: 'bg-accent/20 text-accent',
    system: 'bg-elevated text-fg-subtle',
    tool: 'bg-green-500/20 text-green-400',
  };
  return (
    <span
      className={cn(
        'inline-block shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider',
        cfg[role] ?? cfg.system,
      )}
    >
      {role}
    </span>
  );
}

export function EventFeed({
  messages,
  toolCalls,
  liveEvents,
  agentsById,
}: EventFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, liveEvents.length]);

  const historicalItems: FeedItem[] = [
    ...messages.map((m) => ({
      kind: 'history-message' as const,
      data: m,
      ts: new Date(m.created_at).getTime(),
    })),
    ...toolCalls.map((t) => ({
      kind: 'history-toolcall' as const,
      data: t,
      ts: new Date(t.created_at).getTime(),
    })),
  ].sort((a, b) => a.ts - b.ts);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      {historicalItems.map((item) => {
        if (item.kind === 'history-message') {
          const m = item.data;
          return (
            <div key={m.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <RoleBadge role={m.role} />
                {m.agent_id && (
                  <span className="text-xs text-fg-subtle">
                    {agentsById.get(m.agent_id) ?? m.agent_id.slice(0, 8)}
                  </span>
                )}
                <span className="ml-auto font-mono text-xs text-fg-subtle">
                  {new Date(m.created_at).toLocaleTimeString()}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">
                {m.content}
              </p>
            </div>
          );
        }

        if (item.kind === 'history-toolcall') {
          const t = item.data;
          return (
            <div
              key={t.id}
              className="rounded-md border border-border bg-elevated/50 px-3 py-2 font-mono text-xs"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="text-green-400">⚙ {t.tool_name}</span>
                {t.duration_ms != null && (
                  <span className="ml-auto text-fg-subtle">
                    {Math.round(t.duration_ms)}ms
                  </span>
                )}
              </div>
              <p className="truncate text-fg-muted">
                {JSON.stringify(t.arguments).slice(0, 120)}
              </p>
              {t.error && <p className="mt-1 text-danger">Error: {t.error}</p>}
            </div>
          );
        }

        return null;
      })}

      {/* Live events streamed after initial load */}
      {liveEvents.map((ev, i) => {
        if (ev.type === 'message') {
          const p = ev.payload;
          return (
            <div
              key={`live-${i}`}
              className="flex animate-fade-in flex-col gap-1"
            >
              <div className="flex items-center gap-2">
                <RoleBadge role={p.role as string} />
                {Boolean(p.agent_name) && (
                  <span className="text-xs text-fg-subtle">
                    {p.agent_name as string}
                  </span>
                )}
                <span className="ml-auto font-mono text-xs text-fg-subtle">
                  {new Date(ev.ts).toLocaleTimeString()}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">
                {p.content as string}
              </p>
            </div>
          );
        }

        if (ev.type === 'tool_call') {
          const p = ev.payload;
          return (
            <div
              key={`live-${i}`}
              className="animate-fade-in rounded-md border border-border bg-elevated/50 px-3 py-2 font-mono text-xs"
            >
              <span className="text-green-400">⚙ {p.tool_name as string}</span>
              <p className="mt-1 truncate text-fg-muted">
                {JSON.stringify(p.arguments).slice(0, 120)}
              </p>
            </div>
          );
        }

        if (ev.type === 'agent_started') {
          return (
            <p
              key={`live-${i}`}
              className="animate-fade-in text-xs italic text-fg-subtle"
            >
              → {(ev.payload.agent_name as string) ?? 'Agent'} started
            </p>
          );
        }

        if (ev.type === 'agent_finished') {
          return (
            <p
              key={`live-${i}`}
              className="animate-fade-in text-xs italic text-fg-subtle"
            >
              ✓ {(ev.payload.agent_name as string) ?? 'Agent'} finished
            </p>
          );
        }

        return null;
      })}

      <div ref={bottomRef} />
    </div>
  );
}
