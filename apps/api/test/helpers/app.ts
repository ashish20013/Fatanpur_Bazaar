import { setupTestEnv } from './env';

setupTestEnv(); // MUST run before any src/* import (env.ts validates at import time)

import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { Knex } from 'knex';
import type { AddressInfo } from 'node:net';
import { AppModule } from '../../src/app.module';
import { KNEX } from '../../src/database/knex.provider';
import { CACHE, type ICacheProvider } from '../../src/common/cache/cache.provider';

export interface TestApp {
  app: NestExpressApplication;
  db: Knex;
  baseUrl: string;
  cache: ICacheProvider;
  close(): Promise<void>;
}

/**
 * Boots the REAL Nest app (same module graph, guards, interceptors and filter as src/main.ts —
 * those are registered as APP_GUARD/APP_INTERCEPTOR/APP_FILTER providers on AppModule itself, so
 * booting AppModule directly already wires them). Only the Express-level bootstrap in main.ts is
 * re-created here, deliberately WITHOUT the 300/5min global IP rate limiter (main.ts §globalRateLimit)
 * — that middleware is not part of AppModule and would make concurrent/rapid test traffic flaky;
 * every per-route @RateLimit the tests care about is still enforced by RateLimitGuard + rate_limits.
 */
export async function createTestApp(): Promise<TestApp> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: false,
    logger: false,
  });
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: false });
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('v1');
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const db = app.get<Knex>(KNEX);
  const cache = app.get<ICacheProvider>(CACHE);
  return {
    app,
    db,
    baseUrl,
    cache,
    close: async () => {
      await app.close();
    },
  };
}

export interface ApiError {
  code: string;
  message: string;
  field?: string;
  ref?: string;
  data?: Record<string, unknown>;
}
export interface ApiEnvelope<T = unknown> {
  ok: boolean;
  data?: T;
  error?: ApiError;
  meta?: { page: number; perPage: number; total: number; hasMore: boolean };
}
export interface ApiResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: ApiEnvelope<T>;
}

export interface RequestOpts {
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

/** Every route lives under /v1 (main.ts setGlobalPrefix). */
export async function apiRequest<T = unknown>(baseUrl: string, method: string, path: string, opts: RequestOpts = {}): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...opts.headers };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.idempotencyKey) headers['x-idempotency-key'] = opts.idempotencyKey;
  const res = await fetch(`${baseUrl}/v1${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: ApiEnvelope<T>;
  try {
    body = (text ? JSON.parse(text) : {}) as ApiEnvelope<T>;
  } catch {
    body = { ok: false } as ApiEnvelope<T>;
  }
  return { status: res.status, headers: res.headers, body };
}

export const get = <T = unknown>(a: TestApp, path: string, o: RequestOpts = {}): Promise<ApiResponse<T>> => apiRequest<T>(a.baseUrl, 'GET', path, o);
export const post = <T = unknown>(a: TestApp, path: string, o: RequestOpts = {}): Promise<ApiResponse<T>> => apiRequest<T>(a.baseUrl, 'POST', path, o);
export const patch = <T = unknown>(a: TestApp, path: string, o: RequestOpts = {}): Promise<ApiResponse<T>> => apiRequest<T>(a.baseUrl, 'PATCH', path, o);
export const put = <T = unknown>(a: TestApp, path: string, o: RequestOpts = {}): Promise<ApiResponse<T>> => apiRequest<T>(a.baseUrl, 'PUT', path, o);
export const del = <T = unknown>(a: TestApp, path: string, o: RequestOpts = {}): Promise<ApiResponse<T>> => apiRequest<T>(a.baseUrl, 'DELETE', path, o);

export const idemKey = (): string => randomUUID();

/**
 * A rider can only be assigned once the shop has packed the order (A15: CONFIRMED → PREPARING →
 * READY_FOR_PICKUP → ASSIGNED). Tests that need an assignment walk the order there first, as staff.
 */
export async function toReadyForPickup(a: TestApp, staffToken: string, orderNumber: string): Promise<void> {
  for (const status of ['PREPARING', 'READY_FOR_PICKUP']) {
    const r = await patch(a, `/admin/orders/${orderNumber}/status`, { token: staffToken, body: { status } });
    if (r.status !== 200) throw new Error(`could not move ${orderNumber} to ${status}: ${r.status} ${JSON.stringify(r.body.error)}`);
  }
}
