import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Log } from '../../common/logger';

/** ISmsProvider — OTP delivery. 'null' writes to a private dev log (never in production). */
export interface ISmsProvider {
  sendOtp(phone10: string, otp: string): Promise<void>;
}

export class NullSmsProvider implements ISmsProvider {
  constructor(
    private readonly storagePath: string,
    private readonly production: boolean,
  ) {}
  async sendOtp(phone10: string, otp: string): Promise<void> {
    // SECURITY_AUDIT §2/R2: in production there is no silent fallback — no SMS provider, no login.
    if (this.production) throw new Error('SMS driver is null in production');
    const dir = join(this.storagePath, 'logs');
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, 'otp-dev.log'), `${new Date().toISOString()} ${phone10} ${otp}\n`, { mode: 0o600 });
  }
}

export class Fast2SmsProvider implements ISmsProvider {
  constructor(private readonly apiKey: string, private readonly senderId?: string, private readonly templateId?: string) {}
  async sendOtp(phone10: string, otp: string): Promise<void> {
    const body = this.templateId
      ? { route: 'dlt', sender_id: this.senderId, message: this.templateId, variables_values: otp, numbers: phone10, flash: 0 }
      : { route: 'otp', variables_values: otp, numbers: phone10, flash: 0 };
    const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: { authorization: this.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await res.json().catch(() => ({}))) as { return?: boolean; message?: unknown };
    if (!res.ok || j.return !== true) {
      Log.warn('sms.fast2sms_failed', { status: res.status });
      throw new Error(`fast2sms ${res.status}`);
    }
  }
}

export class Msg91Provider implements ISmsProvider {
  constructor(private readonly authKey: string, private readonly templateId: string) {}
  async sendOtp(phone10: string, otp: string): Promise<void> {
    const url = `https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(this.templateId)}&mobile=91${phone10}&otp=${otp}`;
    const res = await fetch(url, { method: 'POST', headers: { authkey: this.authKey, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10_000) });
    const j = (await res.json().catch(() => ({}))) as { type?: string };
    if (!res.ok || j.type === 'error') {
      Log.warn('sms.msg91_failed', { status: res.status });
      throw new Error(`msg91 ${res.status}`);
    }
  }
}
