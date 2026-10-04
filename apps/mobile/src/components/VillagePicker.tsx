import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { VillageOption } from '@fb/shared-types';
import { api, ApiError } from '../services/api';
import { requestLocationPermission } from '../services/location';
import Geolocation from 'react-native-geolocation-service';
import { colors, layout, radius, space, type as t } from '../theme/tokens';
import { hi } from '../i18n/hi';
import { Skeleton } from './Skeleton';

interface PickerResponse {
  villages: VillageOption[];
  pinnedIds: number[];
  showSearch: boolean;
  autoSelectId: number | null;
}

const ROW_HEIGHT = 56; // ≥48dp tap target (§9)

/**
 * A8.9 — the primary gate of the whole service-area feature. Used from the homepage strip,
 * the address form (first field), and here on mobile. Rules encoded below are numbered to
 * match BUILD_PROMPT A8.9 exactly so a future change can be checked against the same list.
 */
export function VillagePicker({
  visible,
  onClose,
  onSelect,
  onNotListed,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (village: VillageOption) => void;
  onNotListed: () => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<PickerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q?: string, lat?: number, lng?: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PickerResponse>(`/service-area/villages${api.qs({ q, lat, lng })}`);
      setData(res);
      // Rule 6: exactly one active village → select it immediately, no picker shown.
      if (res.autoSelectId !== null && !q) {
        const v = res.villages.find((x) => x.id === res.autoSelectId);
        if (v) {
          onSelect(v);
          return;
        }
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    } finally {
      setLoading(false);
    }
  }, [onSelect]);

  useEffect(() => {
    if (visible) {
      setQuery('');
      void load();
    }
  }, [visible, load]);

  const onQueryChange = (v: string): void => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void load(v.trim() || undefined), 250);
  };

  const useGps = async (): Promise<void> => {
    setLocating(true);
    try {
      const granted = await requestLocationPermission();
      if (!granted) return;
      const pos = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
        Geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), reject, { enableHighAccuracy: true, timeout: 15000 });
      });
      // Rule 4: GPS pins the nearest 3 to the top — it never auto-selects; the customer confirms.
      await load(undefined, pos.lat, pos.lng);
    } catch {
      setError(hi.address.locationWeak);
    } finally {
      setLocating(false);
    }
  };

  const villages = data?.villages ?? [];
  const pinned = new Set(data?.pinnedIds ?? []);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{hi.village.title}</Text>
        {data?.showSearch ? (
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder={hi.village.searchPlaceholder}
            placeholderTextColor={colors.ink3}
            // Rule 7: never autoFocus — the keyboard hides the list, and scrolling beats typing here.
            autoFocus={false}
            style={styles.search}
          />
        ) : null}
        <Pressable onPress={() => void useGps()} style={styles.gpsRow} disabled={locating}>
          <Text style={styles.gpsText}>{locating ? hi.village.locating : hi.village.useLocation}</Text>
        </Pressable>
        {pinned.size > 0 ? <Text style={styles.sectionLabel}>{hi.village.nearestLabel}</Text> : null}
        {loading ? (
          <View style={{ gap: space[2], paddingVertical: space[2] }}>
            <Skeleton height={ROW_HEIGHT} radius={radius.sm} />
            <Skeleton height={ROW_HEIGHT} radius={radius.sm} />
            <Skeleton height={ROW_HEIGHT} radius={radius.sm} />
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <FlatList
            data={villages}
            keyExtractor={(v) => String(v.id)}
            getItemLayout={(_d, i) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * i, index: i })}
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => onSelect(item)}>
                <Text style={styles.rowDot}>{pinned.has(item.id) ? '📍' : '●'}</Text>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.nameHi || item.name}
                </Text>
                {item.distanceKm !== null ? (
                  <Text style={styles.rowDistance}>
                    {item.distanceKm.toFixed(1)} {hi.common.km}
                  </Text>
                ) : null}
              </Pressable>
            )}
            ListFooterComponent={
              <Pressable style={[styles.row, styles.notListedRow]} onPress={onNotListed}>
                <Text style={styles.rowDotOutline}>○</Text>
                <Text style={styles.notListedText}>{hi.village.notListed}</Text>
              </Pressable>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(6,32,24,0.4)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '80%', paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[6] },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginBottom: space[3] },
  title: { fontSize: t.lg, fontWeight: '700', color: colors.ink, marginBottom: space[3] },
  search: { height: layout.tapTarget, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space[4], fontSize: t.md, marginBottom: space[2], backgroundColor: colors.surface },
  gpsRow: { paddingVertical: space[3] },
  gpsText: { color: colors.g700, fontWeight: '600', fontSize: t.base },
  sectionLabel: { fontSize: t.xs, color: colors.ink3, fontWeight: '600', marginTop: space[1], marginBottom: space[1] },
  row: { flexDirection: 'row', alignItems: 'center', height: ROW_HEIGHT, gap: space[3], borderBottomWidth: 1, borderBottomColor: colors.surface },
  rowDot: { fontSize: t.sm },
  rowDotOutline: { fontSize: t.sm, color: colors.ink3 },
  rowName: { flex: 1, fontSize: t.md, color: colors.ink, fontWeight: '500' },
  rowDistance: { fontSize: t.sm, color: colors.ink3 },
  notListedRow: { marginTop: space[2], borderBottomWidth: 0 },
  notListedText: { flex: 1, fontSize: t.base, color: colors.ink2, fontStyle: 'italic' },
  errorText: { color: colors.danger, textAlign: 'center', paddingVertical: space[6] },
});
