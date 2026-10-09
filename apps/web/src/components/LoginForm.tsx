'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthUser, OtpSendResponse } from '@fb/shared-types';
import { dict, type Lang } from '@/lib/i18n';
import { safeNext } from '@/lib/safe-next';
import { Icon } from './icons';
import { buttonClass } from './ui';

/**
 * Phone + OTP. ⚠️ Yahan `role` naam ka koi field hai hi nahi — public registration
 * sirf CUSTOMER banata hai (§2). OTP kabhi response me nahi aata; dev me server log me jaata hai.
 */
interface VerifyOut {
  user: AuthUser;
  redirect: string;
  isNewUser: boolean;
}

async function post<T>(action: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/auth/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'fb-web' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    // The browser's own text here is English ("Failed to fetch") and means nothing to somebody on
    // a village 3G connection that just dropped. Say what happened, in his language.
    throw new Error('इंटरनेट नहीं चल रहा — नेटवर्क देखकर दोबारा कोशिश करें');
  }
  const json = (await res.json().catch(() => null)) as {
    ok: boolean;
    data?: T;
    error?: { message: string };
  } | null;
  if (!res.ok || !json?.ok || !json.data) throw new Error(json?.error?.message ?? 'कुछ गड़बड़ हो गई');
  return json.data;
}

