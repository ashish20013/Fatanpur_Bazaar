import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Integration tests boot the REAL Nest app (src/app.module) against a real MySQL/MariaDB — never
 *
 *
 *
 * mocked. `loadEnv()` (src/config/env.ts) validates env at import time and calls process.exit(1)
 * on anything missing, so every required var must be set BEFORE the first `src/*` import.
 *
 * CI (.github/workflows/deploy.yml) already sets NODE_ENV, DB_*, secrets, ALLOWED_ORIGINS, STORAGE_PATH --
 * those are respected via `??=`. APP_URL/API_URL are NOT set by CI, so this always supplies them.
 * A bare local run (no env at all) gets full working defaults, mirroring apps/api/.env.example.
 */
export function setupTestEnv(): void {
  // These two are load-bearing for the whole suite and must always be exactly this value.
  process.env.NODE_ENV = 'test';
  process.env.TZ = 'Asia/Kolkata';

  // Config needs a real port number; the test app itself listens on an ephemeral port (app.ts: listen(0)).
  process.env.PORT ??= '3999';
  process.env.APP_NAME ??= 'Fatanpur Bazaar (test)';
  process.env.APP_URL ??= 'http://localhost:3001';
  process.env.API_URL ??= 'http://localhost:3000';
  process.env.ALLOWED_ORIGINS ??= 'http://localhost:3001';

  process.env.DB_HOST ??= '127.0.0.1';
  process.env.DB_PORT ??= '3306';
  process.env.DB_NAME ??= 'fb_test';
  process.env.DB_USER ??= 'fb';
  process.env.DB_PASSWORD ??= 'fbpass';
  process.env.DB_POOL_MIN ??= '2';
  process.env.DB_POOL_MAX ??= '8';

  // Three distinct 32+ char secrets (env.ts rejects anything matching /^(test|secret|...)$/i as a
  // WHOLE string, so these — which merely contain "test" as a substring — pass validation).
  process.env.JWT_SECRET ??= 'integration-test-jwt-secret-000000000000000000';
  process.env.JWT_REFRESH_SECRET ??= 'integration-test-refresh-secret-1111111111111111';
  process.env.APP_SECRET ??= 'integration-test-app-secret-22222222222222222222';
  process.env.ACCESS_TOKEN_TTL_SEC ??= '900';
  process.env.REFRESH_TOKEN_TTL_DAYS ??= '30';
  process.env.TRUST_PROXY ??= '1';

  process.env.SMS_DRIVER ??= 'null';
  process.env.VAPID_SUBJECT ??= 'mailto:support@fatanpurbazaar.com';
  process.env.MAP_PROVIDER ??= 'osm';
  // PaymentsService builds RazorpayProvider straight from these two env vars (not through the
  // validated Env), so the webhook HMAC test needs a real, known secret to sign against.
  process.env.GATEWAY_WEBHOOK_SECRET ??= 'integration-test-gateway-webhook-secret';

  const storage = process.env.STORAGE_PATH ?? join(tmpdir(), `fb-test-storage-${process.pid}`);
  process.env.STORAGE_PATH = storage;
  process.env.PUBLIC_UPLOAD_URL ??= '/uploads';
  process.env.UPLOAD_MAX_MB ??= '8';
  mkdirSync(storage, { recursive: true });

  process.env.SOCKET_PATH ??= '/socket';
  process.env.SOCKET_TRANSPORTS ??= 'websocket,polling';
  process.env.SOCKET_PING_INTERVAL ??= '25000';
  process.env.SOCKET_MAX_HTTP_BUFFER ??= '8192';

  process.env.LOG_LEVEL ??= 'error';
  process.env.SETUP_TOKEN ??= 'integration-test-setup-token-000';
  process.env.GIT_COMMIT ??= 'test';
  // Keep the queue's debounced auto-drain OFF (A26) — tests call QueueService.work() explicitly
  // so job processing (and its retry/backoff behaviour) is deterministic.
  delete process.env.QUEUE_INLINE;
}
