import { Sale, SaleItem, Settings } from '../types';
import { EscPosBuilder } from './escpos';

export type ReceiptTemplate = 'standard' | 'compact' | 'detailed' | 'minimal' | 'formal';
export type ReceiptLanguage = 'en' | 'si';

// Printed labels only — item/customer/business text always comes straight
// from the data (via lineAuto/twoColAuto in escpos.ts), which auto-detects
// Sinhala per string regardless of this setting, so a Sinhala product name
// still prints correctly even on an English-language receipt.
interface Labels {
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  cashTendered: string;
  cash: string;
  change: string;
  credit: string;
  creditShort: string;
  paymentCredit: string;
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
    cash: 'Cash',
    change: 'Change',
    credit: 'CREDIT / PAY LATER',
    creditShort: 'Credit',
    paymentCredit: 'Credit (Pay Later)',
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
    cash: 'මුදල්',
    change: 'ඉතිරිය',
    credit: 'ණයට / පසුව ගෙවීම',
    creditShort: 'ණයට',
    paymentCredit: 'ණයට (පසුව ගෙවීම)',
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
  return `${code} ${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const businessHeader = async (b: EscPosBuilder, settings: Settings | null, big: boolean, L: Labels): Promise<void> => {
  b.align('center').bold(true);
  if (big) b.doubleSize(true);
  await b.lineAuto((settings?.setup_completed && settings.business_name) || L.defaultBusinessName);
  if (big) b.doubleSize(false);
  b.bold(false);
  if (settings?.setup_completed && settings.address) await b.lineAuto(settings.address);
  if (settings?.setup_completed && settings.phone) b.line(settings.phone);
};

const saleMeta = async (b: EscPosBuilder, sale: Sale, L: Labels): Promise<void> => {
  b.align('center');
  b.line(`#${sale.sale_number}`);
  b.line(new Date(sale.created_at).toLocaleString());
  if (sale.payment_method === 'credit') {
    b.bold(true);
    await b.lineAuto(L.credit);
    b.bold(false);
  }
  if (sale.customer_name) await b.twoColAuto(L.customer, sale.customer_name);
};

// Fixed brand remark, every template, always plain ASCII (never translated
// per receiptLanguage — same treatment as the app's own "BloomPOS" brand
// name elsewhere). A small gap before it keeps it visually separate from
// whatever the template's own closing line was, and cut()'s own feed
// margin still applies after this — untouched, just called later.
const poweredByFooter = (b: EscPosBuilder): void => {
  b.feed(1);
  b.align('center');
  b.line('Powered by BloomSwiftPOS');
};

const totalsBlock = async (b: EscPosBuilder, sale: Sale, settings: Settings | null, L: Labels): Promise<void> => {
  b.align('left');
  await b.twoColAuto(L.subtotal, amount(settings, sale.subtotal));
  if (sale.discount_amount > 0) await b.twoColAuto(L.discount, `-${amount(settings, sale.discount_amount)}`);
  if (sale.tax_amount > 0) await b.twoColAuto(L.tax, amount(settings, sale.tax_amount));
  b.hr();
  b.bold(true);
  await b.twoColAuto(L.total, amount(settings, sale.total_amount));
  b.bold(false);
  if (sale.payment_method === 'credit') {
    await b.twoColAuto('', L.paymentCredit);
  } else {
    if (sale.cash_tendered > 0) await b.twoColAuto(L.cashTendered, amount(settings, sale.cash_tendered));
    if (sale.change_amount > 0) await b.twoColAuto(L.change, amount(settings, sale.change_amount));
  }
};

export async function buildReceiptStandard(sale: Sale, items: SaleItem[], settings: Settings | null, charsPerLine: number, lang: ReceiptLanguage = 'en'): Promise<Uint8Array> {
  const L = LABELS[lang];
  const b = new EscPosBuilder(charsPerLine);
  await businessHeader(b, settings, true, L);
  await saleMeta(b, sale, L);
  b.hr();
  b.align('left');
  for (const item of items) {
    await b.wrapAndPrintAuto(item.product_name);
    await b.twoColAuto(`  ${item.quantity} x ${amount(settings, item.unit_price)}`, amount(settings, item.subtotal));
  }
  b.hr();
  await totalsBlock(b, sale, settings, L);
  b.feed(1);
  b.align('center');
  await b.lineAuto(L.thankYou);
  poweredByFooter(b);
  b.cut();
  return b.toBytes();
}

