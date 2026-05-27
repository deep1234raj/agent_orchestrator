"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
 * Button.
 *
 * Variants tuned to the editorial-utilitarian aesthetic:
 *   - primary: warm amber, used sparingly — primary CTA only
 *   - secondary: subtle surface, used for routine actions
 *   - ghost: text-only, used for navigation and toolbar actions
 *   - danger: red, for destructive confirmation
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium " +
    "transition-colors disabled:pointer-events-none disabled:opacity-50 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
    "focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg hover:bg-accent/90 active:bg-accent/80",
        secondary:
          "bg-elevated border border-border text-fg hover:bg-muted/40 active:bg-muted/60",
        ghost:
          "text-fg-muted hover:text-fg hover:bg-elevated/60 active:bg-elevated",
        danger:
          "bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20",
        outline:
          "border border-border bg-transparent text-fg hover:bg-elevated/60",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded",
        md: "h-9 px-4 text-sm rounded-md",
        lg: "h-10 px-5 text-sm rounded-md",
        icon: "h-9 w-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
