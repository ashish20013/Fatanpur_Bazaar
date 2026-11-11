import React, { useCallback, useEffect, useState } from 'react';
import { Image } from 'react-native';
import { api, ApiError, errText } from '../../services/api';
import { assetUrl } from '../../config';
import { useAdminAction } from '../../hooks/useAdminAction';
import { AdminScreen, Btn, Card, Empty, Row } from '../../components/admin/AdminKit';
import { radius } from '../../theme/tokens';

interface BannerRow {
  id: number; title: string; subtitle: string | null; image_url: string | null;
  link_url: string | null; position: string; sort_order: number; is_active: 0 | 1;
}

/**
 * Banners (GET /admin/banners, DELETE /admin/banners/:id).
 * Uploading a new banner needs a file picker and a 1280×200 crop — that belongs on the website,
 * where the owner can see what he is cropping. Here he can see what is running and pull one.
 */
export default function AdminBannersScreen(): React.JSX.Element {
  const [rows, setRows] = useState<BannerRow[] | null>(null);
  const { busy, err, ok, setErr, run } = useAdminAction();

  const load = useCallback(async () => {
    try { setRows(await api.get<BannerRow[]>('/admin/banners')); }
    catch (e) { setErr(errText(e, true)); }
  }, [setErr]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AdminScreen title="Banners" err={err} ok={ok} loading={rows === null}>
      {rows && rows.length === 0 ? <Empty text="No banners." /> : null}
      {rows?.map((b) => (
        <Card key={b.id}>
          {b.image_url ? (
            <Image source={{ uri: assetUrl(b.image_url) }} style={{ width: '100%', aspectRatio: 6.4, borderRadius: radius.sm }} resizeMode="cover" accessibilityLabel={b.title} />
          ) : null}
          <Row label="Title" value={b.title} strong />
          {b.subtitle ? <Row label="Subtitle" value={b.subtitle} /> : null}
          {b.link_url ? <Row label="Links to" value={b.link_url} /> : null}
          <Row label="Position" value={b.position} />
          <Row label="Order" value={b.sort_order} />
          <Row label="Active" value={b.is_active === 1 ? 'Yes' : 'No'} />
          <Btn label="Delete banner" tone="danger" busy={busy === String(b.id)} icon="trash"
            onPress={() => void run(String(b.id), () => api.delete(`/admin/banners/${b.id}`), 'Banner deleted', () => void load())} />
        </Card>
      ))}
    </AdminScreen>
  );
}