export async function buildReceiptCompact(sale: Sale, items: SaleItem[], settings: Settings | null, charsPerLine: number, lang: ReceiptLanguage = 'en'): Promise<Uint8Array> {
  const L = LABELS[lang];
  const b = new EscPosBuilder(charsPerLine);
  await businessHeader(b, settings, false, L);
  await saleMeta(b, sale, L);
  b.hr();
  b.align('left');
  for (const item of items) {
    const label = `${item.quantity}x ${item.product_name}`;
    await b.twoColAuto(label, amount(settings, item.subtotal));
  }
  b.hr();
  if (sale.discount_amount > 0 || sale.tax_amount > 0) {
    await totalsBlock(b, sale, settings, L);
  } else {
    b.bold(true);
    await b.twoColAuto(L.total, amount(settings, sale.total_amount));
    b.bold(false);
    if (sale.payment_method === 'credit') {
      await b.twoColAuto('', L.creditShort);
    } else {
      if (sale.cash_tendered > 0) await b.twoColAuto(L.cash, amount(settings, sale.cash_tendered));
      if (sale.change_amount > 0) await b.twoColAuto(L.change, amount(settings, sale.change_amount));
    }
  }
  b.align('center');
  await b.lineAuto(L.thankYouShort);
  poweredByFooter(b);
  b.cut();
  return b.toBytes();
}

export async function buildReceiptDetailed(sale: Sale, items: SaleItem[], settings: Settings | null, charsPerLine: number, lang: ReceiptLanguage = 'en'): Promise<Uint8Array> {
  const L = LABELS[lang];
  const b = new EscPosBuilder(charsPerLine);
  await businessHeader(b, settings, true, L);
  await saleMeta(b, sale, L);
  b.hr();
  b.align('left');
  for (const item of items) {
    await b.wrapAndPrintAuto(item.product_name);
    if (item.barcode) await b.lineAuto(`  ${L.barcode} ${item.barcode}`);
    await b.twoColAuto(`  ${item.quantity} x ${amount(settings, item.unit_price)}`, amount(settings, item.subtotal));
    if (item.taxes && item.taxes.length > 0) {
      for (const tax of item.taxes) {
        await b.twoColAuto(`    ${tax.tax_name} (${tax.tax_rate}%)`, amount(settings, tax.tax_amount));
      }
    }
  }
  b.hr();
  await totalsBlock(b, sale, settings, L);
  b.feed(1);
  b.align('center');
  await b.lineAuto(L.thankYouWarm);
  if (settings?.default_invoice_note) await b.wrapAndPrintAuto(settings.default_invoice_note);
  if (settings?.email) b.line(settings.email);
  poweredByFooter(b);
  b.cut();
  return b.toBytes();
}

// Bare-bones layout for the smallest paper / fastest handoff — business
// name, items as one line each, and the total. No address, no per-item
// tax breakdown, no thank-you footer — the "Powered by" remark still
// prints (every template gets it), just without the rest of the usual
// closing block.
export async function buildReceiptMinimal(sale: Sale, items: SaleItem[], settings: Settings | null, charsPerLine: number, lang: ReceiptLanguage = 'en'): Promise<Uint8Array> {
  const L = LABELS[lang];
  const b = new EscPosBuilder(charsPerLine);
  b.align('center').bold(true);
  await b.lineAuto((settings?.setup_completed && settings.business_name) || L.defaultBusinessName);
  b.bold(false);
  b.line(`#${sale.sale_number}  ${new Date(sale.created_at).toLocaleDateString()}`);
  b.hr('.');
  b.align('left');
  for (const item of items) {
    await b.twoColAuto(`${item.quantity}x ${item.product_name}`, amount(settings, item.subtotal));
  }
  b.hr('.');
  b.bold(true);
  await b.twoColAuto(L.total, amount(settings, sale.total_amount));
  b.bold(false);
  poweredByFooter(b);
  b.cut();
  return b.toBytes();
}

