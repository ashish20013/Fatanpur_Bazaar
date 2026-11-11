import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { api, ApiError, errText } from '../../services/api';
import { useAdminAction } from '../../hooks/useAdminAction';
import { AdminScreen, Btn, Card, Empty, Pill, Row } from '../../components/admin/AdminKit';
import { space } from '../../theme/tokens';

interface Post { id: number; title: string; slug: string; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; publishedAt: string | null; views: number }
interface Faq { id: number; question: string; answer: string; pageScope: string | null; sortOrder: number; isActive: 0 | 1 }
/** ⚠️ GET /admin/content/messages returns the contact_messages rows as they are — snake_case,
 *  with a NEW | IN_PROGRESS | RESOLVED status, not a `handledAt` stamp. */
interface Msg {
  id: number;
  name: string | null;
  phone: string;
  subject: string | null;
  message: string;
  order_number: string | null;
  status: 'NEW' | 'IN_PROGRESS' | 'RESOLVED';
  admin_note: string | null;
  created_at: string;
}

/**
 * Blog, pages & FAQ (GET /admin/content/*).
 *
 * Writing a 400-word post on a phone is not a thing anyone does, so this screen is the half
 * that is useful away from a desk: see what is published, and answer the messages customers
 * have left — including the "we do not stock this" notes from a zero-result search (A10),
 * which are the shop's next buying list.
 */
export default function AdminContentScreen(): React.JSX.Element {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [faqs, setFaqs] = useState<Faq[] | null>(null);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const { busy, err, ok, setErr, run } = useAdminAction();

  const load = useCallback(async () => {
    try {
      const [p, f, m] = await Promise.all([
        api.get<Post[]>('/admin/content/posts').catch(() => [] as Post[]),
        api.get<Faq[]>('/admin/content/faqs').catch(() => [] as Faq[]),
        api.get<Msg[]>('/admin/content/messages').catch(() => [] as Msg[]),
      ]);
      setPosts(p); setFaqs(f); setMsgs(m);
    } catch (e) { setErr(errText(e, true)); }
  }, [setErr]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AdminScreen title="Blog, pages & FAQ" err={err} ok={ok} loading={posts === null}>
      <View style={{ gap: space[2] }}>
        <Row label="Messages" value={`${msgs?.length ?? 0} from customers`} strong />
        {msgs && msgs.length === 0 ? <Empty text="No messages." /> : null}
        {msgs?.map((m) => (
          <Card key={m.id}>
            <Row label="From" value={`${m.name ?? '—'} · ${m.phone}`} strong />
            <Row label="Message" value={m.message} />
            {m.subject ? <Row label="About" value={m.subject} /> : null}
            {m.order_number ? <Row label="Order" value={m.order_number} /> : null}
            <Row label="When" value={new Date(m.created_at.includes('T') ? m.created_at : m.created_at.replace(' ', 'T') + 'Z').toLocaleString('en-IN')} />
            <Row label="Status" value={<Pill text={m.status} tone={m.status === 'RESOLVED' ? 'ok' : m.status === 'IN_PROGRESS' ? 'warn' : 'info'} />} />
            {/* ⚠️ The endpoint takes a status from NEW | IN_PROGRESS | RESOLVED. `{ handled: true }`
                was refused, so nothing could be closed off from the phone. */}
            {m.status !== 'RESOLVED' ? (
              <Btn label="Mark resolved" tone="secondary" icon="check" busy={busy === `m-${m.id}`}
                onPress={() => void run(`m-${m.id}`, () => api.patch(`/admin/content/messages/${m.id}`, { status: 'RESOLVED' }), 'Marked resolved', () => void load())} />
            ) : null}
          </Card>
        ))}
      </View>

      <View style={{ gap: space[2] }}>
        <Row label="Blog posts" value={`${posts?.length ?? 0}`} strong />
        {posts?.map((p) => (
          <Card key={p.id}>
            <Row label="Title" value={p.title} strong />
            <Row label="Status" value={<Pill text={p.status} tone={p.status === 'PUBLISHED' ? 'ok' : 'muted'} />} />
            <Row label="Views" value={p.views} />
          </Card>
        ))}
      </View>

      <View style={{ gap: space[2] }}>
        <Row label="FAQs" value={`${faqs?.length ?? 0}`} strong />
        {faqs?.map((f) => (
          <Card key={f.id}>
            <Row label="Question" value={f.question} />
            <Row label="Active" value={<Pill text={f.isActive === 1 ? 'Yes' : 'No'} tone={f.isActive === 1 ? 'ok' : 'muted'} />} />
          </Card>
        ))}
      </View>
    </AdminScreen>
  );
}
