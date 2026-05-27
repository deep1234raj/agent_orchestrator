import { cn } from "@/lib/utils";

/*
 * Page header.
 *
 * Title (display serif) + subtitle + actions slot. Sets the cadence
 * for every page in the app. The thin amber underline tying title
 * to subtitle is the recurring visual motif.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-border mb-8",
        className,
      )}
    >
      <div>
        <h1 className="font-display text-4xl tracking-tight leading-none text-fg">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-3 text-sm text-fg-muted max-w-xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