// Formal VAT/tax invoice layout — invoice number, VAT registration number,
// an explicit qty/price/amount column, and a signature line. Aimed at
// businesses that must hand out a compliant tax invoice, not just a
// till receipt (see Settings.vat_registration_number).
export async function buildReceiptFormal(sale: Sale, items: SaleItem[], settings: Settings | null, charsPerLine: number, lang: ReceiptLanguage = 'en'): Promise<Uint8Array> {
  const L = LABELS[lang];
  const b = new EscPosBuilder(charsPerLine);
  b.align('center').bold(true).doubleSize(true);
  await b.lineAuto((settings?.setup_completed && settings.business_name) || L.defaultBusinessName);
  b.doubleSize(false);
  await b.lineAuto(L.taxInvoice);
  b.bold(false);
  if (settings?.setup_completed && settings.address) await b.lineAuto(settings.address);
  if (settings?.setup_completed && settings.phone) b.line(settings.phone);
  if (settings?.vat_registration_number) await b.twoColAuto(L.vatReg, settings.vat_registration_number);
  b.hr('=');
  b.align('left');
  await b.twoColAuto(L.invoiceNo, `#${sale.sale_number}`);
  b.line(new Date(sale.created_at).toLocaleString());
  if (sale.customer_name) await b.twoColAuto(L.billTo, sale.customer_name);
  b.hr('=');
  b.bold(true);
  await b.lineAuto(L.qtyPriceAmount);
  b.bold(false);
  b.hr();
  for (const item of items) {
    await b.wrapAndPrintAuto(item.product_name);
    await b.twoColAuto(`  ${item.quantity} x ${amount(settings, item.unit_price)}`, amount(settings, item.subtotal));
    if (item.taxes && item.taxes.length > 0) {
      for (const tax of item.taxes) {
        await b.twoColAuto(`    ${tax.tax_name} (${tax.tax_rate}%)`, amount(settings, tax.tax_amount));
      }
    }
  }
  b.hr('=');
  await totalsBlock(b, sale, settings, L);
  b.feed(3);
  b.align('center');
  b.line('_'.repeat(Math.min(24, b.width)));
  await b.lineAuto(L.signature);
  poweredByFooter(b);
  b.cut();
  return b.toBytes();
}

export async function buildReceiptEscPos(
  sale: Sale,
  items: SaleItem[],
  settings: Settings | null,
  template: ReceiptTemplate,
  charsPerLine: number,
  lang: ReceiptLanguage = 'en'
): Promise<Uint8Array> {
  if (template === 'compact') return buildReceiptCompact(sale, items, settings, charsPerLine, lang);
  if (template === 'detailed') return buildReceiptDetailed(sale, items, settings, charsPerLine, lang);
  if (template === 'minimal') return buildReceiptMinimal(sale, items, settings, charsPerLine, lang);
  if (template === 'formal') return buildReceiptFormal(sale, items, settings, charsPerLine, lang);
  return buildReceiptStandard(sale, items, settings, charsPerLine, lang);
}

export function buildKotEscPos(
  params: {
    saleNumber: string;
    stationName: string;
    orderType: string;
    tableName?: string;
    items: Array<{ product_name: string; quantity: number }>;
  },
  charsPerLine: number
): Uint8Array {
  const b = new EscPosBuilder(charsPerLine);
  b.align('center').bold(true).doubleSize(true);
  b.line(`KOT - ${params.stationName}`);
  b.doubleSize(false).bold(false);
  const meta = params.tableName ? `${params.orderType} - ${params.tableName}` : params.orderType;
  b.line(meta);
  b.line(`#${params.saleNumber} - ${new Date().toLocaleTimeString()}`);
  b.hr();
  b.align('left').bold(true);
  for (const item of params.items) {
    b.line(`${item.quantity}x  ${item.product_name}`);
  }
  b.bold(false);
  b.cut();
  return b.toBytes();
}
