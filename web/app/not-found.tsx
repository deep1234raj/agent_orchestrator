import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-subtle">
        404
      </p>
      <h1 className="mt-4 font-display text-5xl tracking-tight text-fg">
        Not here.
      </h1>
      <p className="mt-3 text-sm text-fg-muted max-w-sm">
        This page either doesn't exist yet, or you've followed a stale link.
      </p>
      <Button asChild variant="primary" className="mt-8">
        <Link href="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}