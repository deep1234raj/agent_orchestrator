'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { agentsApi } from '@/lib/api/resources';
import { ApiException } from '@/lib/api/client';
import type { Agent } from '@/lib/api/resources';

export function RegisterWebhookButton({ agent }: { agent: Agent }) {
  const savedToken =
    (agent.channel_config as Record<string, string> | undefined)?.bot_token ??
    '';

  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [botToken, setBotToken] = useState(savedToken);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setBotToken(savedToken);
    } else {
      setBaseUrl('');
      setResult(null);
    }
  }

  async function handleRegister() {
    setLoading(true);
    setResult(null);
    try {
      const data = await agentsApi.registerWebhook(agent.id, baseUrl, botToken);
      setResult({
        ok: true,
        message: data.description ?? 'Webhook registered.',
      });
    } catch (err) {
      setResult({
        ok: false,
        message:
          err instanceof ApiException
            ? err.detail
            : 'Failed to register webhook.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Register Webhook
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register Telegram Webhook</DialogTitle>
          <DialogDescription>
            Calls Telegram&apos;s <span className="font-mono">setWebhook</span>{' '}
            to point your bot at this server.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="reg-bot-token">Bot Token</Label>
            <Input
              id="reg-bot-token"
              type="password"
              placeholder="123456:ABC..."
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
            />
            <p className="text-xs text-fg-subtle">
              Pre-filled from the Channel section. Format:{' '}
              <span className="font-mono">botId:token</span>.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg-base-url">Base URL</Label>
            <Input
              id="reg-base-url"
              placeholder="https://xxx.ngrok-free.app"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <p className="text-xs text-fg-subtle">
              Your public server URL. Webhook will be registered at{' '}
              <span className="break-all font-mono">
                {baseUrl || '<base_url>'}/webhooks/telegram/{agent.id}
              </span>
              .
            </p>
          </div>
          <Button
            onClick={handleRegister}
            disabled={loading || !baseUrl.trim() || !botToken.trim()}
          >
            {loading ? 'Registering…' : 'Register Webhook'}
          </Button>
          {result && (
            <p
              className={cn(
                'text-sm',
                result.ok ? 'text-success' : 'text-danger',
              )}
            >
              {result.message}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
