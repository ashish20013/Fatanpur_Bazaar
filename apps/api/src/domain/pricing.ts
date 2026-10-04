import { max, min, mulQty, toPaise, fromPaise, type Paise } from '../common/utils/money';

/**
 * A12 pricing quote — pure arithmetic over DB-loaded rows. Client prices are never an input.
 * Throws QuoteError with an error code the service maps to the API envelope.
 */
export class QuoteError extends Error {
  constructor(
    public readonly code: 'PRODUCT_UNAVAILABLE' | 'STOCK_INSUFFICIENT' | 'QTY_LIMIT' | 'MIN_ORDER_NOT_MET' | 'COD_LIMIT_EXCEEDED' | 'SLOT_UNAVAILABLE',
    public readonly params: Record<string, string | number> = {},
  ) {
    super(code);
  }
}

export interface QuoteProduct {
  id: number;
  name: string;
  name_hi: string | null;
  item_type: 'PRODUCT' | 'SERVICE';
  price: string;
  stock_qty: number;
  is_available: number | boolean;
  max_qty_per_order: number;
  prescription_required: number | boolean;
  visiting_charge: string;
  vertical_enabled: boolean;
}
export interface QuoteInput {
  lines: { productId: number; quantity: number }[];
  products: Map<number, QuoteProduct>;
  orderType: 'DELIVERY' | 'SERVICE';
  minOrder: Paise;
  deliveryFee: Paise;
  freeDeliveryAbove: Paise;
  discount: Paise; // already evaluated coupon (A13)
  walletBalance: Paise;
  useWallet: boolean;
  paymentMethod: 'COD' | 'UPI' | 'GATEWAY' | 'WALLET';
  trust: { phoneVerified: boolean; deliveredCount: number; trustOrdersNeeded: number; codUnverifiedLimit: Paise };
}
export interface QuoteOutput {
  itemsTotal: Paise;
  deliveryFee: Paise;
  visitingCharge: Paise;
  discount: Paise;
  walletUsed: Paise;
  grandTotal: Paise;
  needsPrescription: boolean;
  lines: { productId: number; quantity: number; unitPrice: Paise; lineTotal: Paise }[];
}

export function itemLabel(p: Pick<QuoteProduct, 'name' | 'name_hi'>): string {
  return p.name_hi ?? p.name;
}

export function computeQuote(q: QuoteInput): QuoteOutput {
  let itemsTotal: Paise = 0;
  let visitingCharge: Paise = 0;
  let needsPrescription = false;
  const lines: QuoteOutput['lines'] = [];
  for (const line of q.lines) {
    const p = q.products.get(line.productId);
    if (!p || !Number(p.is_available) || !p.vertical_enabled) {
      throw new QuoteError('PRODUCT_UNAVAILABLE', { item: p ? itemLabel(p) : `#${line.productId}` });
    }
    if (line.quantity > p.max_qty_per_order) throw new QuoteError('QTY_LIMIT', { item: itemLabel(p), n: p.max_qty_per_order });
    if (p.item_type === 'PRODUCT' && p.stock_qty < line.quantity) {
      throw new QuoteError('STOCK_INSUFFICIENT', { item: itemLabel(p), n: p.stock_qty });
    }
    const unitPrice = toPaise(p.price);
    const lineTotal = mulQty(unitPrice, line.quantity);
    itemsTotal += lineTotal;
    if (Number(p.prescription_required)) needsPrescription = true;
    if (p.item_type === 'SERVICE') visitingCharge = max(visitingCharge, toPaise(p.visiting_charge));
    lines.push({ productId: p.id, quantity: line.quantity, unitPrice, lineTotal });
  }
  if (itemsTotal < q.minOrder && q.orderType === 'DELIVERY') {
    throw new QuoteError('MIN_ORDER_NOT_MET', { n: Math.round(q.minOrder / 100) });
  }
  let deliveryFee: Paise = q.deliveryFee;
  if (q.freeDeliveryAbove > 0 && itemsTotal >= q.freeDeliveryAbove) deliveryFee = 0;
  if (q.orderType === 'SERVICE') deliveryFee = 0;
  else visitingCharge = 0;

  const discount = min(q.discount, itemsTotal);
  const payable = max(0, itemsTotal + deliveryFee + visitingCharge - discount);
  const walletUsed = q.useWallet ? min(max(q.walletBalance, 0), payable) : 0;
  const grandTotal = payable - walletUsed;

  const t = q.trust;
  if (!t.phoneVerified && t.deliveredCount < t.trustOrdersNeeded && q.paymentMethod === 'COD' && grandTotal > t.codUnverifiedLimit) {
    throw new QuoteError('COD_LIMIT_EXCEEDED', { n: Math.round(t.codUnverifiedLimit / 100) });
  }
  return { itemsTotal, deliveryFee, visitingCharge, discount, walletUsed, grandTotal, needsPrescription, lines };
}

export function quoteBreakdown(o: QuoteOutput): { label: string; amount: string }[] {
  const rows = [
    { label: 'सामान का कुल', amount: fromPaise(o.itemsTotal) },
    { label: 'डिलीवरी शुल्क', amount: fromPaise(o.deliveryFee) },
  ];
  if (o.visitingCharge > 0) rows.push({ label: 'विज़िटिंग चार्ज', amount: fromPaise(o.visitingCharge) });
  if (o.discount > 0) rows.push({ label: 'छूट', amount: `-${fromPaise(o.discount)}` });
  if (o.walletUsed > 0) rows.push({ label: 'वॉलेट से', amount: `-${fromPaise(o.walletUsed)}` });
  rows.push({ label: 'कुल देय', amount: fromPaise(o.grandTotal) });
  return rows;
}
