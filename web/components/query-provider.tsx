"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/*
 * QueryClient lives in a useState so it's stable across re-renders
 * but instance-per-tab. Defaults keep the UI feeling live without
 * over-fetching:
 *   staleTime: 10s  — repeat navigations within 10s use cache
 *   retry: 1        — one retry on transient failures, then surface
 *   refetchOnWindowFocus: true — keeps live data fresh when user returns
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
