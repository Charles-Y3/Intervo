import webpush from 'web-push';
import type { Env, Result } from './handlers.js';
import type { PushRecord, Sender } from './core.js';

/** The little of Vercel's request/response objects we use (avoids a heavy @vercel/node dependency). */
export interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface Res {
  status(code: number): Res;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

export function readEnv(env: Record<string, string | undefined> = process.env): Env {
  return {
    VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: env.VAPID_SUBJECT,
    PUSH_CRON_SECRET: env.PUSH_CRON_SECRET,
  };
}

/** Body as an object whether Vercel parsed it or left it as text. */
export function jsonBody(req: Req): unknown {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body;
}

export function header(req: Req, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

/** Common wrapper: only POST (or GET where allowed), no caching, JSON errors instead of crashes. */
export async function respond(req: Req, res: Res, method: 'GET' | 'POST', run: () => Promise<Result> | Result) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== method) {
    res.setHeader('Allow', method);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const out = await run();
    res.status(out.status).json(out.body);
  } catch (err) {
    console.error('push api error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Server error' });
  }
}

/** High urgency wakes the phone promptly; TTL drops a reminder that could not be delivered within the hour. */
export const SEND_OPTIONS = { urgency: 'high', TTL: 3600 } as const;

/** The real sender, using the VAPID keys from the environment. */
export function makeSender(env: Env): Sender | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:admin@example.com', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return async (rec: PushRecord, payload: string) => {
    await webpush.sendNotification({ endpoint: rec.endpoint, keys: rec.keys }, payload, SEND_OPTIONS);
  };
}
