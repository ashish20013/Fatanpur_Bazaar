import { LRUCache } from 'lru-cache';

/** ICacheProvider — in-process LRU today; a Redis implementation can drop in on a VPS. */
export interface ICacheProvider {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
  del(key: string): void;
  delPrefix(prefix: string): void;
  wrap<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
}

export const CACHE = Symbol('CACHE');

export class LruCacheProvider implements ICacheProvider {
  private readonly lru = new LRUCache<string, { v: unknown }>({ max: 5000, ttlAutopurge: false });
  private readonly inflight = new Map<string, Promise<unknown>>();

  get<T>(key: string): T | undefined {
    return this.lru.get(key)?.v as T | undefined;
  }
  set<T>(key: string, value: T, ttlMs: number): void {
    this.lru.set(key, { v: value }, { ttl: ttlMs });
  }
  del(key: string): void {
    this.lru.delete(key);
  }
  delPrefix(prefix: string): void {
    for (const k of this.lru.keys()) if (k.startsWith(prefix)) this.lru.delete(k);
  }
  /** Single-flight: concurrent misses for the same key share one loader call. */
  async wrap<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = this.lru.get(key);
    if (hit) return hit.v as T;
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;
    const p = fn()
      .then((v) => {
        this.set(key, v, ttlMs);
        return v;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}
