import { MAX_SUBSCRIPTIONS, checkCronAuth, parseSubscribeBody, parseUnsubscribeBody, runSendDue } from './core.js';
import type { PushRecord, Sender, Store } from './core.js';

/** Route logic as plain functions: request facts in, { status, body } out.
 * The files in api/push/ only translate to and from Vercel's req/res. */
export interface Result {
  status: number;
  body: unknown;
}

export interface Env {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  PUSH_CRON_SECRET?: string;
}

const NOT_CONFIGURED: Result = { status: 503, body: { error: 'PUSH_NOT_CONFIGURED' } };

export function handleVapidKey(env: Env): Result {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return NOT_CONFIGURED;
  return { status: 200, body: { publicKey: env.VAPID_PUBLIC_KEY } };
}

export async function handleSubscribe(body: unknown, store: Store | null, nowMs: number): Promise<Result> {
  if (!store) return NOT_CONFIGURED;
  const parsed = parseSubscribeBody(body, nowMs);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const existing = await store.get(parsed.value.endpoint);
  // Cap the table so the open endpoint cannot be used to fill the database.
  if (!existing && (await store.count()) >= MAX_SUBSCRIPTIONS) return { status: 429, body: { error: 'too many subscriptions' } };
  const rec: PushRecord = {
    ...parsed.value,
    createdAt: existing?.createdAt ?? nowMs,
    // Changing only the time or days must not allow a second reminder today if one already fired.
    lastSentDate: existing?.lastSentDate,
  };
  await store.upsert(rec);
  return { status: 200, body: { status: 'ok' } };
}

export async function handleUnsubscribe(body: unknown, store: Store | null): Promise<Result> {
  if (!store) return NOT_CONFIGURED;
  const parsed = parseUnsubscribeBody(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  await store.remove(parsed.value.endpoint);
  return { status: 200, body: { status: 'ok' } };
}

export async function handleSendDue(
  providedSecret: unknown,
  env: Env,
  store: Store | null,
  send: Sender | null,
  nowMs: number,
): Promise<Result> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !store || !send) return NOT_CONFIGURED;
  const auth = checkCronAuth(providedSecret, env.PUSH_CRON_SECRET);
  if (auth === 'not-configured') return NOT_CONFIGURED;
  if (auth === 'forbidden') return { status: 403, body: { error: 'Forbidden' } };
  const report = await runSendDue(store, send, nowMs);
  return { status: 200, body: { status: 'ok', ...report } };
}