export function LoginForm({ lang, next }: { lang: Lang; next?: string }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [referral, setReferral] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /*
   * Where staff land after logging in.
   *
   * A customer goes straight through — one more screen between him and his shopping is one more
   * chance to leave. Staff get asked, because the shopkeeper and his admin also buy their own
   * groceries here, and until now the panel swallowed them: signing in on their own phone dropped
   * them into an orders dashboard with no way back to the shop except by editing the URL.
   *
   * ⚠️ The check happens AFTER the OTP, never before it, and that is deliberate. Asking "staff or
   * customer?" from the phone number alone would answer a question nobody should be able to ask
   * the shop: type a number, see whether the staff option appears, and you have learnt who works
   * here. A2 requires the send/verify replies to be identical for a registered and an unregistered
   * number for exactly this reason. Once the OTP is verified the person has proved the number is
   * theirs, and the two buttons cost them one tap.
   */
  const [choice, setChoice] = useState<{ user: AuthUser; redirect: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function send(): Promise<void> {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setErr(t.auth.phoneHint);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await post<OtpSendResponse>('otp-send', { phone });
      setCooldown(r.resendAfter ?? 60);
      setStep('otp');
    } catch (e) {
      setErr(e instanceof Error ? e.message : t.common.error);
    } finally {
      setBusy(false);
    }
  }

  async function verify(): Promise<void> {
    if (!/^\d{6}$/.test(otp)) {
      setErr(t.auth.otp);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await post<VerifyOut>('otp-verify', {
        phone,
        otp,
        name: name.trim() || undefined,
        referralCode: referral.trim() || undefined,
      });
      // ⚠️ Redirect backend ke role se aata hai — client apna role tay nahi karta.
      // ⚠️ `next` is sanitised: only same-site paths (no //host, no scheme) — no open redirect.
      if (r.user.role === 'CUSTOMER') {
        router.replace(safeNext(next) ?? r.redirect);
        router.refresh();
        return;
      }
      // Staff choose. This is presentation only — which screens they may actually open is decided
      // by the guards on the server, and picking "shop as a customer" takes nothing away from them.
      setChoice({ user: r.user, redirect: r.redirect });
    } catch (e) {
      setErr(e instanceof Error ? e.message : t.common.error);
    } finally {
      setBusy(false);
    }
  }

  const field =
    'h-12 w-full rounded border border-line-2 bg-card px-3 text-body outline-none transition-colors duration-150 focus:border-em-600';

  function go(to: string): void {
    router.replace(to);
    router.refresh();
  }

  if (choice) {
    const isAdmin = choice.user.role === 'ADMIN';
    return (
      <div className="space-y-4">
        <div>
          <h1 className="fb-display text-3xl text-ink">{t.auth.welcomeBack(choice.user.name || '')}</h1>
          <p className="mt-1 text-base text-ink-2">{t.auth.choose}</p>
        </div>
        <button type="button" onClick={() => go(choice.redirect)} className="fb-choice">
          <span className="fb-choice-ico">
            <Icon name={isAdmin ? 'layout-dashboard' : 'clipboard-list'} size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-body font-semibold text-ink">
              {isAdmin ? t.auth.goPanel : t.auth.goPanelStaff}
            </span>
            <span className="block text-sm text-ink-3">{t.auth.goPanelHint}</span>
          </span>
          <Icon name="chevron-right" size={18} className="ml-auto shrink-0 text-ink-3" />
        </button>
        <button type="button" onClick={() => go(safeNext(next) ?? '/')} className="fb-choice">
          <span className="fb-choice-ico">
            <Icon name="shopping-bag" size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-body font-semibold text-ink">{t.auth.goShop}</span>
            <span className="block text-sm text-ink-3">{t.auth.goShopHint}</span>
          </span>
          <Icon name="chevron-right" size={18} className="ml-auto shrink-0 text-ink-3" />
        </button>
        <p className="text-sm text-ink-3">{t.auth.switchAnytime}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="fb-display text-3xl text-ink">{t.auth.login}</h1>
        <p className="mt-1 text-base text-ink-2">{t.auth.lead}</p>
      </div>

      {step === 'phone' ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="block text-base font-semibold" htmlFor="fb-phone-login">
            {t.auth.phone}
          </label>
          <div className="flex h-12 items-center overflow-hidden rounded border border-line-2 bg-card focus-within:border-em-600">
            <span className="grid h-full place-items-center border-r border-line bg-paper-2 px-3 text-body font-semibold text-ink-2">
              +91
            </span>
            <input
              id="fb-phone-login"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="98765 43210"
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-lg tabular-nums tracking-wide outline-none"
            />
          </div>
          <button type="submit" disabled={busy} className={buttonClass('primary', 'lg', true)}>
            {t.auth.sendOtp} <Icon name="arrow-right" size={18} />
          </button>
        </form>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <p className="flex flex-wrap items-center gap-2 text-base text-ink-2">
            {t.auth.otpSent(`+91 ${phone}`)}
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setOtp('');
                setErr(null);
              }}
              className="font-semibold text-em-700 underline underline-offset-2"
            >
              {t.auth.changeNumber}
            </button>
          </p>
          <label className="block text-base font-semibold" htmlFor="fb-otp">
            {t.auth.otp}
          </label>
          <input
            id="fb-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="• • • • • •"
            className={`${field} h-14 text-center text-2xl tabular-nums tracking-[0.5em]`}
          />
          <details className="group rounded border border-line bg-paper/60 px-3 py-2">
            <summary className="cursor-pointer list-none text-base font-semibold text-em-800">
              <Icon name="user-plus" size={16} className="mr-1 inline" /> {t.auth.firstTime}
            </summary>
            <div className="mt-2 space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.auth.name}
                aria-label={t.auth.name}
                autoComplete="name"
                className={field}
              />
              <input
                value={referral}
                onChange={(e) => setReferral(e.target.value.toUpperCase())}
                placeholder={t.auth.referral}
                aria-label={t.auth.referral}
                className={field}
              />
            </div>
          </details>
          <button type="submit" disabled={busy} className={buttonClass('primary', 'lg', true)}>
            {t.auth.verify} <Icon name="arrow-right" size={18} />
          </button>
          <button
            type="button"
            disabled={cooldown > 0 || busy}
            onClick={() => void send()}
            className={buttonClass('ghost', 'sm', true)}
          >
            {cooldown > 0 ? t.auth.resendIn(cooldown) : t.auth.resend}
          </button>
        </form>
      )}

      {err ? (
        <p
          role="alert"
          className="rounded border border-[#f3c9c4] bg-[#fdf0ee] px-3 py-2 text-base font-semibold text-danger"
        >
          {err}
        </p>
      ) : null}
      {/* <p className="text-sm text-ink-3">{t.auth.terms}</p> */}
    </div>
  );
}
