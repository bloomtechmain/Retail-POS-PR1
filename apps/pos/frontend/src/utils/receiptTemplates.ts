import { Sale, SaleItem, Settings } from '../types';
import { EscPosBuilder } from './escpos';

export type ReceiptTemplate = 'standard' | 'compact' | 'detailed';

const amount = (settings: Settings | null, n: number): string => {
  const code = settings?.currency_code || 'USD';
  return `${code} ${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const businessHeader = (b: EscPosBuilder, settings: Settings | null, big: boolean): void => {
  b.align('center').bold(true);
  if (big) b.doubleSize(true);
  b.line((settings?.setup_completed && settings.business_name) || 'BloomPOS');
  if (big) b.doubleSize(false);
  b.bold(false);
  if (settings?.setup_completed && settings.address) b.line(settings.address);
  if (settings?.setup_completed && settings.phone) b.line(settings.phone);
};

const saleMeta = (b: EscPosBuilder, sale: Sale): void => {
  b.align('center');
  b.line(`#${sale.sale_number}`);
  b.line(new Date(sale.created_at).toLocaleString());
  if (sale.payment_method === 'credit') {
    b.bold(true).line('CREDIT / PAY LATER').bold(false);
  }
  if (sale.customer_name) b.line(`Customer: ${sale.customer_name}`);
};

const totalsBlock = (b: EscPosBuilder, sale: Sale, settings: Settings | null): void => {
  b.align('left');
  b.twoCol('Subtotal', amount(settings, sale.subtotal));
  if (sale.discount_amount > 0) b.twoCol('Discount', `-${amount(settings, sale.discount_amount)}`);
  if (sale.tax_amount > 0) b.twoCol('Tax', amount(settings, sale.tax_amount));
  b.hr();
  b.bold(true).twoCol('TOTAL', amount(settings, sale.total_amount)).bold(false);
  if (sale.payment_method === 'credit') {
    b.twoCol('Payment', 'Credit (Pay Later)');
  } else {
    if (sale.cash_tendered > 0) b.twoCol('Cash Tendered', amount(settings, sale.cash_tendered));
    if (sale.change_amount > 0) b.twoCol('Change', amount(settings, sale.change_amount));
  }
};

export function buildReceiptStandard(sale: Sale, items: SaleItem[], settings: Settings | null, charsPerLine: number): Uint8Array {
  const b = new EscPosBuilder(charsPerLine);
  businessHeader(b, settings, true);
  saleMeta(b, sale);
  b.hr();
  b.align('left');
  for (const item of items) {
    b.wrapAndPrint(item.product_name);
    b.twoCol(`  ${item.quantity} x ${amount(settings, item.unit_price)}`, amount(settings, item.subtotal));
  }
  b.hr();
  totalsBlock(b, sale, settings);
  b.feed(1);
  b.align('center').line('Thank you! Please come again.');
  b.cut();
  return b.toBytes();
}

export function buildReceiptCompact(sale: Sale, items: SaleItem[], settings: Settings | null, charsPerLine: number): Uint8Array {
  const b = new EscPosBuilder(charsPerLine);
  businessHeader(b, settings, false);
  saleMeta(b, sale);
  b.hr();
  b.align('left');
  for (const item of items) {
    const label = `${item.quantity}x ${item.product_name}`;
    b.twoCol(label, amount(settings, item.subtotal));
  }
  b.hr();
  if (sale.discount_amount > 0 || sale.tax_amount > 0) {
    totalsBlock(b, sale, settings);
  } else {
    b.bold(true).twoCol('TOTAL', amount(settings, sale.total_amount)).bold(false);
    if (sale.payment_method === 'credit') {
      b.twoCol('Payment', 'Credit');
    } else {
      if (sale.cash_tendered > 0) b.twoCol('Cash', amount(settings, sale.cash_tendered));
      if (sale.change_amount > 0) b.twoCol('Change', amount(settings, sale.change_amount));
    }
  }
  b.align('center').line('Thank you!');
  b.cut();
  return b.toBytes();
}

export function buildReceiptDetailed(sale: Sale, items: SaleItem[], settings: Settings | null, charsPerLine: number): Uint8Array {
  const b = new EscPosBuilder(charsPerLine);
  businessHeader(b, settings, true);
  saleMeta(b, sale);
  b.hr();
  b.align('left');
  for (const item of items) {
    b.wrapAndPrint(item.product_name);
    if (item.barcode) b.line(`  Barcode: ${item.barcode}`);
    b.twoCol(`  ${item.quantity} x ${amount(settings, item.unit_price)}`, amount(settings, item.subtotal));
    if (item.taxes && item.taxes.length > 0) {
      for (const tax of item.taxes) {
        b.twoCol(`    ${tax.tax_name} (${tax.tax_rate}%)`, amount(settings, tax.tax_amount));
      }
    }
  }
  b.hr();
  totalsBlock(b, sale, settings);
  b.feed(1);
  b.align('center');
  b.line('Thank you for shopping with us!');
  if (settings?.default_invoice_note) b.wrapAndPrint(settings.default_invoice_note);
  if (settings?.email) b.line(settings.email);
  b.cut();
  return b.toBytes();
}

export function buildReceiptEscPos(sale: Sale, items: SaleItem[], settings: Settings | null, template: ReceiptTemplate, charsPerLine: number): Uint8Array {
  if (template === 'compact') return buildReceiptCompact(sale, items, settings, charsPerLine);
  if (template === 'detailed') return buildReceiptDetailed(sale, items, settings, charsPerLine);
  return buildReceiptStandard(sale, items, settings, charsPerLine);
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
