import { Settings } from '../../types';
import { ReceiptLanguage, ReceiptTemplateName } from '../../utils/printAgent';

// Mirrors the printed labels in utils/receiptTemplates.ts so the on-screen
// preview reads exactly like the paper receipt would — kept as a small,
// display-only duplicate rather than importing that module, since these are
// pure UI strings and the real templates build raw ESC/POS bytes, not HTML.
interface Labels {
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  cashTendered: string;
  change: string;
  thankYou: string;
  thankYouShort: string;
  thankYouWarm: string;
  customer: string;
  barcode: string;
  taxInvoice: string;
  invoiceNo: string;
  vatReg: string;
  billTo: string;
  qtyPriceAmount: string;
  signature: string;
  defaultBusinessName: string;
}

const LABELS: Record<ReceiptLanguage, Labels> = {
  en: {
    subtotal: 'Subtotal',
    discount: 'Discount',
    tax: 'Tax',
    total: 'TOTAL',
    cashTendered: 'Cash Tendered',
    change: 'Change',
    thankYou: 'Thank you! Please come again.',
    thankYouShort: 'Thank you!',
    thankYouWarm: 'Thank you for shopping with us!',
    customer: 'Customer:',
    barcode: 'Barcode:',
    taxInvoice: 'TAX INVOICE',
    invoiceNo: 'Invoice No.',
    vatReg: 'VAT Reg:',
    billTo: 'Bill to:',
    qtyPriceAmount: 'Qty x Price',
    signature: 'Authorized Signature',
    defaultBusinessName: 'BloomPOS',
  },
  si: {
    subtotal: 'උප එකතුව',
    discount: 'වට්ටම',
    tax: 'බදු',
    total: 'මුළු එකතුව',
    cashTendered: 'ලැබූ මුදල',
    change: 'ඉතිරිය',
    thankYou: 'ස්තුතියි! නැවත එන්න.',
    thankYouShort: 'ස්තුතියි!',
    thankYouWarm: 'අප සමඟ සාප්පු සවාරි කිරීම ගැන ස්තුතියි!',
    customer: 'පාරිභෝගිකයා:',
    barcode: 'බාර්කෝඩ්:',
    taxInvoice: 'බදු ඉන්වොයිසිය',
    invoiceNo: 'ඉන්වොයිස් අංකය',
    vatReg: 'බදු ලියාපදිංචි අංකය:',
    billTo: 'බිල්පත ලබන්නා:',
    qtyPriceAmount: 'ප්‍රමාණය x මිල',
    signature: 'බලයලත් අත්සන',
    defaultBusinessName: 'BloomPOS',
  },
};

const amount = (settings: Settings | null, n: number): string => {
  const code = settings?.currency_code || 'USD';
  return `${code} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Fixed sample sale used purely to render what each layout looks like —
// never sent anywhere, no relation to real sales data.
const SAMPLE_ITEMS = [
  { name: 'House Blend Coffee 250g', qty: 2, price: 850, barcode: '4791234567890', taxRate: 8 },
  { name: 'Butter Croissant', qty: 3, price: 250, barcode: '4791234567906', taxRate: 8 },
  { name: 'Bottled Water 500ml', qty: 1, price: 120, barcode: '4791234567913', taxRate: 0 },
];
const SAMPLE_SALE = {
  number: '1042',
  customerName: 'Nadeesha Perera',
  subtotal: 2570,
  discount: 100,
  tax: 196,
  total: 2666,
  cashTendered: 3000,
  change: 334,
};
const SAMPLE_DATE = new Date();

type Row =
  | { kind: 'text'; text: string; align?: 'left' | 'center'; bold?: boolean; big?: boolean; muted?: boolean }
  | { kind: 'two'; left: string; right: string; bold?: boolean }
  | { kind: 'hr'; style?: 'dashed' | 'solid' | 'dotted' }
  | { kind: 'space' };

const businessName = (settings: Settings | null, L: Labels) =>
  (settings?.setup_completed && settings.business_name) || L.defaultBusinessName;

const header = (settings: Settings | null, big: boolean, L: Labels): Row[] => {
  const rows: Row[] = [{ kind: 'text', text: businessName(settings, L), align: 'center', bold: true, big }];
  if (settings?.setup_completed && settings.address) rows.push({ kind: 'text', text: settings.address, align: 'center' });
  if (settings?.setup_completed && settings.phone) rows.push({ kind: 'text', text: settings.phone, align: 'center' });
  return rows;
};

const meta = (L: Labels, withCustomer: boolean): Row[] => {
  const rows: Row[] = [
    { kind: 'text', text: `#${SAMPLE_SALE.number}`, align: 'center' },
    { kind: 'text', text: SAMPLE_DATE.toLocaleString(), align: 'center' },
  ];
  if (withCustomer) rows.push({ kind: 'two', left: L.customer, right: SAMPLE_SALE.customerName });
  return rows;
};

