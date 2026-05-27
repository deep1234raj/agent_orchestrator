'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const fieldBase =
  'w-full bg-bg/40 border border-border text-fg placeholder:text-fg-subtle ' +
  'rounded-md transition-colors ' +
  'focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(fieldBase, 'h-9 px-3 text-sm', className)}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      fieldBase,
      'min-h-[80px] px-3 py-2 text-sm resize-y leading-relaxed',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';