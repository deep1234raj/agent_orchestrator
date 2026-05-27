'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const WS_BASE = API_URL.replace(/^http/, 'ws');

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

export type WsEventType =
  | 'status'
  | 'message'
  | 'tool_call'
  | 'tool_result'
  | 'agent_started'
  | 'agent_finished'
  | 'usage';

export interface WsEvent {
  run_id: string;
  ts: string;
  type: WsEventType;
  payload: Record<string, unknown>;
}

export interface UseRunEventsResult {
  liveEvents: WsEvent[];
  activeAgentId: string | null;
  liveCostDelta: number;
  liveTokensDelta: number;
  liveStatus: string | null;
  isConnected: boolean;
}

export function useRunEvents(runId: string, initialStatus: string): UseRunEventsResult {
  const [liveEvents, setLiveEvents] = useState<WsEvent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [liveCostDelta, setLiveCostDelta] = useState(0);
  const [liveTokensDelta, setLiveTokensDelta] = useState(0);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const handleEvent = useCallback((event: WsEvent) => {
    setLiveEvents((prev) => [...prev, event]);

    switch (event.type) {
      case 'agent_started':
        setActiveAgentId(event.payload.agent_id as string);
        break;
      case 'agent_finished':
        setActiveAgentId(null);
        break;
      case 'status':
        setLiveStatus(event.payload.status as string);
        break;
      case 'usage':
        setLiveCostDelta((c) => c + ((event.payload.cost_usd as number) ?? 0));
        setLiveTokensDelta(
          (t) =>
            t +
            ((event.payload.input_tokens as number) ?? 0) +
            ((event.payload.output_tokens as number) ?? 0),
        );
        break;
    }
  }, []);

  useEffect(() => {
    if (TERMINAL.has(initialStatus)) return;

    const ws = new WebSocket(`${WS_BASE}/ws/runs/${runId}`);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onmessage = (msg: MessageEvent<string>) => {
      try {
        const event = JSON.parse(msg.data) as WsEvent;
        handleEvent(event);
        if (event.type === 'status' && TERMINAL.has(event.payload.status as string)) {
          ws.close();
        }
      } catch {
        // malformed frame — skip
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [runId, initialStatus, handleEvent]);

  return { liveEvents, activeAgentId, liveCostDelta, liveTokensDelta, liveStatus, isConnected };
}
