'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ApiResponse } from '@fb/shared-types';
import { ClientError, errText } from '@/lib/client';

/**
 * Multipart upload through the BFF. `call()` always JSON-encodes, so files go through here.
 * ⚠️ No content-type header: the browser must set the multipart boundary itself. The BFF forwards the
 * bytes untouched and still requires `x-requested-with` for every non-GET (CSRF guard).
 */
export async function upload<T>(path: string, fd: FormData): Promise<T> {
  const res = await fetch(`/api/bff${path.startsWith('/') ? path : `/${path}`}`, {
    method: 'POST',
    body: fd,
    headers: { 'x-requested-with': 'fb-web' },
    credentials: 'same-origin',
  });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json || json.ok !== true) {
    const err = json && json.ok === false ? json.error : null;
    const fallback = res.status === 413 ? 'File is too large' : 'Upload failed';
    throw new ClientError(err?.code ?? 'INTERNAL', err?.message ?? fallback, res.status, err?.data, err?.messageEn ?? (err ? undefined : fallback), err?.field);
  }
  return json.data;
}

export interface AdminAction {
  /** Key of the action currently running (row id, 'create', …) or null. */
  busy: string | null;
  err: string | null;
  ok: string | null;
  setErr: (m: string | null) => void;
  setOk: (m: string | null) => void;
  /** Runs `fn`, shows the English error on failure, refreshes server data on success. */
  run: <T>(key: string, fn: () => Promise<T>, okMsg?: string | ((r: T) => string)) => Promise<T | null>;
}

/** One busy/error/success state per admin screen — every mutation goes through `run`. */
export function useAdminAction(refresh = true): AdminAction {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, okMsg?: string | ((r: T) => string)): Promise<T | null> => {
      setBusy(key);
      setErr(null);
      setOk(null);
      try {
        const r = await fn();
        if (okMsg) setOk(typeof okMsg === 'function' ? okMsg(r) : okMsg);
        if (refresh) router.refresh();
        return r;
      } catch (e) {
        setErr(errText(e, 'en'));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [router, refresh],
  );

  return { busy, err, ok, setErr, setOk, run };
}

/** Empty text → undefined (API optional fields reject null where not nullable). */
export function opt(v: string): string | undefined {
  const s = v.trim();
  return s ? s : undefined;
}

/** Empty text → null (API nullable fields: clearing a value must really clear it). */
export function nul(v: string): string | null {
  const s = v.trim();
  return s ? s : null;
}
