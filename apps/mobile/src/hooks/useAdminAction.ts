import { useCallback, useState } from 'react';
import { errText } from '../services/api';

export interface AdminAction {
  /** Key of the action currently running (row id, 'create', …) or null. */
  busy: string | null;
  err: string | null;
  ok: string | null;
  setErr: (m: string | null) => void;
  setOk: (m: string | null) => void;
  /** Runs `fn`, shows the error on failure, and calls `onDone` on success. */
  run: <T>(key: string, fn: () => Promise<T>, okMsg?: string, onDone?: (r: T) => void) => Promise<T | null>;
}

/**
 * One busy/error/success state per staff screen — every mutation goes through `run`, exactly
 * like the website's `useAdminAction` in apps/web/src/components/admin/admin-client.ts.
 *
 * Staff messages are English (the owner's rule for the panel), so a server error that carries
 * only Hindi gets the English copy when the API supplies one.
 */
export function useAdminAction(): AdminAction {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, okMsg?: string, onDone?: (r: T) => void): Promise<T | null> => {
      setBusy(key);
      setErr(null);
      setOk(null);
      try {
        const r = await fn();
        if (okMsg) setOk(okMsg);
        onDone?.(r);
        return r;
      } catch (e) {
        setErr(errText(e, true));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  return { busy, err, ok, setErr, setOk, run };
}
