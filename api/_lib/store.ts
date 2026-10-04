import { Redis } from '@upstash/redis';
import { sanitizeRecord } from './core.js';
import type { PushRecord, Store } from './core.js';

/** In-memory store, for tests. */
export class MemoryStore implements Store {
  private map = new Map<string, PushRecord>();
  async get(endpoint: string) {
    return this.map.get(endpoint) ?? null;
  }
  async upsert(rec: PushRecord) {
    this.map.set(rec.endpoint, { ...rec });
  }
  async remove(endpoint: string) {
    this.map.delete(endpoint);
  }
  async list() {
    return [...this.map.values()].map((r) => ({ ...r }));
  }
  async count() {
    return this.map.size;
  }
  async markSent(endpoint: string, date: string) {
    const r = this.map.get(endpoint);
    if (r) r.lastSentDate = date;
  }
}

/** Upstash Redis: durable across serverless cold starts. One hash, keyed by endpoint.
 * The key is prefixed so Intervo can share a database with other apps. */
export class RedisStore implements Store {
  private redis: Redis;
  private key = 'intervo:push_subscriptions';

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  private parse(raw: unknown): PushRecord | null {
    try {
      return sanitizeRecord(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch {
      return null;
    }
  }

  async get(endpoint: string) {
    return this.parse(await this.redis.hget(this.key, endpoint));
  }
  async upsert(rec: PushRecord) {
    await this.redis.hset(this.key, { [rec.endpoint]: JSON.stringify(rec) });
  }
  async remove(endpoint: string) {
    await this.redis.hdel(this.key, endpoint);
  }
  async list() {
    const all = (await this.redis.hgetall(this.key)) as Record<string, unknown> | null;
    if (!all) return [];
    return Object.values(all)
      .map((v) => this.parse(v))
      .filter((r): r is PushRecord => r !== null);
  }
  async count() {
    return Number(await this.redis.hlen(this.key));
  }
  async markSent(endpoint: string, date: string) {
    const rec = await this.get(endpoint);
    if (rec) await this.upsert({ ...rec, lastSentDate: date });
  }
}

let cached: Store | null = null;

/** The configured store, or null when no Redis is set up (the API then answers 503). */
export function getStore(env: Record<string, string | undefined> = process.env): Store | null {
  if (cached) return cached;
  // Vercel's Upstash integration injects UPSTASH_REDIS_REST_*; the older KV product, KV_REST_API_*.
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  cached = new RedisStore(url, token);
  return cached;
}
