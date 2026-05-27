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
    user:   'bg-fg-subtle/20 text-fg-muted',
    agent:  'bg-accent/20 text-accent',
    system: 'bg-elevated text-fg-subtle',
    tool:   'bg-green-500/20 text-green-400',
  };
  return (
    <span
      className={cn(
        'inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider shrink-0',
        cfg[role] ?? cfg.system,
      )}
    >
      {role}
    </span>
  );
}

export function EventFeed({ messages, toolCalls, liveEvents, agentsById }: EventFeedProps) {
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
    <div className="flex flex-col gap-3 overflow-y-auto h-full pr-1">
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
                <span className="text-xs text-fg-subtle ml-auto font-mono">
                  {new Date(m.created_at).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-sm text-fg leading-relaxed whitespace-pre-wrap break-words">
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
              className="rounded-md border border-border bg-elevated/50 px-3 py-2 text-xs font-mono"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-green-400">⚙ {t.tool_name}</span>
                {t.duration_ms != null && (
                  <span className="text-fg-subtle ml-auto">{Math.round(t.duration_ms)}ms</span>
                )}
              </div>
              <p className="text-fg-muted truncate">
                {JSON.stringify(t.arguments).slice(0, 120)}
              </p>
              {t.error && <p className="text-danger mt-1">Error: {t.error}</p>}
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
            <div key={`live-${i}`} className="flex flex-col gap-1 animate-fade-in">
              <div className="flex items-center gap-2">
                <RoleBadge role={p.role as string} />
                {Boolean(p.agent_name) && (
                  <span className="text-xs text-fg-subtle">{p.agent_name as string}</span>
                )}
                <span className="text-xs text-fg-subtle ml-auto font-mono">
                  {new Date(ev.ts).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-sm text-fg leading-relaxed whitespace-pre-wrap break-words">
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
              className="rounded-md border border-border bg-elevated/50 px-3 py-2 text-xs font-mono animate-fade-in"
            >
              <span className="text-green-400">⚙ {p.tool_name as string}</span>
              <p className="text-fg-muted mt-1 truncate">
                {JSON.stringify(p.arguments).slice(0, 120)}
              </p>
            </div>
          );
        }

        if (ev.type === 'agent_started') {
          return (
            <p key={`live-${i}`} className="text-xs text-fg-subtle italic animate-fade-in">
              → {(ev.payload.agent_name as string) ?? 'Agent'} started
            </p>
          );
        }

        if (ev.type === 'agent_finished') {
          return (
            <p key={`live-${i}`} className="text-xs text-fg-subtle italic animate-fade-in">
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
