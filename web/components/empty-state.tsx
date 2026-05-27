import { cn } from "@/lib/utils";

/*
 * Empty state.
 *
 * Used when a list page has zero items. Centered, generous whitespace,
 * with a contextual icon and an optional CTA. The thin dashed border
 * signals "this is intentionally empty, not broken."
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        "border border-dashed border-border rounded-lg",
        "py-16 px-6",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 text-fg-subtle [&>svg]:h-10 [&>svg]:w-10">
          {icon}
        </div>
      )}
      <h2 className="font-display text-xl text-fg">{title}</h2>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-fg-muted leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
