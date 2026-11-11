import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { api, ApiError, errText } from '../../services/api';
import { useAdminAction } from '../../hooks/useAdminAction';
import { AdminScreen, Btn, Card, Empty, Field, Pill, Row, TextField } from '../../components/admin/AdminKit';

/** ⚠️ GET /admin/service-area/zones returns the service_zones rows as they are — snake_case. */
interface Zone {
  id: number;
  name: string | null;
  name_hi: string | null;
  mode: 'RADIUS' | 'POLYGON';
  center_lat: string;
  center_lng: string;
  radius_km: string | null;
  polygon_geojson: unknown;
  delivery_fee: string;
  min_order: string;
  eta_minutes: number;
  priority: number;
  is_active: 0 | 1;
  note: string | null;
}

/**
 * Delivery boundary (§A8.6). The website has a MapLibre editor — dragging the centre, pulling
 * a polygon around the roads. That is a map job and it stays on the website; a 360 px screen
 * cannot do it honestly.
 *
 * What the phone can do safely is the radius, which is the control the owner actually reaches
 * for. ⚠️ Every save is still validated server-side (store inside the zone, sane area, how many
 * active villages fall outside) — this screen only shows what the server answers.
 */
export default function AdminServiceAreaScreen(): React.JSX.Element {
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const { busy, err, ok, setErr, run } = useAdminAction();

  const load = useCallback(async () => {
    try { setZones(await api.get<Zone[]>('/admin/service-area/zones')); }
    catch (e) { setErr(errText(e, true)); }
  }, [setErr]);

  useEffect(() => { void load(); }, [load]);

  /**
   * ⚠️ PUT zones/:id validates a WHOLE zone (ZoneSchema: mode, centerLat, centerLng, deliveryFee,
   * minOrder, etaMinutes and priority are all required). Sending `{ mode, radiusKm }` was a 422,
   * so the radius could never be changed from the phone. Everything else goes back unchanged.
   *
   * `confirm: true` is what answers the server's "these villages will drop out" question. The
   * server counts them and refuses without it, so the count is read back from that error and
   * put to the shopkeeper before anything is saved — the same confirmation the website asks for.
   */
  const put = (z: Zone, km: number, confirm: boolean) =>
    api.put(`/admin/service-area/zones/${z.id}`, {
      name: z.name ?? undefined,
      mode: 'RADIUS' as const,
      centerLat: Number(z.center_lat),
      centerLng: Number(z.center_lng),
      radiusKm: km,
      polygon: null,
      deliveryFee: z.delivery_fee,
      minOrder: z.min_order,
      etaMinutes: z.eta_minutes,
      priority: z.priority,
      ...(confirm ? { confirm: true } : {}),
    });

  const saveRadius = (z: Zone): void => {
    const km = Number(draft[z.id]);
    if (!Number.isFinite(km) || km < 1 || km > 15) { setErr('Radius must be between 1 and 15 km'); return; }
    void run(String(z.id), () => put(z, km, false), 'Boundary saved', () => {
      setDraft((p) => ({ ...p, [z.id]: '' })); void load();
    }).then((r) => {
      if (r !== null) return;
      // The only reason a valid radius is refused is the villages-dropping-out check.
      Alert.alert(
        'Villages will drop out',
        `Saving ${km} km leaves some active villages outside the delivery area. Customers there will not be able to order. Save anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save anyway',
            style: 'destructive',
            onPress: () => void run(`c-${z.id}`, () => put(z, km, true), 'Boundary saved', () => {
              setDraft((p) => ({ ...p, [z.id]: '' })); void load();
            }),
          },
        ],
      );
    });
  };

  return (
    <AdminScreen title="Delivery boundary" err={err} ok={ok} loading={zones === null}>
      {zones && zones.length === 0 ? <Empty text="No zone set up." /> : null}
      {zones?.map((z) => (
        <Card key={z.id}>
          <Row label="Zone" value={z.name ?? `#${z.id}`} strong />
          <Row label="Shape" value={<Pill text={z.mode} tone="info" />} />
          {z.mode === 'RADIUS' ? <Row label="Radius" value={`${z.radius_km} km`} strong /> : <Row label="Shape" value="Drawn by hand — edit on the website" />}
          <Row label="Centre" value={z.center_lat ? `${z.center_lat}, ${z.center_lng}` : '—'} />
          <Row label="Delivery fee" value={`₹${z.delivery_fee}`} />
          <Row label="Min order" value={`₹${z.min_order}`} />
          <Row label="ETA" value={`${z.eta_minutes} min`} />
          <Row label="Priority" value={z.priority} />
          <Row label="Active" value={<Pill text={z.is_active === 1 ? 'Yes' : 'No'} tone={z.is_active === 1 ? 'ok' : 'danger'} />} />
          {z.mode === 'RADIUS' ? (
            <>
              <Field label="New radius (km)" hint="Shrinking this can put villages outside — the server will say how many.">
                <TextField value={draft[z.id] ?? ''} onChangeText={(v) => setDraft((p) => ({ ...p, [z.id]: v }))} placeholder={String(z.radius_km ?? '')} keyboardType="decimal-pad" />
              </Field>
              <Btn label="Save boundary" onPress={() => saveRadius(z)} busy={busy === String(z.id) || busy === `c-${z.id}`} icon="map-2" />
            </>
          ) : null}
        </Card>
      ))}
    </AdminScreen>
  );
}