const totals = (settings: Settings | null, L: Labels): Row[] => [
  { kind: 'two', left: L.subtotal, right: amount(settings, SAMPLE_SALE.subtotal) },
  { kind: 'two', left: L.discount, right: `-${amount(settings, SAMPLE_SALE.discount)}` },
  { kind: 'two', left: L.tax, right: amount(settings, SAMPLE_SALE.tax) },
  { kind: 'hr' },
  { kind: 'two', left: L.total, right: amount(settings, SAMPLE_SALE.total), bold: true },
  { kind: 'two', left: L.cashTendered, right: amount(settings, SAMPLE_SALE.cashTendered) },
  { kind: 'two', left: L.change, right: amount(settings, SAMPLE_SALE.change) },
];

const itemSubtotal = (item: (typeof SAMPLE_ITEMS)[number]) => item.qty * item.price;
const itemTax = (item: (typeof SAMPLE_ITEMS)[number]) => (itemSubtotal(item) * item.taxRate) / 100;

function rowsStandard(settings: Settings | null, L: Labels): Row[] {
  const rows: Row[] = [...header(settings, true, L), { kind: 'space' }, ...meta(L, true), { kind: 'hr' }];
  for (const item of SAMPLE_ITEMS) {
    rows.push({ kind: 'text', text: item.name });
    rows.push({ kind: 'two', left: `  ${item.qty} x ${amount(settings, item.price)}`, right: amount(settings, itemSubtotal(item)) });
  }
  rows.push({ kind: 'hr' }, ...totals(settings, L), { kind: 'space' }, { kind: 'text', text: L.thankYou, align: 'center' });
  return rows;
}

function rowsCompact(settings: Settings | null, L: Labels): Row[] {
  const rows: Row[] = [...header(settings, false, L), ...meta(L, true), { kind: 'hr' }];
  for (const item of SAMPLE_ITEMS) {
    rows.push({ kind: 'two', left: `${item.qty}x ${item.name}`, right: amount(settings, itemSubtotal(item)) });
  }
  rows.push({ kind: 'hr' }, ...totals(settings, L), { kind: 'text', text: L.thankYouShort, align: 'center' });
  return rows;
}

function rowsDetailed(settings: Settings | null, L: Labels): Row[] {
  const rows: Row[] = [...header(settings, true, L), ...meta(L, true), { kind: 'hr' }];
  for (const item of SAMPLE_ITEMS) {
    rows.push({ kind: 'text', text: item.name });
    rows.push({ kind: 'text', text: `  ${L.barcode} ${item.barcode}`, muted: true });
    rows.push({ kind: 'two', left: `  ${item.qty} x ${amount(settings, item.price)}`, right: amount(settings, itemSubtotal(item)) });
    if (item.taxRate > 0) rows.push({ kind: 'two', left: `    VAT (${item.taxRate}%)`, right: amount(settings, itemTax(item)) });
  }
  rows.push(
    { kind: 'hr' },
    ...totals(settings, L),
    { kind: 'space' },
    { kind: 'text', text: L.thankYouWarm, align: 'center' },
    { kind: 'text', text: 'Goods once sold cannot be returned', align: 'center', muted: true },
  );
  return rows;
}

function rowsMinimal(settings: Settings | null, L: Labels): Row[] {
  const rows: Row[] = [
    { kind: 'text', text: businessName(settings, L), align: 'center', bold: true },
    { kind: 'text', text: `#${SAMPLE_SALE.number}  ${SAMPLE_DATE.toLocaleDateString()}`, align: 'center' },
    { kind: 'hr', style: 'dotted' },
  ];
  for (const item of SAMPLE_ITEMS) {
    rows.push({ kind: 'two', left: `${item.qty}x ${item.name}`, right: amount(settings, itemSubtotal(item)) });
  }
  rows.push({ kind: 'hr', style: 'dotted' }, { kind: 'two', left: L.total, right: amount(settings, SAMPLE_SALE.total), bold: true });
  return rows;
}

