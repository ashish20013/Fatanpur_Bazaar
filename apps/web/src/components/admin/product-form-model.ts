import { nul } from './admin-client';

/** Row as GET /admin/products/:id returns it (raw product columns + images). */
export interface ProductDetail {
  id: number;
  category_id: number;
  supplier_id: number | null;
  item_type: 'PRODUCT' | 'SERVICE';
  sku: string | null;
  name: string;
  name_hi: string | null;
  slug: string;
  description: string | null;
  brand: string | null;
  unit: string;
  unit_value: string | number;
  mrp: string;
  price: string;
  cost_price: string | null;
  stock_qty: number;
  low_stock_at: number;
  is_weighted: 0 | 1;
  service_duration_min: number | null;
  visiting_charge: string | null;
  is_quote_based: 0 | 1;
  service_note: string | null;
  is_available: 0 | 1;
  prescription_required: 0 | 1;
  is_regulated: 0 | 1;
  max_qty_per_order: number;
  hsn_code: string | null;
  tax_rate: string;
  meta_title: string | null;
  meta_description: string | null;
  is_featured: 0 | 1;
  /** Admin's own search words, stored as typed (search_text is derived from them). */
  keywords: string | null;
  sold_count: number;
  images: ProductImageRow[];
}

export interface ProductImageRow {
  id: number;
  url: string;
  url_sm: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
  sort_order: number;
}

export interface CategoryOption {
  id: number;
  parent_id: number | null;
  name: string;
  name_hi: string | null;
  vertical: string;
  item_type: 'PRODUCT' | 'SERVICE';
  is_active: 0 | 1;
}

export interface SupplierOption {
  id: number;
  name: string;
  name_hi: string | null;
  is_active: 0 | 1;
}

/** Every input is a string/boolean while editing; converted to the API's Zod shape in `toProductBody`. */
export interface ProductForm {
  categoryId: string;
  supplierId: string;
  itemType: 'PRODUCT' | 'SERVICE';
  sku: string;
  name: string;
  nameHi: string;
  brand: string;
  description: string;
  unit: string;
  unitValue: string;
  mrp: string;
  price: string;
  costPrice: string;
  stockQty: string;
  lowStockAt: string;
  maxQtyPerOrder: string;
  isWeighted: boolean;
  serviceDurationMin: string;
  visitingCharge: string;
  isQuoteBased: boolean;
  serviceNote: string;
  isAvailable: boolean;
  prescriptionRequired: boolean;
  isRegulated: boolean;
  hsnCode: string;
  taxRate: string;
  keywords: string;
  metaTitle: string;
  metaDescription: string;
  isFeatured: boolean;
}

export const EMPTY_PRODUCT: ProductForm = {
  categoryId: '',
  supplierId: '',
  itemType: 'PRODUCT',
  sku: '',
  name: '',
  nameHi: '',
  brand: '',
  description: '',
  unit: 'kg',
  unitValue: '1',
  mrp: '',
  price: '',
  costPrice: '',
  stockQty: '0',
  lowStockAt: '5',
  maxQtyPerOrder: '20',
  isWeighted: false,
  serviceDurationMin: '',
  visitingCharge: '',
  isQuoteBased: false,
  serviceNote: '',
  isAvailable: true,
  prescriptionRequired: false,
  isRegulated: false,
  hsnCode: '',
  taxRate: '0',
  keywords: '',
  metaTitle: '',
  metaDescription: '',
  isFeatured: false,
};

const s = (v: string | number | null | undefined): string => (v === null || v === undefined ? '' : String(v));

