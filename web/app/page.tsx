import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Bot, GitBranch, Activity, ArrowRight } from 'lucide-react';

/*
 * Home / dashboard placeholder.
 *
 * The real dashboard (cost rollups, recent runs, etc.) lands later in
 * the polish pass. This page exists so the root URL isn't a 404 and
 * gives reviewers a sense of where to go next.
 */

const QUICK_LINKS = [
  {
    href: '/agents',
    icon: Bot,
    label: 'Agents',
    description:
      'Configure the personas that do the work — system prompt, model, tools, memory, guardrails.',
  },
  {
    href: '/workflows',
    icon: GitBranch,
    label: 'Workflows',
    description:
      'Wire agents into collaborative graphs with conditions and feedback loops.',
  },
  {
    href: '/runs',
    icon: Activity,
    label: 'Runs',
    description:
      'Watch executions live — agent messages, tool calls, and cost as it happens.',
  },
];

export default function Home() {
  return (
    <>
      <PageHeader
        title="Welcome"
        subtitle="A local-first platform for designing, running, and observing collaborative AI agents."
      />

      <div className="grid gap-4 md:grid-cols-3">
        {QUICK_LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-lg border border-border bg-surface/40 p-5 transition-colors hover:bg-surface hover:border-muted"
            >
              <Icon
                className="h-5 w-5 text-fg-muted group-hover:text-accent transition-colors"
                strokeWidth={1.75}
              />
              <h3 className="mt-4 font-display text-xl text-fg">
                {item.label}
              </h3>
              <p className="mt-2 text-sm text-fg-muted leading-relaxed">
                {item.description}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-fg-subtle group-hover:text-accent transition-colors">
                Open
                <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-10 rounded-lg border border-border bg-surface/40 p-5">
        <h3 className="font-display text-xl text-fg">First time here?</h3>
        <p className="mt-2 text-sm text-fg-muted leading-relaxed max-w-2xl">
          Two pre-built workflows are seeded on first boot: <span className="text-fg">Research &amp; Brief</span> (a
          three-agent flow you can trigger from Telegram) and <span className="text-fg">Daily Standup Summarizer</span>{' '}
          (a single agent on a cron schedule). Head to Workflows to see them.
        </p>
        <div className="mt-4">
          <Button asChild variant="primary" size="sm">
            <Link href="/workflows">Browse workflows</Link>
          </Button>
        </div>
      </div>
    </>
  );
}