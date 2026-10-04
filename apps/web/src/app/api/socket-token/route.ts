import { NextResponse, type NextRequest } from 'next/server';
import { AT_COOKIE } from '@/lib/session';

/**
 * Socket.IO handshake ko token chahiye (A20) aur handshake browser se hota hai.
 * Isliye SIRF short-lived ACCESS token (15 min) yahan se milta hai — page ki memory me rehta hai,
 * jaisa §8 kehta hai ("access memory me"). ⚠️ Refresh token yahan se kabhi nahi jaata,
 * aur koi bhi token localStorage me nahi rakha jaata.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(AT_COOKIE)?.value;
  if (!token) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'पहले लॉगिन करें' } }, { status: 401 });
  return NextResponse.json({ ok: true, data: { token } }, { headers: { 'cache-control': 'no-store' } });
}