export function productToForm(p: ProductDetail): ProductForm {
  return {
    categoryId: s(p.category_id),
    supplierId: s(p.supplier_id),
    itemType: p.item_type,
    sku: s(p.sku),
    name: p.name,
    nameHi: s(p.name_hi),
    brand: s(p.brand),
    description: s(p.description),
    unit: p.unit,
    unitValue: String(Number(p.unit_value)),
    mrp: p.mrp,
    price: p.price,
    costPrice: s(p.cost_price),
    stockQty: s(p.stock_qty),
    lowStockAt: s(p.low_stock_at),
    maxQtyPerOrder: s(p.max_qty_per_order),
    isWeighted: p.is_weighted === 1,
    serviceDurationMin: s(p.service_duration_min),
    visitingCharge: s(p.visiting_charge),
    isQuoteBased: p.is_quote_based === 1,
    serviceNote: s(p.service_note),
    isAvailable: p.is_available === 1,
    prescriptionRequired: p.prescription_required === 1,
    isRegulated: p.is_regulated === 1,
    hsnCode: s(p.hsn_code),
    taxRate: String(Number(p.tax_rate)),
    keywords: s(p.keywords),
    metaTitle: s(p.meta_title),
    metaDescription: s(p.meta_description),
    isFeatured: p.is_featured === 1,
  };
}

const int = (v: string, d: number): number => (v.trim() === '' || Number.isNaN(Number(v)) ? d : Math.trunc(Number(v)));

/** Body for POST/PUT /admin/products — PUT replaces every column, so the full shape is always sent. */
export function toProductBody(f: ProductForm, isNew: boolean): Record<string, unknown> {
  const service = f.itemType === 'SERVICE';
  return {
    categoryId: Number(f.categoryId),
    supplierId: f.supplierId ? Number(f.supplierId) : null,
    itemType: f.itemType,
    sku: nul(f.sku),
    name: f.name.trim(),
    nameHi: nul(f.nameHi),
    description: nul(f.description),
    brand: nul(f.brand),
    unit: f.unit.trim(),
    unitValue: Number(f.unitValue),
    mrp: f.mrp.trim(),
    price: f.price.trim(),
    costPrice: nul(f.costPrice),
    ...(isNew && !service ? { stockQty: int(f.stockQty, 0) } : {}),
    lowStockAt: int(f.lowStockAt, 5),
    isWeighted: f.isWeighted,
    serviceDurationMin: service && f.serviceDurationMin ? int(f.serviceDurationMin, 60) : null,
    visitingCharge: service ? nul(f.visitingCharge) : null,
    isQuoteBased: service && f.isQuoteBased,
    serviceNote: service ? nul(f.serviceNote) : null,
    isAvailable: f.isAvailable,
    prescriptionRequired: f.prescriptionRequired,
    isRegulated: f.isRegulated,
    maxQtyPerOrder: int(f.maxQtyPerOrder, 20),
    hsnCode: nul(f.hsnCode),
    taxRate: f.taxRate.trim() || '0',
    keywords: nul(f.keywords),
    metaTitle: nul(f.metaTitle),
    metaDescription: nul(f.metaDescription),
    isFeatured: f.isFeatured,
  };
}

const MONEY = /^\d{1,7}(\.\d{1,2})?$/;

/** Cheap client checks so the admin sees a clear English message before the round-trip. */
export function validateProduct(f: ProductForm): string | null {
  if (!f.categoryId) return 'Choose a category.';
  if (f.name.trim().length < 2) return 'Name must be at least 2 characters.';
  if (!f.unit.trim()) return 'Unit is required (e.g. kg, piece).';
  if (!(Number(f.unitValue) > 0)) return 'Unit value must be more than 0.';
  if (!MONEY.test(f.mrp.trim()) || !MONEY.test(f.price.trim())) return 'Enter MRP and price as amounts, e.g. 25 or 25.50.';
  if (Number(f.mrp) > 0 && Number(f.price) > Number(f.mrp)) return 'Selling price cannot be more than MRP.';
  if (f.costPrice.trim() && !MONEY.test(f.costPrice.trim())) return 'Cost price must be an amount, e.g. 18.00.';
  if (f.itemType === 'SERVICE' && f.visitingCharge.trim() && !MONEY.test(f.visitingCharge.trim())) return 'Visiting charge must be an amount.';
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(f.taxRate.trim() || '0')) return 'GST rate must be a number like 5 or 12.';
  return null;
}
