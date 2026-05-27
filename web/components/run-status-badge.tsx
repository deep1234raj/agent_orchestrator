import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { RunStatus } from '@/lib/api/resources';

const STATUS_CONFIG: Record<RunStatus, { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'border-fg-subtle/30 text-fg-subtle bg-elevated' },
  running:   { label: 'Running',   className: 'border-accent/40 text-accent bg-accent/10 animate-pulse' },
  succeeded: { label: 'Succeeded', className: 'border-green-500/30 text-green-400 bg-green-500/10' },
  failed:    { label: 'Failed',    className: 'border-danger/30 text-danger bg-danger/10' },
  cancelled: { label: 'Cancelled', className: 'border-fg-subtle/30 text-fg-subtle bg-elevated' },
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <Badge variant="outline" className={cn('font-mono text-xs', cfg.className)}>
      {cfg.label}
    </Badge>
  );
}
