import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError, errText } from '../../services/api';
import { useAdminAction } from '../../hooks/useAdminAction';
import { AdminScreen, Btn, Card, Empty, Row } from '../../components/admin/AdminKit';

/** The grouped expansion list, exactly as the server aggregates it (A8.11). */
interface RequestGroup {
  villageGuess: string | null;
  requests: number;
  /** Distinct phone numbers — three requests from one person is not three customers. */
  phones: number;
  minKm: number | string | null;
  lastAt: string | null;
  lat: number | string | null;
  lng: number | string | null;
  newCount: number;
}

/**
 * Area requests (§A8.11) — the people the shop had to turn away, grouped by the place they
 * named. This is the expansion list: the village at the top is where the next zone should go,
 * and "Turn this village on" does it in one tap.
 */
export default function AdminAreaRequestsScreen(): React.JSX.Element {
  const [rows, setRows] = useState<RequestGroup[] | null>(null);
  const { busy, err, ok, setErr, run } = useAdminAction();

  const load = useCallback(async () => {
    try {
      setRows(await api.get<RequestGroup[]>('/admin/service-area/requests'));
    } catch (e) {
      setErr(errText(e, true));
    }
  }, [setErr]);

  useEffect(() => { void load(); }, [load]);

  const activate = (g: RequestGroup): void => {
    void run(g.villageGuess ?? 'x', () => api.post('/admin/service-area/requests/activate', { villageGuess: g.villageGuess }), 'Village activated', () => void load());
  };

  return (
    <AdminScreen title="Area requests" err={err} ok={ok} loading={rows === null}>
      {rows && rows.length === 0 ? <Empty text="No one has asked for a new area yet." /> : null}
      {rows?.map((g, i) => (
        <Card key={`${g.villageGuess ?? 'unknown'}-${i}`}>
          <Row label="Place" value={g.villageGuess ?? 'Not named'} strong />
          <Row label="People asking" value={g.phones} />
          {g.minKm !== null ? <Row label="Nearest" value={`${Number(g.minKm).toFixed(1)} km away`} /> : null}
          <Row label="Requests" value={g.requests} strong />
          {g.lastAt ? <Row label="Last asked" value={new Date(g.lastAt).toLocaleDateString('en-IN')} /> : null}
          {g.lat !== null && g.lng !== null ? <Row label="Location" value={`${g.lat}, ${g.lng}`} /> : null}
          {g.villageGuess ? <Btn label="Turn this village on" onPress={() => activate(g)} busy={busy === g.villageGuess} icon="map-pin" /> : null}
        </Card>
      ))}
    </AdminScreen>
  );
}