function rowsFormal(settings: Settings | null, L: Labels): Row[] {
  const rows: Row[] = [
    { kind: 'text', text: businessName(settings, L), align: 'center', bold: true, big: true },
    { kind: 'text', text: L.taxInvoice, align: 'center', bold: true },
  ];
  if (settings?.setup_completed && settings.address) rows.push({ kind: 'text', text: settings.address, align: 'center' });
  if (settings?.setup_completed && settings.phone) rows.push({ kind: 'text', text: settings.phone, align: 'center' });
  rows.push({ kind: 'two', left: L.vatReg, right: settings?.vat_registration_number || 'VAT-000123456' });
  rows.push({ kind: 'hr', style: 'solid' });
  rows.push({ kind: 'two', left: L.invoiceNo, right: `#${SAMPLE_SALE.number}` });
  rows.push({ kind: 'text', text: SAMPLE_DATE.toLocaleString() });
  rows.push({ kind: 'two', left: L.billTo, right: SAMPLE_SALE.customerName });
  rows.push({ kind: 'hr', style: 'solid' });
  rows.push({ kind: 'text', text: L.qtyPriceAmount, bold: true });
  rows.push({ kind: 'hr' });
  for (const item of SAMPLE_ITEMS) {
    rows.push({ kind: 'text', text: item.name });
    rows.push({ kind: 'two', left: `  ${item.qty} x ${amount(settings, item.price)}`, right: amount(settings, itemSubtotal(item)) });
    if (item.taxRate > 0) rows.push({ kind: 'two', left: `    VAT (${item.taxRate}%)`, right: amount(settings, itemTax(item)) });
  }
  rows.push({ kind: 'hr', style: 'solid' }, ...totals(settings, L), { kind: 'space' });
  rows.push({ kind: 'text', text: '________________________', align: 'center' });
  rows.push({ kind: 'text', text: L.signature, align: 'center' });
  return rows;
}

function rowsFor(template: ReceiptTemplateName, settings: Settings | null, L: Labels): Row[] {
  if (template === 'compact') return rowsCompact(settings, L);
  if (template === 'detailed') return rowsDetailed(settings, L);
  if (template === 'minimal') return rowsMinimal(settings, L);
  if (template === 'formal') return rowsFormal(settings, L);
  return rowsStandard(settings, L);
}

export const TEMPLATE_INFO: { id: ReceiptTemplateName; name: string; blurb: string }[] = [
  { id: 'standard', name: 'Standard', blurb: 'Balanced default — header, itemized list, totals.' },
  { id: 'compact', name: 'Compact', blurb: 'One line per item — less paper per sale.' },
  { id: 'detailed', name: 'Detailed', blurb: 'Adds barcodes and per-item tax breakdown.' },
  { id: 'minimal', name: 'Minimal', blurb: 'Bare essentials only — fastest, least paper.' },
  { id: 'formal', name: 'Formal (Tax Invoice)', blurb: 'VAT invoice layout with a signature line.' },
];

function Line({ row }: { row: Row }) {
  if (row.kind === 'hr') {
    const style = row.style === 'solid' ? 'border-black/70' : row.style === 'dotted' ? 'border-dotted border-black/50' : 'border-dashed border-black/40';
    return <div className={`border-t my-1 ${style}`} />;
  }
  if (row.kind === 'space') return <div className="h-1.5" />;
  if (row.kind === 'two') {
    return (
      <div className={`flex justify-between gap-2 ${row.bold ? 'font-bold' : ''}`}>
        <span className="break-words">{row.left}</span>
        <span className="shrink-0 whitespace-nowrap">{row.right}</span>
      </div>
    );
  }
  return (
    <div
      className={[
        'break-words',
        row.align === 'center' ? 'text-center' : 'text-left',
        row.bold ? 'font-bold' : '',
        row.big ? 'text-[13px]' : '',
        row.muted ? 'text-black/50' : '',
      ].join(' ')}
    >
      {row.text}
    </div>
  );
}

interface ReceiptPreviewProps {
  template: ReceiptTemplateName;
  settings: Settings | null;
  language: ReceiptLanguage;
}

export function ReceiptPreview({ template, settings, language }: ReceiptPreviewProps) {
  const L = LABELS[language];
  const rows = rowsFor(template, settings, L);
  return (
    <div className="bg-white text-black font-mono text-[11.5px] leading-[1.55] px-3 py-3.5 rounded-sm">
      {rows.map((row, i) => (
        <Line key={i} row={row} />
      ))}
    </div>
  );
}
