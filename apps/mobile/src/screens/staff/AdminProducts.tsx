import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError, errText } from '../../services/api';
import { useAdminAction } from '../../hooks/useAdminAction';
import { AdminScreen, Btn, Card, Empty, Field, Pill, Row, TextField } from '../../components/admin/AdminKit';

export interface AdminProductRow {
  id: number; name: string; nameHi: string | null; slug: string; sku: string | null;
  itemType: 'PRODUCT' | 'SERVICE'; price: string; mrp: string; stockQty: number; lowStockAt: number;
  isAvailable: 0 | 1; isFeatured: 0 | 1; category: string | null; supplier: string | null; image: string | null;
}

/**
 * Products — the same two things the website's products table lets the shopkeeper do inline:
 * change a price and set the stock. (apps/web/src/components/admin/ProductsAdmin.tsx: "Rozana ka
 * kaam: daam aur stock badalna".) The full form, the photographs and deleting an item stay on
 * the website, where there is room to do them properly.
 *
 * ⚠️ Price and stock each have their own endpoint, and they are the only ones to use:
 *   PATCH /admin/products/:id/price  { price }
 *   PATCH /admin/products/:id/stock  { set, reason }
 * This screen first sent `PUT /admin/products/:id` with one field, which the server rejected
 * every time — that route validates a WHOLE product (category, unit, mrp, price…), so a partial
 * body is a 422, and nothing could be saved from the phone at all. The dedicated endpoints also
 * write the audit and inventory_logs rows that a price or stock change is supposed to leave.
 * Taking an item off sale is a full-product edit, so it stays a badge here, as on the website.
 */
export default function AdminProductsScreen(): React.JSX.Element {
  const [rows, setRows] = useState<AdminProductRow[] | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [price, setPrice] = useState<Record<number, string>>({});
  const [stock, setStock] = useState<Record<number, string>>({});
  const { busy, err, ok, setErr, run } = useAdminAction();

  const load = useCallback(
    async (search = '', p = 1) => {
      try {
        // ⚠️ The server reads `q` (admin products list), not `search`.
        const r = await api.paged<AdminProductRow>('/admin/products', { q: search || undefined, page: p });
        setRows(r.items);
        setHasMore(r.meta.hasMore);
        setPage(p);
      } catch (e) {
        setErr(errText(e, true));
      }
    },
    [setErr],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const savePrice = (p: AdminProductRow): void => {
    const n = Number(price[p.id]);
    if (!Number.isFinite(n) || n <= 0) {
      setErr('Enter a price greater than 0');
      return;
    }
    if (Number(p.mrp) > 0 && n > Number(p.mrp)) {
      setErr(`The price cannot be above the MRP of ₹${p.mrp}`);
      return;
    }
    void run(`price-${p.id}`, () => api.patch(`/admin/products/${p.id}/price`, { price: n.toFixed(2) }), 'Price updated', () => {
      setPrice((s) => ({ ...s, [p.id]: '' }));
      void load(q, page);
    });
  };

  const saveStock = (p: AdminProductRow): void => {
    const n = Number(stock[p.id]);
    if (!Number.isInteger(n) || n < 0) {
      setErr('Enter the stock as a whole number');
      return;
    }
    void run(`stock-${p.id}`, () => api.patch(`/admin/products/${p.id}/stock`, { set: n, reason: 'MANUAL' }), 'Stock updated', () => {
      setStock((s) => ({ ...s, [p.id]: '' }));
      void load(q, page);
    });
  };

  return (
    <AdminScreen title="Products" err={err} ok={ok} loading={rows === null}>
      <Field label="Search">
        <TextField value={q} onChangeText={setQ} placeholder="Name or SKU" />
      </Field>
      <Btn label="Search" tone="secondary" onPress={() => void load(q, 1)} icon="search" />
      {rows && rows.length === 0 ? <Empty text="No products matched." /> : null}
      {rows?.map((p) => (
        <Card key={p.id}>
          <Row label="Item" value={p.nameHi ?? p.name} strong />
          <Row label="Category" value={p.category ?? '—'} />
          {p.supplier ? <Row label="Supplier" value={p.supplier} /> : null}
          <Row label="Price" value={`₹${p.price}${p.mrp !== p.price ? `  (MRP ₹${p.mrp})` : ''}`} strong />
          <Row label="Type" value={p.itemType} />
          <Row
            label="On sale"
            value={<Pill text={p.isAvailable === 1 ? 'On' : 'Off'} tone={p.isAvailable === 1 ? 'ok' : 'muted'} />}
          />
          {p.isFeatured === 1 ? <Row label="Featured" value={<Pill text="Yes" tone="info" />} /> : null}

          <Field label="New price (₹)">
            <TextField value={price[p.id] ?? ''} onChangeText={(v) => setPrice((s) => ({ ...s, [p.id]: v }))} placeholder={p.price} keyboardType="decimal-pad" />
          </Field>
          <Btn label="Save price" onPress={() => savePrice(p)} busy={busy === `price-${p.id}`} icon="cash" />

          {p.itemType === 'PRODUCT' ? (
            <>
              <Row label="Stock" value={<Pill text={String(p.stockQty)} tone={p.stockQty === 0 ? 'danger' : p.stockQty <= p.lowStockAt ? 'warn' : 'ok'} />} />
              <Field label="Set stock to" hint="This writes an inventory entry, like the website does.">
                <TextField value={stock[p.id] ?? ''} onChangeText={(v) => setStock((s) => ({ ...s, [p.id]: v }))} placeholder={String(p.stockQty)} keyboardType="number-pad" />
              </Field>
              <Btn label="Save stock" tone="secondary" onPress={() => saveStock(p)} busy={busy === `stock-${p.id}`} icon="box" />
            </>
          ) : null}
        </Card>
      ))}
      {hasMore ? <Btn label="Load more" tone="secondary" icon="chevron-down" onPress={() => void load(q, page + 1)} /> : null}
    </AdminScreen>
  );
}
