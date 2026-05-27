'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/*
 * Global error boundary.
 *
 * Catches unhandled errors in any page. We show the message but never
 * the stack — stacks belong in the logs, not the UI.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-lg border border-danger/30 bg-danger/5 p-6 max-w-xl mx-auto mt-12">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h2 className="font-display text-xl text-fg">Something went wrong</h2>
          <p className="mt-2 text-sm text-fg-muted">{error.message}</p>
          {error.digest && (
            <p className="mt-2 text-xs font-mono text-fg-subtle">
              digest: {error.digest}
            </p>
          )}
          <Button onClick={reset} variant="secondary" className="mt-4">
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}