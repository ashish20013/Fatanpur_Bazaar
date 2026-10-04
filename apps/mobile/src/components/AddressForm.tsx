import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Geolocation, { type GeoPosition } from 'react-native-geolocation-service';
import type { VillageOption } from '@fb/shared-types';
import { api, ApiError } from '../services/api';
import { requestLocationPermission } from '../services/location';
import { Input } from './Input';
import { Button } from './Button';
import { VillagePicker } from './VillagePicker';
import { colors, radius, space, type as t } from '../theme/tokens';
import { hi } from '../i18n/hi';

export interface AddressFormValue {
  id?: number;
  label?: string;
  receiverName: string;
  phone: string;
  line1: string;
  landmark: string;
  villageId: number | null;
  villageName: string;
  areaText: string;
  directions?: string | null;
  guardianName?: string | null;
}

interface SaveResult {
  id: number;
  serviceability: { serviceable: boolean };
}

/**
 * A8.7 field order (village first, then house/mohalla, landmark, phone, optional GPS) —
 * shared by Checkout's "add address" step and Profile's address book (§10 dedupe rule:
 * a form this central earns being a component the moment a second screen needs it).
 */
export function AddressForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Partial<AddressFormValue>;
  onSaved: (result: SaveResult) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [villageId, setVillageId] = useState<number | null>(initial?.villageId ?? null);
  const [villageName, setVillageName] = useState(initial?.villageName ?? '');
  const [notListed, setNotListed] = useState(false);
  const [areaText, setAreaText] = useState(initial?.areaText ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [receiverName, setReceiverName] = useState(initial?.receiverName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [line1, setLine1] = useState(initial?.line1 ?? '');
  const [landmark, setLandmark] = useState(initial?.landmark ?? '');
  // The API needs ONE way to find the house (GPS, map pin or a written route) — settings.require_location.
  const [directions, setDirections] = useState(initial?.directions ?? '');
  const [guardianName, setGuardianName] = useState(initial?.guardianName ?? '');
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracyM: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useMyLocation = async (): Promise<void> => {
    setLocating(true);
    setError(null);
    try {
      const granted = await requestLocationPermission();
      if (!granted) return;
      const pos = await new Promise<GeoPosition>((resolve, reject) =>
        Geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 }),
      );
      setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? 999 });
    } catch {
      setError(hi.address.locationWeak);
    } finally {
      setLocating(false);
    }
  };

  const onPickVillage = (v: VillageOption): void => {
    setVillageId(v.id);
    setVillageName(v.nameHi || v.name);
    setNotListed(false);
    setPickerOpen(false);
  };

  const valid = receiverName.trim().length > 0 && /^[6-9]\d{9}$/.test(phone) && line1.trim().length >= 3 && (villageId !== null || areaText.trim().length > 0);

  const save = async (): Promise<void> => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        receiverName: receiverName.trim(),
        phone,
        line1: line1.trim(),
        landmark: landmark.trim() || null,
        directions: directions.trim() || null,
        guardianName: guardianName.trim() || null,
        locationMethod: gps ? 'GPS' : 'DESCRIBED',
        villageId,
        areaText: notListed ? areaText.trim() || null : null,
        lat: gps?.lat ?? null,
        lng: gps?.lng ?? null,
        accuracyM: gps?.accuracyM ?? null,
      };
      const res = initial?.id ? await api.put<SaveResult>(`/users/me/addresses/${initial.id}`, body) : await api.post<SaveResult>('/users/me/addresses', body);
      onSaved(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: space[4] }}>
      <Text style={styles.label}>
        {hi.address.village}
        <Text style={styles.required}> *</Text>
      </Text>
      {notListed ? (
        <View>
          <Input value={areaText} onChangeText={setAreaText} placeholder={hi.address.areaTextPlaceholder} />
          <Pressable onPress={() => setNotListed(false)}>
            <Text style={styles.link}>← {hi.village.title}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.villageBox} onPress={() => setPickerOpen(true)}>
          <Text style={villageName ? styles.villageText : styles.villagePlaceholder}>{villageName || hi.village.title}</Text>
        </Pressable>
      )}

      <View style={{ height: space[3] }} />
      <Input label={hi.address.receiverName} required value={receiverName} onChangeText={setReceiverName} placeholder="जैसे: राम कुमार" maxLength={120} />
      <Input label={hi.address.phone} required value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} placeholder={hi.auth.phonePlaceholder} keyboardType="number-pad" maxLength={10} />
      <Input label={hi.address.houseArea} required value={line1} onChangeText={setLine1} placeholder={hi.address.houseAreaPlaceholder} maxLength={255} />
      <Input label={hi.address.landmark} value={landmark} onChangeText={setLandmark} placeholder={hi.address.landmarkPlaceholder} maxLength={255} />
      <Input label={hi.address.directions} value={directions} onChangeText={setDirections} placeholder={hi.address.directionsPlaceholder} maxLength={500} />
      <Input label={hi.address.guardian} value={guardianName} onChangeText={setGuardianName} placeholder={hi.address.guardianPlaceholder} maxLength={120} />

      <Pressable style={styles.gpsRow} onPress={() => void useMyLocation()} disabled={locating}>
        <Text style={styles.gpsText}>{locating ? hi.address.gettingLocation : gps ? hi.address.locationCaptured : hi.address.useMyLocation}</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={{ height: space[4] }} />
      <Button label={hi.common.save} onPress={() => void save()} loading={saving} disabled={!valid} />
      <View style={{ height: space[2] }} />
      <Button label={hi.common.cancel} onPress={onCancel} variant="ghost" />

      <VillagePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={onPickVillage}
        onNotListed={() => {
          setPickerOpen(false);
          setNotListed(true);
          setVillageId(null);
          setVillageName('');
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  label: { fontSize: t.sm, fontWeight: '600', color: colors.ink2, marginBottom: space[1] },
  required: { color: colors.danger },
  villageBox: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space[4], justifyContent: 'center', backgroundColor: colors.card },
  villageText: { fontSize: t.md, color: colors.ink, fontWeight: '600' },
  villagePlaceholder: { fontSize: t.md, color: colors.ink3 },
  link: { fontSize: t.sm, color: colors.g700, fontWeight: '600', marginTop: space[2] },
  gpsRow: { paddingVertical: space[2] },
  gpsText: { color: colors.g700, fontWeight: '600', fontSize: t.base },
  error: { color: colors.danger, fontSize: t.sm, marginTop: space[2] },
});
