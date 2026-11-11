/**
 * Display helpers for values that arrive from the API as raw DB columns.
 * Mirrors apps/web/src/lib/format.ts so a price or a pack size reads the same in both places.
 */

/**
 * Products carry both `unit_value` (DECIMAL, e.g. "250.000") and `unit` (the label the
 * shopkeeper typed, which in this catalogue already contains the quantity — "250 ग्राम").
 * Printing both gives "250.000 250 ग्राम". Print the label alone when it already starts with
 * the quantity, and otherwise prepend a trimmed number so a bare "किलो" still reads correctly
 * if the catalogue ever stores it that way.
 */
export function formatUnit(unitValue?: string | number | null, unit?: string | null): string {
  const label = (unit ?? '').trim();
  if (!label) return '';
  const n = Number(unitValue);
  if (!Number.isFinite(n) || n <= 0) return label;
  const qty = String(Number(n.toFixed(3)));
  return label.startsWith(qty) ? label : `${qty} ${label}`;
}

/** "170.00" → "170", "170.50" → "170.50". The site never shows a trailing ".00". */
export function rupees(amount: string | number | null | undefined): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * Turns the API's Hindi unit label into English for a reader who switched to EN.
 *
 * ⚠️ The API formats `unit` server-side — a product arrives already carrying "1 किलो", not
 * "kg" + 1 (apps/api/src/modules/catalog/product-mapper.ts). Fixing that properly means
 * changing the live API's payload, which is not something to do for a label, so the word is
 * mapped back here. Every key below is one of that mapper's own outputs, so the two stay in
 * step; a label this does not recognise is shown exactly as it came, never blanked.
 */
const UNIT_EN: Record<string, string> = {
  किलो: 'kg',
  ग्राम: 'g',
  लीटर: 'L',
  'मि.ली.': 'ml',
  पीस: 'piece',
  दर्जन: 'dozen',
  पैकेट: 'pack',
  गड्डी: 'bundle',
  विज़िट: 'visit',
  बोतल: 'bottle',
  डिब्बा: 'box',
  जोड़ी: 'pair',
  बोरी: 'bag',
  मीटर: 'metre',
  फेरा: 'trip',
  घंटा: 'hour',
  जाँच: 'test',
  प्लेट: 'plate',
  सेट: 'set',
  पत्ता: 'strip',
  कप: 'cup',
};

export function unitInEnglish(label: string): string {
  // The label is "<number> <word>" or just "<word>"; only the word is translated.
  const m = /^([\d.,]*\s*)(.+)$/.exec(label.trim());
  if (!m) return label;
  const word = m[2].trim();
  const en = UNIT_EN[word];
  return en ? `${m[1].trim()} ${en}`.trim() : label;
}
