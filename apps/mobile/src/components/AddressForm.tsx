import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Geolocation, { type GeoPosition } from 'react-native-geolocation-service';
import type { VillageOption } from '@fb/shared-types';
import { api, ApiError } from '../services/api';
import { requestLocationPermission } from '../services/location';
import { useSettings } from '../store/settings';
import { Input } from './Input';
import { Button } from './Button';
import { Icon } from './Icon';
import { VillagePicker } from './VillagePicker';
import { colors, font, radius, space, type as t } from '../theme/tokens';
import { useName, useSite } from '../store/lang';

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
  altPhone?: string | null;
  district?: string | null;
  pincode?: string | null;
  deliveryNote?: string | null;
}

interface SaveResult {
  id: number;
  serviceability: { serviceable: boolean };
}

/** Anything over this is a reading from inside a concrete house, not a location (A8.3 rule 2). */
const GPS_ACCURACY_LIMIT_M = 500;
/** Written directions shorter than this are not directions. Same bar as the website's form. */
const MIN_DIRECTIONS = 10;

/**
 * The address form — A8.7's field order, and the same questions the website asks
 * (apps/web/src/components/AddressForm.tsx): village first, then the house, then who to call,
 * then how to find it.
 *
 * ⚠️ Three of those the app used to leave out, and the server rejects an address without them,
 * so a customer filled the form, pressed save, and got a red Hindi sentence with nothing to act
 * on — at checkout, which is the worst possible place to lose someone:
 *   • the guardian's name, which in a village IS the address ("रामलाल का घर");
 *   • "are you at this address right now?", which decides whether the GPS fix describes the
 *     delivery point or merely where the order was placed (originLat/originLng);
 *   • a location at all — a GPS fix, or written directions — when the shop requires one.
 * All three are asked here now, inline, before the save button will do anything.
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
  const pick = useName();
  const site = useSite();
  const settings = useSettings();

  const [villageId, setVillageId] = useState<number | null>(initial?.villageId ?? null);
  const [villageName, setVillageName] = useState(initial?.villageName ?? '');
  const [notListed, setNotListed] = useState(false);
  const [areaText, setAreaText] = useState(initial?.areaText ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);

  const [receiverName, setReceiverName] = useState(initial?.receiverName ?? '');
  const [guardianName, setGuardianName] = useState(initial?.guardianName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [altPhone, setAltPhone] = useState(initial?.altPhone ?? '');
  const [line1, setLine1] = useState(initial?.line1 ?? '');
  const [landmark, setLandmark] = useState(initial?.landmark ?? '');
  const [district, setDistrict] = useState(initial?.district ?? settings.defaultDistrict);
  const [pincode, setPincode] = useState(initial?.pincode ?? settings.defaultPincode);
  const [directions, setDirections] = useState(initial?.directions ?? '');
  const [deliveryNote, setDeliveryNote] = useState(initial?.deliveryNote ?? '');

  /** null until answered — the website refuses to save until it is. */
  const [atHome, setAtHome] = useState<boolean | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracyM: number } | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const [errs, setErrs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useMyLocation = async (): Promise<void> => {
    setLocating(true);
    setGpsNote(null);
    setError(null);
    try {
      const granted = await requestLocationPermission();
      if (!granted) {
        setGpsNote(site.loc.denied);
        return;
      }
      const pos = await new Promise<GeoPosition>((resolve, reject) =>
        Geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 }),
      );
      const accuracyM = Math.round(pos.coords.accuracy ?? 999);
      // ⚠️ A8.3 rule 2: a weak fix is not a location. Keep it out rather than saving a lie.
      if (accuracyM > GPS_ACCURACY_LIMIT_M) {
        setGps(null);
        setGpsNote(site.loc.weak(accuracyM));
        return;
      }
      setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM });
      setGpsNote(atHome === false ? site.loc.originSaved(accuracyM) : site.loc.taken(accuracyM));
    } catch {
      setGpsNote(site.loc.denied);
    } finally {
      setLocating(false);
    }
  };

  const onPickVillage = (v: VillageOption): void => {
    setVillageId(v.id);
    setVillageName(pick(v.name, v.nameHi));
    setNotListed(false);
    setPickerOpen(false);
  };

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (villageId === null && areaText.trim().length === 0) e.village = site.area.picker;
    if (line1.trim().length < 3) e.line1 = site.addr2.required(site.address.line1);
    if (!receiverName.trim()) e.receiverName = site.addr2.required(site.addr2.receiver);
    if (!guardianName.trim()) e.guardianName = site.addr2.required(site.addr2.guardian);
    if (!/^[6-9]\d{9}$/.test(phone)) e.phone = site.addr2.phoneWrong;
    if (altPhone && !/^[6-9]\d{9}$/.test(altPhone)) e.altPhone = site.addr2.phoneWrong;
    if (pincode && !/^[1-9]\d{5}$/.test(pincode)) e.pincode = site.addr2.pinWrong;
    if (atHome === null) e.loc = site.loc.needAnswer;
    else if (settings.requireLocation && !gps && directions.trim().length < MIN_DIRECTIONS) e.loc = site.loc.need;
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  const save = async (): Promise<void> => {
    setError(null);
    if (!validate()) return;
    setSaving(true);
    try {
      /*
       * "Are you here right now?" decides what the GPS fix means:
       *   yes → it is the delivery point (lat/lng), method GPS
       *   no  → it only says where the order came from (originLat/originLng); the delivery point
       *         is whatever was written down. Saving it as the address would send the rider to
       *         the wrong house.
       */
      const hereNow = atHome === true && gps !== null;
      const body = {
        receiverName: receiverName.trim(),
        guardianName: guardianName.trim(),
        phone,
        altPhone: altPhone.trim() || null,
        line1: line1.trim(),
        landmark: landmark.trim() || null,
        district: district.trim() || null,
        pincode: pincode.trim() || null,
        directions: directions.trim() || null,
        deliveryNote: deliveryNote.trim() || null,
        villageId,
        areaText: notListed ? areaText.trim() || null : null,
        lat: hereNow ? gps.lat : null,
        lng: hereNow ? gps.lng : null,
        accuracyM: hereNow ? gps.accuracyM : null,
        locationMethod: hereNow ? ('GPS' as const) : ('DESCRIBED' as const),
        originLat: gps?.lat ?? null,
        originLng: gps?.lng ?? null,
        originAccuracyM: gps?.accuracyM ?? null,
        orderedFromHere: atHome,
      };
      const res = initial?.id
        ? await api.put<SaveResult>(`/users/me/addresses/${initial.id}`, body)
        : await api.post<SaveResult>('/users/me/addresses', body);
      onSaved(res);
    } catch (e) {
      if (e instanceof ApiError) {
        // The server names the field it refused; show it there rather than as a wall of red.
        const field = (e.data?.field as string | undefined) ?? null;
        if (field) setErrs((p) => ({ ...p, [field === 'directions' ? 'loc' : field]: e.messageHi }));
        else setError(e.messageHi);
      } else {
        setError(site.common.error);
      }
    } finally {
      setSaving(false);
    }
  };

  const Err = ({ k }: { k: string }): React.JSX.Element | null => (errs[k] ? <Text style={styles.error}>{errs[k]}</Text> : null);

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: space[4], paddingBottom: space[10] }} keyboardShouldPersistTaps="handled">
      <Text style={styles.step}>{site.addr2.step1}</Text>
      <Text style={styles.label}>
        {site.address.village}
        <Text style={styles.required}> *</Text>
      </Text>
      <Text style={styles.hint}>{site.addr2.villageHint}</Text>
      {notListed ? (
        <View>
          <Input value={areaText} onChangeText={setAreaText} placeholder={site.area.searchPlaceholder} />
          <Pressable onPress={() => setNotListed(false)}>
            <Text style={styles.link}>← {site.area.picker}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.villageBox} onPress={() => setPickerOpen(true)}>
          <Icon name="map-pin" size={18} color={colors.au600} />
          <Text style={villageName ? styles.villageText : styles.villagePlaceholder}>{villageName || site.area.picker}</Text>
          <Icon name="chevron-down" size={16} color={colors.ink3} />
        </Pressable>
      )}
      <Err k="village" />

      <Text style={styles.step}>{site.addr2.step2}</Text>
      <Input label={site.address.line1} required value={line1} onChangeText={setLine1} maxLength={255} />
      <Err k="line1" />
      <Input label={site.address.landmark} value={landmark} onChangeText={setLandmark} placeholder={site.address.landmarkHint} maxLength={255} />
      <View style={styles.two}>
        <View style={{ flex: 1 }}>
          <Input label={site.addr2.district} value={district} onChangeText={setDistrict} maxLength={80} />
        </View>
        <View style={{ flex: 1 }}>
          <Input label={site.addr2.pincode} value={pincode} onChangeText={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} />
          <Err k="pincode" />
        </View>
      </View>

      <Text style={styles.step}>{site.addr2.step3}</Text>
      <Input label={site.addr2.receiver} required value={receiverName} onChangeText={setReceiverName} maxLength={120} />
      <Err k="receiverName" />
      {/* In a village the guardian's name is how the house is known — so it is required here too. */}
      <Input label={site.addr2.guardian} required value={guardianName} onChangeText={setGuardianName} placeholder={site.addr2.guardianHint} maxLength={120} />
      <Err k="guardianName" />
      <Input
        label={site.address.phone}
        required
        value={phone}
        onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
        placeholder="9876543210"
        keyboardType="number-pad"
        maxLength={10}
      />
      <Err k="phone" />
      <Input
        label={site.addr2.altPhone}
        value={altPhone}
        onChangeText={(v) => setAltPhone(v.replace(/\D/g, '').slice(0, 10))}
        placeholder={site.addr2.altPhoneHint}
        keyboardType="number-pad"
        maxLength={10}
      />
      <Err k="altPhone" />

      <Text style={styles.step}>{site.addr2.step4}</Text>
      <Text style={styles.q}>{site.loc.q}</Text>
      <View style={styles.two}>
        {([true, false] as const).map((v) => (
          <Pressable key={String(v)} style={[styles.choice, atHome === v && styles.choiceOn]} onPress={() => setAtHome(v)}>
            <Text style={[styles.choiceText, atHome === v && styles.choiceTextOn]}>{v ? site.loc.yes : site.loc.no}</Text>
          </Pressable>
        ))}
      </View>
      {atHome === false ? <Text style={styles.hint}>{site.loc.originOnly}</Text> : null}

      <Pressable style={styles.gpsRow} onPress={() => void useMyLocation()} disabled={locating}>
        <Icon name="current-location" size={18} color={colors.em700} />
        <Text style={styles.gpsText}>{locating ? site.loc.taking : gps ? site.loc.change : site.loc.take}</Text>
      </Pressable>
      {gpsNote ? <Text style={styles.hint}>{gpsNote}</Text> : null}

      <Input
        label={site.addr2.directions}
        value={directions}
        onChangeText={setDirections}
        placeholder={site.addr2.directionsHint}
        maxLength={500}
        multiline
      />
      <Err k="loc" />

      <Input label={site.addr2.note} value={deliveryNote} onChangeText={setDeliveryNote} placeholder={site.addr2.noteHint} maxLength={300} />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={{ height: space[4] }} />
      <Button label={site.addr2.saveAndUse} onPress={() => void save()} loading={saving} />
      <View style={{ height: space[2] }} />
      <Button label={site.common.cancel} onPress={onCancel} variant="ghost" />

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
  wrap: { flex: 1, backgroundColor: colors.paper },
  step: { fontFamily: font.display, fontSize: t.lg, color: colors.ink, marginTop: space[5], marginBottom: space[2] },
  label: { fontSize: t.sm, fontFamily: font.bodySemi, color: colors.ink2, marginBottom: 2 },
  hint: { fontSize: t.base, color: colors.ink3, marginBottom: space[2] },
  required: { color: colors.danger },
  two: { flexDirection: 'row', gap: space[3] },
  villageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.sm,
    paddingHorizontal: space[3],
    backgroundColor: colors.card,
  },
  villageText: { flex: 1, fontSize: t.body, color: colors.ink, fontFamily: font.bodySemi },
  villagePlaceholder: { flex: 1, fontSize: t.body, color: colors.ink3 },
  link: { fontSize: t.base, color: colors.em700, fontFamily: font.bodySemi, marginTop: space[2] },
  q: { fontSize: t.body, color: colors.ink, marginBottom: space[2] },
  choice: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[2],
  },
  choiceOn: { borderColor: colors.em700, backgroundColor: colors.em100 },
  choiceText: { fontSize: t.base, color: colors.ink2, textAlign: 'center' },
  choiceTextOn: { color: colors.em800, fontFamily: font.bodySemi },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[3] },
  gpsText: { color: colors.em700, fontFamily: font.bodySemi, fontSize: t.body },
  error: { color: colors.danger, fontSize: t.base, marginTop: 2, marginBottom: space[1] },
});
