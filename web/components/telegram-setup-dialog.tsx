'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiException } from '@/lib/api/client';

type SetupResponse = { ok: boolean; description?: string };

export function TelegramSetupDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setBaseUrl('');
      setStatus(null);
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setStatus(null);
    try {
      const data = await api<SetupResponse>('/webhooks/telegram/setup', {
        method: 'POST',
        body: { base_url: baseUrl },
      });
      setStatus({ ok: true, message: `Webhook registered: ${data.description ?? baseUrl}` });
    } catch (err) {
      const message =
        err instanceof ApiException ? err.detail : 'Failed to register webhook.';
      setStatus({ ok: false, message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register Telegram Webhook</DialogTitle>
          <DialogDescription>Point Telegram at this server&apos;s webhook endpoint.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="base-url">Base URL</Label>
            <Input
              id="base-url"
              placeholder="https://xxx.ngrok-free.app"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <Button onClick={handleSubmit} disabled={loading || !baseUrl.trim()}>
            {loading ? 'Registering…' : 'Register Webhook'}
          </Button>
          {status && (
            <p className={status.ok ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
              {status.message}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
