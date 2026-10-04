import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PaymentMethod, PlaceOrderResponse, QuoteResponse } from '@fb/shared-types';
import type { CustomerStackParamList } from '../../navigation/CustomerTabs';
import { api, ApiError, newIdempotencyKey } from '../../services/api';
import { useCart } from '../../store/cart';
import { AddressForm } from '../../components/AddressForm';
import { UpiPayment } from '../../components/UpiPayment';
import { Money } from '../../components/Money';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Skeleton } from '../../components/Skeleton';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

interface AddressRow {
  id: number;
  receiverName: string;
  phone: string;
  line1: string;
  landmark: string | null;
  villageId: number | null;
  villageName: string | null;
  villageNameHi: string | null;
  isDefault: boolean;
  isServiceable: boolean;
}
interface PrescriptionRow {
  id: number;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
}
interface OutOfAreaData {
  servedAreas: string[];
  distanceKm: number;
  nearestServedKm: number | null;
}

/** A12/A14: this screen never trusts its own math — every total shown comes from POST /orders/quote. */
export default function CheckoutScreen({ navigation }: NativeStackScreenProps<CustomerStackParamList, 'Checkout'>): React.JSX.Element {
  const { cart, clear } = useCart();
  const [mode, setMode] = useState<'form' | 'add-address'>('form');
  const [addresses, setAddresses] = useState<AddressRow[] | null>(null);
  const [addressId, setAddressId] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('COD');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | undefined>(undefined);
  const [useWallet, setUseWallet] = useState(false);
  const [note, setNote] = useState('');
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[] | null>(null);
  const [prescriptionId, setPrescriptionId] = useState<number | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<ApiError | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<PlaceOrderResponse | null>(null);
  const [leadPhone, setLeadPhone] = useState('');
  const [leadSent, setLeadSent] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const idemKey = useRef(newIdempotencyKey());

  const loadAddresses = useCallback(async () => {
    const rows = await api.get<AddressRow[]>('/users/me/addresses');
    setAddresses(rows);
    setAddressId((prev) => prev ?? rows.find((r) => r.isDefault)?.id ?? rows[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void loadAddresses();
    api.get<PrescriptionRow[]>('/prescriptions').then(setPrescriptions).catch(() => setPrescriptions([]));
  }, [loadAddresses]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      void loadAddresses();
      api.get<PrescriptionRow[]>('/prescriptions').then(setPrescriptions).catch(() => undefined);
    });
    return unsub;
  }, [navigation, loadAddresses]);

  const items = (cart?.items ?? []).map((i) => ({ productId: i.productId, quantity: i.quantity }));
  const serviceSlotItem = (cart?.items ?? []).find((i) => i.itemType === 'SERVICE' && i.slotDate && i.slotStart);

  const runQuote = useCallback(async () => {
    if (!addressId || items.length === 0) {
      setQuote(null);
      return;
    }
    setQuoting(true);
    setQuoteError(null);
    try {
      const q = await api.post<QuoteResponse>('/orders/quote', { addressId, items, couponCode: appliedCoupon, useWallet, paymentMethod: method });
      setQuote(q);
    } catch (e) {
      setQuote(null);
      const err = e instanceof ApiError ? e : new ApiError('UNKNOWN', 0, hi.common.somethingWrong);
      if (err.code === 'COUPON_INVALID') {
        // Drop the bad code so the quote can recover on its own, but keep telling the user why.
        setCouponError(err.messageHi);
        setAppliedCoupon(undefined);
        return;
      }
      setQuoteError(err);
    } finally {
      setQuoting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressId, JSON.stringify(items), appliedCoupon, useWallet, method]);

  useEffect(() => {
    void runQuote();
  }, [runQuote]);

  const place = async (): Promise<void> => {
    if (!addressId || !quote) return;
    if (quote.needsPrescription && !prescriptionId) return;
    setPlacing(true);
    try {
      const res = await api.post<PlaceOrderResponse>(
        '/orders',
        {
          addressId,
          items,
          couponCode: appliedCoupon,
          useWallet,
          paymentMethod: method,
          prescriptionId: prescriptionId ?? undefined,
          note: note.trim() || undefined,
          slot: serviceSlotItem?.slotDate && serviceSlotItem.slotStart ? { date: serviceSlotItem.slotDate, start: serviceSlotItem.slotStart } : undefined,
        },
        { 'X-Idempotency-Key': idemKey.current },
      );
      await clear();
      if (res.upi) {
        setPlaced(res);
      } else {
        navigation.replace('OrderTracking', { orderNumber: res.orderNumber });
      }
    } catch (e) {
      setQuoteError(e instanceof ApiError ? e : new ApiError('UNKNOWN', 0, hi.common.somethingWrong));
      idemKey.current = newIdempotencyKey(); // a real new attempt needs a fresh key (A14)
    } finally {
      setPlacing(false);
    }
  };

  if (placed?.upi) {
    return <UpiPayment orderNumber={placed.orderNumber} upi={placed.upi} onClaimed={() => navigation.replace('OrderTracking', { orderNumber: placed.orderNumber })} />;
  }

  if (mode === 'add-address') {
    return (
      <AddressForm
        onCancel={() => setMode('form')}
        onSaved={async (res) => {
          await loadAddresses();
          setAddressId(res.id);
          setMode('form');
        }}
      />
    );
  }

  const isOutOfArea = quoteError?.code === 'OUT_OF_SERVICE_AREA';
  const outOfAreaData = isOutOfArea ? (quoteError?.data as unknown as OutOfAreaData | undefined) : undefined;

  const submitLead = async (): Promise<void> => {
    if (!/^[6-9]\d{9}$/.test(leadPhone)) return;
    const addr = addresses?.find((a) => a.id === addressId);
    try {
      await api.post('/service-area/request', { phone: leadPhone, villageGuess: addr?.villageNameHi || addr?.villageName || undefined, source: 'CHECKOUT' });
      setLeadSent(true);
    } catch {
      // lead capture is a courtesy, never blocking
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: space[4] }}>
      <Text style={styles.section}>{hi.checkout.deliverTo}</Text>
      {addresses === null ? (
        <Skeleton height={72} radius={radius.md} />
      ) : addresses.length === 0 ? (
        <Pressable style={styles.addBox} onPress={() => setMode('add-address')}>
          <Text style={styles.addBoxText}>{hi.address.addNew}</Text>
        </Pressable>
      ) : (
        <View style={{ gap: space[2] }}>
          {addresses.map((a) => (
            <Pressable key={a.id} style={[styles.addrCard, addressId === a.id && styles.addrCardActive]} onPress={() => setAddressId(a.id)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addrName}>
                  {a.receiverName} · {a.villageNameHi || a.villageName || '—'}
                </Text>
                <Text style={styles.addrLine} numberOfLines={1}>
                  {a.line1}
                </Text>
                {!a.isServiceable ? <Text style={styles.addrBadge}>{hi.address.outOfAreaBadge}</Text> : null}
              </View>
            </Pressable>
          ))}
          <Pressable onPress={() => setMode('add-address')}>
            <Text style={styles.link}>{hi.address.addNew}</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.section}>{hi.checkout.paymentMethod}</Text>
      <View style={styles.methodRow}>
        <Pressable style={[styles.methodChip, method === 'COD' && styles.methodChipActive]} onPress={() => setMethod('COD')}>
          <Text style={[styles.methodText, method === 'COD' && styles.methodTextActive]}>{hi.checkout.cod}</Text>
        </Pressable>
        <Pressable style={[styles.methodChip, method === 'UPI' && styles.methodChipActive]} onPress={() => setMethod('UPI')}>
          <Text style={[styles.methodText, method === 'UPI' && styles.methodTextActive]}>{hi.checkout.upi}</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>{hi.checkout.couponLabel}</Text>
      <View style={styles.couponRow}>
        <View style={{ flex: 1 }}>
          <Input value={couponInput} onChangeText={(v) => setCouponInput(v.toUpperCase())} placeholder={hi.checkout.couponPlaceholder} maxLength={30} />
        </View>
        <Button
          label={hi.checkout.couponApply}
          onPress={() => {
            setCouponError(null);
            setAppliedCoupon(couponInput.trim() || undefined);
          }}
          size="sm"
          fullWidth={false}
        />
      </View>
      {appliedCoupon && quote ? <Text style={styles.couponApplied}>✅ {hi.checkout.couponApplied}</Text> : null}
      {couponError ? <Text style={styles.couponErrorText}>{couponError}</Text> : null}

      {quote?.needsPrescription ? (
        <View>
          <Text style={styles.section}>{hi.checkout.prescriptionRequired}</Text>
          {(prescriptions ?? []).map((p) => (
            <Pressable key={p.id} style={[styles.rxRow, prescriptionId === p.id && styles.rxRowActive]} onPress={() => setPrescriptionId(p.id)} disabled={p.status === 'REJECTED'}>
              <Text style={styles.rxText}>
                पर्ची #{p.id} · {hi.prescriptions.status[p.status]}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={() => navigation.navigate('Prescriptions')}>
            <Text style={styles.link}>{hi.checkout.uploadPrescription}</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.section}>{hi.checkout.note}</Text>
      <Input value={note} onChangeText={setNote} placeholder={hi.checkout.notePlaceholder} multiline maxLength={500} />

      {isOutOfArea && outOfAreaData ? (
        <View style={styles.sorryBox}>
          <Text style={styles.sorryTitle}>{hi.serviceArea.sorryTitle}</Text>
          <Text style={styles.sorryBody}>{quoteError?.messageHi}</Text>
          <Text style={styles.sorrySub}>
            {hi.serviceArea.weDeliverTo} {outOfAreaData.servedAreas.slice(0, 8).join(' · ')}
          </Text>
          {leadSent ? (
            <Text style={styles.sorryThanks}>{hi.serviceArea.thanks}</Text>
          ) : (
            <View style={styles.leadRow}>
              <View style={{ flex: 1 }}>
                <Input value={leadPhone} onChangeText={(v) => setLeadPhone(v.replace(/\D/g, '').slice(0, 10))} placeholder={hi.auth.phonePlaceholder} keyboardType="number-pad" maxLength={10} />
              </View>
              <Button label={hi.serviceArea.notifyMe} onPress={() => void submitLead()} size="sm" fullWidth={false} />
            </View>
          )}
        </View>
      ) : quoteError ? (
        <Text style={styles.errorBanner}>{quoteError.messageHi}</Text>
      ) : null}

      {quoting ? (
        <Text style={styles.quoteLoading}>{hi.checkout.quoteLoading}</Text>
      ) : quote ? (
        <View style={styles.quoteBox}>
          <QuoteRow label={hi.checkout.itemsTotal} value={quote.itemsTotal} />
          <QuoteRow label={hi.checkout.deliveryFee} value={quote.deliveryFee} />
          {Number(quote.visitingCharge) > 0 ? <QuoteRow label={hi.checkout.visitingCharge} value={quote.visitingCharge} /> : null}
          {Number(quote.discount) > 0 ? <QuoteRow label={hi.checkout.discount} value={`-${quote.discount}`} /> : null}
          {Number(quote.walletUsed) > 0 ? <QuoteRow label={hi.checkout.walletUsed} value={`-${quote.walletUsed}`} /> : null}
          <View style={styles.divider} />
          <View style={styles.rowBetween}>
            <Text style={styles.grandLabel}>{hi.checkout.grandTotal}</Text>
            <Money value={quote.grandTotal} size={t.xl} />
          </View>
          <Text style={styles.eta}>{hi.checkout.eta(quote.etaMinutes)}</Text>
        </View>
      ) : null}

      <View style={{ height: space[4] }} />
      <Button
        label={placing ? hi.checkout.placing : hi.checkout.placeOrder}
        onPress={() => void place()}
        loading={placing}
        disabled={!quote || quoting || (quote.needsPrescription && !prescriptionId)}
      />
      <View style={{ height: space[8] }} />
    </ScrollView>
  );
}

function QuoteRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.rowBetween}>
      <Text style={styles.quoteLabel}>{label}</Text>
      <Money value={value} size={t.base} weight="600" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  section: { fontSize: t.base, fontWeight: '700', color: colors.ink, marginTop: space[6], marginBottom: space[2] },
  addBox: { borderWidth: 1, borderColor: colors.g200, borderRadius: radius.md, padding: space[4], alignItems: 'center', backgroundColor: colors.g50 },
  addBoxText: { color: colors.g700, fontWeight: '600' },
  addrCard: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space[3], backgroundColor: colors.card },
  addrCardActive: { borderColor: colors.g600, backgroundColor: colors.g50 },
  addrName: { fontSize: t.base, fontWeight: '700', color: colors.ink },
  addrLine: { fontSize: t.sm, color: colors.ink2, marginTop: 2 },
  addrBadge: { fontSize: t.xs, color: colors.danger, fontWeight: '600', marginTop: 4 },
  link: { fontSize: t.sm, color: colors.g700, fontWeight: '600', marginTop: space[2] },
  methodRow: { flexDirection: 'row', gap: space[2] },
  methodChip: { flex: 1, paddingVertical: space[3], borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center', backgroundColor: colors.card },
  methodChipActive: { borderColor: colors.g600, backgroundColor: colors.g100 },
  methodText: { fontWeight: '600', color: colors.ink2 },
  methodTextActive: { color: colors.g700 },
  couponRow: { flexDirection: 'row', gap: space[2], alignItems: 'flex-start' },
  couponApplied: { color: colors.g700, fontWeight: '600', fontSize: t.sm, marginTop: space[1] },
  couponErrorText: { color: colors.danger, fontSize: t.sm, marginTop: space[1] },
  rxRow: { padding: space[3], borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, marginBottom: space[2], backgroundColor: colors.card },
  rxRowActive: { borderColor: colors.g600, backgroundColor: colors.g50 },
  rxText: { color: colors.ink, fontWeight: '600', fontSize: t.sm },
  sorryBox: { marginTop: space[4], padding: space[4], backgroundColor: colors.a100, borderRadius: radius.md, gap: space[2] },
  sorryTitle: { fontWeight: '700', color: colors.a700, fontSize: t.base },
  sorryBody: { color: colors.ink2, fontSize: t.sm },
  sorrySub: { color: colors.ink3, fontSize: t.xs },
  sorryThanks: { color: colors.g700, fontWeight: '600', fontSize: t.sm },
  leadRow: { flexDirection: 'row', gap: space[2], alignItems: 'flex-start' },
  errorBanner: { marginTop: space[4], color: colors.danger, fontSize: t.sm, fontWeight: '600' },
  quoteLoading: { marginTop: space[4], color: colors.ink3, fontSize: t.sm },
  quoteBox: { marginTop: space[4], backgroundColor: colors.card, borderRadius: radius.md, padding: space[4], gap: space[2] },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quoteLabel: { fontSize: t.sm, color: colors.ink2 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: space[1] },
  grandLabel: { fontSize: t.base, fontWeight: '700', color: colors.ink },
  eta: { fontSize: t.xs, color: colors.ink3, marginTop: space[1] },
});
