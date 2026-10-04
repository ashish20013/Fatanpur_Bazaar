import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ProductDetail } from '@fb/shared-types';
import type { CustomerStackParamList } from '../../navigation/CustomerTabs';
import { api, ApiError } from '../../services/api';
import { useCart } from '../../store/cart';
import { Money } from '../../components/Money';
import { Button } from '../../components/Button';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/EmptyState';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

interface Slot {
  start: string;
  end: string;
  capacity: number;
}

function nextDays(n: number): { iso: string; label: string }[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const label = i === 0 ? 'आज' : i === 1 ? 'कल' : d.toLocaleDateString('hi-IN', { day: 'numeric', month: 'short' });
    return { iso, label };
  });
}

export default function ServiceScreen({ route, navigation }: NativeStackScreenProps<CustomerStackParamList, 'Service'>): React.JSX.Element {
  const { slug } = route.params;
  const { addItem } = useCart();
  const [service, setService] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(nextDays(7)[0].iso);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);

  useEffect(() => {
    api
      .get<ProductDetail>(`/catalog/products/${slug}`)
      .then((p) => {
        setService(p);
        navigation.setOptions({ title: p.nameHi || p.name });
      })
      .catch((e) => setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    setSlots(null);
    setSelectedSlot(null);
    api
      .get<Slot[]>(`/catalog/services/${slug}/slots?date=${date}`)
      .then(setSlots)
      .catch(() => setSlots([]));
  }, [slug, date]);

  const book = async (): Promise<void> => {
    if (!service || !selectedSlot) return;
    setBooking(true);
    try {
      await addItem(service.id, 1); // TODO(cart.slot): CartService currently reads slot via /cart/items body — see ASSUMPTIONS.md
      setBooked(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    } finally {
      setBooking(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={() => navigation.replace('Service', { slug })} />;
  if (!service) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4] }}>
        <Skeleton height={140} radius={radius.md} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4] }}>
      <Text style={styles.name}>{service.nameHi || service.name}</Text>
      {service.description || service.descriptionHi ? <Text style={styles.description}>{service.descriptionHi || service.description}</Text> : null}

      <View style={styles.priceRow}>
        {service.isQuoteBased ? <Text style={styles.quoteNote}>{hi.service.quoteBased}</Text> : <Money value={service.price} size={t.xl} />}
        {Number(service.visitingCharge) > 0 ? (
          <Text style={styles.visitingCharge}>
            {hi.product.visitingCharge}: <Money value={service.visitingCharge} size={t.sm} />
          </Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>{hi.service.selectSlot}</Text>
      <View style={styles.dateRow}>
        {nextDays(7).map((d) => (
          <Pressable key={d.iso} style={[styles.dateChip, date === d.iso && styles.dateChipActive]} onPress={() => setDate(d.iso)}>
            <Text style={[styles.dateChipText, date === d.iso && styles.dateChipTextActive]}>{d.label}</Text>
          </Pressable>
        ))}
      </View>

      {slots === null ? (
        <Skeleton height={40} />
      ) : slots.length === 0 ? (
        <Text style={styles.noSlots}>{hi.service.noSlotsToday}</Text>
      ) : (
        <View style={styles.slotGrid}>
          {slots.map((s) => (
            <Pressable
              key={s.start}
              disabled={s.capacity <= 0}
              style={[styles.slotChip, selectedSlot?.start === s.start && styles.slotChipActive, s.capacity <= 0 && styles.slotChipDisabled]}
              onPress={() => setSelectedSlot(s)}
            >
              <Text style={[styles.slotText, selectedSlot?.start === s.start && styles.slotTextActive]}>{s.capacity <= 0 ? hi.service.slotFull : `${s.start}–${s.end}`}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ height: space[6] }} />
      {booked ? (
        <Text style={styles.bookedText}>✅ कार्ट में जोड़ दिया गया — चेकआउट करें</Text>
      ) : (
        <Button label={hi.product.bookService} onPress={() => void book()} disabled={!selectedSlot} loading={booking} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  name: { fontSize: t.xl, fontWeight: '700', color: colors.ink },
  description: { fontSize: t.base, color: colors.ink2, marginTop: space[2], lineHeight: 22 },
  priceRow: { marginTop: space[4], gap: space[1] },
  quoteNote: { fontSize: t.md, color: colors.warn, fontWeight: '600' },
  visitingCharge: { fontSize: t.sm, color: colors.ink2 },
  sectionTitle: { fontSize: t.md, fontWeight: '700', color: colors.ink, marginTop: space[6], marginBottom: space[2] },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  dateChip: { paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  dateChipActive: { backgroundColor: colors.g700, borderColor: colors.g700 },
  dateChipText: { fontSize: t.sm, color: colors.ink2, fontWeight: '600' },
  dateChipTextActive: { color: colors.white },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[2] },
  slotChip: { paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.sm, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, minHeight: 44, justifyContent: 'center' },
  slotChipActive: { backgroundColor: colors.g100, borderColor: colors.g600 },
  slotChipDisabled: { opacity: 0.4 },
  slotText: { fontSize: t.sm, color: colors.ink2, fontWeight: '600' },
  slotTextActive: { color: colors.g700 },
  noSlots: { color: colors.ink3, fontSize: t.sm },
  bookedText: { color: colors.g700, fontWeight: '600', textAlign: 'center' },
});
