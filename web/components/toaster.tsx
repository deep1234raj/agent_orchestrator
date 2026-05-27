'use client';

import { Toaster as SonnerToaster } from 'sonner';

/*
 * AAOP toast configuration.
 *
 * Sonner ships with reasonable defaults; we override colors to match
 * the surface tokens and keep toasts in the bottom-right where they
 * don't interfere with form interactions.
 */
export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      richColors
      toastOptions={{
        classNames: {
          toast:
            'bg-elevated border border-border text-fg font-sans text-sm shadow-xl shadow-black/40',
          title: 'text-fg font-medium',
          description: 'text-fg-muted',
        },
      }}
    />
  );
}