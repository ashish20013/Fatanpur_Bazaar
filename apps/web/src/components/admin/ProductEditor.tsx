'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { call } from '@/lib/client';
import { Icon } from '../icons';
import { buttonClass } from '../ui';
import { useAdminAction } from './admin-client';
import { Check, Field, Notice, inputCls, textareaCls } from './form-kit';
import { EMPTY_PRODUCT, productToForm, toProductBody, validateProduct, type CategoryOption, type ProductDetail, type ProductForm, type SupplierOption } from './product-form-model';

type Setter = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) => void;
interface SectionProps {
  f: ProductForm;
  set: Setter;
}

const UNITS = ['kg', 'g', 'litre', 'ml', 'piece', 'dozen', 'packet', 'bundle', 'box', 'bottle', 'visit', 'hour'];

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <fieldset className="fb-card grid gap-3 p-4 sm:grid-cols-2">
      <legend className="sr-only">{title}</legend>
      <h2 className="text-lg font-semibold text-ink sm:col-span-2">{title}</h2>
      {children}
    </fieldset>
  );
}

function BasicSection({ f, set, categories, suppliers }: SectionProps & { categories: CategoryOption[]; suppliers: SupplierOption[] }): ReactNode {
  const roots = categories.filter((c) => c.parent_id === null);
  const kids = (id: number): CategoryOption[] => categories.filter((c) => c.parent_id === id);
  const label = (c: CategoryOption): string => `${c.name}${c.name_hi ? ` · ${c.name_hi}` : ''}${c.is_active ? '' : ' (off)'}`;
  return (
    <Section title="Basic details">
      <Field label="Name (English)">
        <input required minLength={2} maxLength={200} value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} placeholder="Potato" />
      </Field>
      <Field label="Name (Hindi)">
        <input maxLength={200} value={f.nameHi} onChange={(e) => set('nameHi', e.target.value)} className={inputCls} lang="hi" placeholder="आलू" />
      </Field>
      <Field label="Category">
        <select required value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={inputCls}>
          <option value="">— Choose —</option>
          {roots.map((r) => (
            <optgroup key={r.id} label={r.name}>
              <option value={r.id}>{label(r)}</option>
              {kids(r.id).map((c) => (
                <option key={c.id} value={c.id}>
                  &nbsp;&nbsp;{label(c)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field label="Supplier" hint="Shown as “from …” on the product page when the supplier allows it.">
        <select value={f.supplierId} onChange={(e) => set('supplierId', e.target.value)} className={inputCls}>
          <option value="">— None —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.is_active ? '' : ' (inactive)'}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Type">
        <select value={f.itemType} onChange={(e) => set('itemType', e.target.value as ProductForm['itemType'])} className={inputCls}>
          <option value="PRODUCT">Product (delivered)</option>
          <option value="SERVICE">Service (booked slot)</option>
        </select>
      </Field>
      <Field label="Brand">
        <input maxLength={120} value={f.brand} onChange={(e) => set('brand', e.target.value)} className={inputCls} />
      </Field>
      <Field label="SKU" hint="Optional internal code; must be unique.">
        <input maxLength={40} value={f.sku} onChange={(e) => set('sku', e.target.value)} className={`${inputCls} font-mono`} />
      </Field>
      <Field label="Description (HTML allowed)" hint="Unsafe tags are removed on save." wide>
        <textarea maxLength={5000} value={f.description} onChange={(e) => set('description', e.target.value)} className={textareaCls} />
      </Field>
    </Section>
  );
}

function PriceSection({ f, set, isNew }: SectionProps & { isNew: boolean }): ReactNode {
  const money = (k: 'mrp' | 'price' | 'costPrice'): ((e: React.ChangeEvent<HTMLInputElement>) => void) => (e) => set(k, e.target.value.replace(/[^\d.]/g, ''));
  const num = (k: 'unitValue' | 'stockQty' | 'lowStockAt' | 'maxQtyPerOrder'): ((e: React.ChangeEvent<HTMLInputElement>) => void) => (e) => set(k, e.target.value.replace(/[^\d.]/g, ''));
  return (
    <Section title="Unit, price & stock">
      <Field label="Unit">
        <input required list="fb-units" maxLength={30} value={f.unit} onChange={(e) => set('unit', e.target.value)} className={inputCls} />
        <datalist id="fb-units">
          {UNITS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </Field>
      <Field label="Unit value" hint="e.g. 1 kg, 500 g, 6 piece">
        <input required inputMode="decimal" value={f.unitValue} onChange={num('unitValue')} className={inputCls} />
      </Field>
      <Field label="MRP (₹)">
        <input required inputMode="decimal" value={f.mrp} onChange={money('mrp')} className={`${inputCls} tabular-nums`} placeholder="30.00" />
      </Field>
      <Field label="Selling price (₹)">
        <input required inputMode="decimal" value={f.price} onChange={money('price')} className={`${inputCls} tabular-nums`} placeholder="25.00" />
      </Field>
      <Field label="Cost price (₹)" hint="Internal only — never shown to customers.">
        <input inputMode="decimal" value={f.costPrice} onChange={money('costPrice')} className={`${inputCls} tabular-nums`} />
      </Field>
      {isNew && f.itemType === 'PRODUCT' ? (
        <Field label="Opening stock">
          <input inputMode="numeric" value={f.stockQty} onChange={num('stockQty')} className={inputCls} />
        </Field>
      ) : null}
      <Field label="Low-stock alert at">
        <input inputMode="numeric" value={f.lowStockAt} onChange={num('lowStockAt')} className={inputCls} />
      </Field>
      <Field label="Max quantity per order">
        <input inputMode="numeric" value={f.maxQtyPerOrder} onChange={num('maxQtyPerOrder')} className={inputCls} />
      </Field>
      <Check label="Available for sale" checked={f.isAvailable} onChange={(v) => set('isAvailable', v)} />
      <Check label="Featured (shown first)" checked={f.isFeatured} onChange={(v) => set('isFeatured', v)} />
      <Check label="Sold by weight (final weight may differ)" checked={f.isWeighted} onChange={(v) => set('isWeighted', v)} />
    </Section>
  );
}

function ServiceSection({ f, set }: SectionProps): ReactNode {
  return (
    <Section title="Service booking">
      <Field label="Duration (minutes)">
        <input inputMode="numeric" value={f.serviceDurationMin} onChange={(e) => set('serviceDurationMin', e.target.value.replace(/\D/g, ''))} className={inputCls} placeholder="60" />
      </Field>
      <Field label="Visiting charge (₹)">
        <input inputMode="decimal" value={f.visitingCharge} onChange={(e) => set('visitingCharge', e.target.value.replace(/[^\d.]/g, ''))} className={`${inputCls} tabular-nums`} />
      </Field>
      <Field label="Note for the customer" wide>
        <input maxLength={500} value={f.serviceNote} onChange={(e) => set('serviceNote', e.target.value)} className={inputCls} />
      </Field>
      <Check label="Price decided after inspection (quote-based)" checked={f.isQuoteBased} onChange={(v) => set('isQuoteBased', v)} />
    </Section>
  );
}

function RulesSection({ f, set }: SectionProps): ReactNode {
  return (
    <Section title="Rules, tax & search">
      <Check label="Prescription required (medicine)" checked={f.prescriptionRequired} onChange={(v) => set('prescriptionRequired', v)} />
      <Check label="Regulated item (licence needed)" checked={f.isRegulated} onChange={(v) => set('isRegulated', v)} />
      <Field label="HSN code">
        <input maxLength={12} value={f.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} className={`${inputCls} font-mono`} />
      </Field>
      <Field label="GST rate (%)" hint="Prices are tax-inclusive.">
        <input inputMode="decimal" value={f.taxRate} onChange={(e) => set('taxRate', e.target.value.replace(/[^\d.]/g, ''))} className={inputCls} />
      </Field>
      <Field label="Search keywords" hint="Other spellings people type, e.g. aloo alu potato. Makes search find this product." wide>
        <input maxLength={300} value={f.keywords} onChange={(e) => set('keywords', e.target.value)} className={inputCls} />
      </Field>
      <Field label="SEO title">
        <input maxLength={180} value={f.metaTitle} onChange={(e) => set('metaTitle', e.target.value)} className={inputCls} />
      </Field>
      <Field label="SEO description">
        <input maxLength={320} value={f.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} className={inputCls} />
      </Field>
    </Section>
  );
}

/** Create or edit a product/service. The server recomputes search text and audits price changes. */
export function ProductEditor({ product, categories, suppliers }: { product: ProductDetail | null; categories: CategoryOption[]; suppliers: SupplierOption[] }): ReactNode {
  const router = useRouter();
  const a = useAdminAction();
  const isNew = product === null;
  const [f, setF] = useState<ProductForm>(product ? productToForm(product) : EMPTY_PRODUCT);
  const set: Setter = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save(): Promise<void> {
    const bad = validateProduct(f);
    if (bad) return a.setErr(bad);
    if (isNew) {
      const r = await a.run('save', () => call<{ id: number; slug: string }>('/admin/products', { method: 'POST', body: toProductBody(f, true) }), 'Product created. Add photos below.');
      if (r) router.push(`/admin/products/${r.id}?created=1`);
      return;
    }
    await a.run('save', () => call(`/admin/products/${product.id}`, { method: 'PUT', body: toProductBody(f, false) }), 'Changes saved.');
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <BasicSection f={f} set={set} categories={categories} suppliers={suppliers} />
      <PriceSection f={f} set={set} isNew={isNew} />
      {f.itemType === 'SERVICE' ? <ServiceSection f={f} set={set} /> : null}
      <RulesSection f={f} set={set} />
      <div className="sticky bottom-0 z-10 -mx-3 space-y-2 border-t border-line bg-[#f3f1ea]/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded sm:border sm:px-4">
        <Notice err={a.err} ok={a.ok} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link href="/admin/products" className={buttonClass('ghost', 'sm')}>
            <Icon name="arrow-left" size={16} /> Back to list
          </Link>
          <button type="submit" disabled={a.busy === 'save'} className={buttonClass('primary', 'md')}>
            {a.busy === 'save' ? 'Saving…' : isNew ? 'Create product' : 'Save changes'}
          </button>
        </div>
      </div>
    </form>
  );
}
