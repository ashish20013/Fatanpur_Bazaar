import type { ReactNode } from 'react';
import type { MeResponse } from '@fb/shared-types';
import { ProfileForm } from '@/components/ProfileForm';
import { getMe } from '@/lib/data';
import { dict } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Profile {
  id: number;
  name: string | null;
  phone: string;
  email: string | null;
  language: 'hi' | 'en';
  referralCode: string | null;
}

export default async function ProfilePage(): Promise<ReactNode> {
  const [lang, me] = await Promise.all([currentLang(), getMe()]);
  const t = dict(lang);
  const u = me as MeResponse;
  const profile: Profile = { id: u.id, name: u.name, phone: u.phone, email: null, language: lang, referralCode: u.referralCode };
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.account.profile}</h1>
      <ProfileForm lang={lang} profile={profile} />
    </div>
  );
}
