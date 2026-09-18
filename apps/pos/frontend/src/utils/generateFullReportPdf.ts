import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Settings } from '../types';
import { formatQuantity } from './units';

const NAVY: [number, number, number] = [23, 37, 68];
const GRAY: [number, number, number] = [90, 90, 90];

export type ReportTab = 'sales' | 'products' | 'inventory' | 'cashiers' | 'credit' | 'stock-movements' | 'promotions';

const TAB_TITLES: Record<ReportTab, string> = {
  sales: 'Sales Report',
  products: 'Product Sales Report',
  inventory: 'Inventory Report',
  cashiers: 'Cashier Performance Report',
  credit: 'Credit Customers Report',
  'stock-movements': 'Stock Movements Report',
  promotions: 'Promotions & Coupons Report',
};

// Inventory/credit are point-in-time snapshots, not date-ranged like the rest.
const HAS_DATE_RANGE: Record<ReportTab, boolean> = {
  sales: true, products: true, inventory: false, cashiers: true,
  credit: false, 'stock-movements': true, promotions: true,
};

type Row = Record<string, unknown>;

export interface FullReportData {
  salesData?: { periods: unknown[]; summary: Record<string, number> } | null;
  productsData?: unknown[];
  inventoryData?: unknown[];
  cashiersData?: unknown[];
  creditData?: { customers: unknown[]; summary: Record<string, number> } | null;
  stockMovementsData?: unknown[];
  promotionsData?: { promotions: unknown[]; coupons: unknown[] };
}

const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown, fallback = '-') => (v === null || v === undefined || v === '' ? fallback : String(v));

export function generateFullReportPdf(
  tab: ReportTab,
  data: FullReportData,
  settings: Settings,
  dateFrom: string,
  dateTo: string
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const symbol = settings.currency_symbol || '';
  const fmtMoney = (v: unknown) => `${symbol} ${num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  let y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text(settings.business_name || 'BloomPOS', marginX, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(TAB_TITLES[tab], marginX, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...GRAY);
  doc.text(
    HAS_DATE_RANGE[tab]
      ? `${new Date(dateFrom).toLocaleDateString()} — ${new Date(dateTo).toLocaleDateString()}`
      : `As of ${new Date().toLocaleDateString()}`,
    marginX, y
  );
  y += 7;

  const table = (head: string[], body: (string | number)[][], rightCols: number[] = []) => {
    const columnStyles: Record<number, { halign: 'right' }> = {};
    rightCols.forEach((i) => { columnStyles[i] = { halign: 'right' }; });
    autoTable(doc, {
      startY: y,
      head: [head],
      body: body.length > 0 ? body : [head.map(() => '—')],
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.2, textColor: NAVY, lineColor: [210, 214, 222], lineWidth: 0.2, overflow: 'linebreak' },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      columnStyles,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 8;
  };

  const sectionTitle = (title: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(title, marginX, y);
    y += 5;
  };

  if (tab === 'sales' && data.salesData) {
    const s = data.salesData.summary || {};
    table(['Metric', 'Value'], [
      ['Total Sales', fmtMoney(s.total_revenue)],
      ['Total Profit', fmtMoney(s.total_profit)],
      ['Transactions', String(num(s.total_transactions))],
      ['Discounts', fmtMoney(s.total_discounts)],
    ], [1]);
    table(
      ['Date', 'Transactions', 'Revenue', 'Profit', 'Discounts'],
      (data.salesData.periods as Row[]).map((r) => [
        new Date(String(r.period)).toLocaleDateString(),
        String(r.transactions),
        fmtMoney(r.revenue),
        fmtMoney(r.profit),
        fmtMoney(r.discounts),
      ]),
      [1, 2, 3, 4]
    );
  } else if (tab === 'products') {
    table(
      ['Product', 'Category', 'Qty Sold', 'Revenue', 'Cost', 'Profit'],
      ((data.productsData as Row[]) || []).map((p) => [
        str(p.product_name), str(p.category_name, '—'), num(p.qty_sold).toFixed(2),
        fmtMoney(p.revenue), fmtMoney(p.cost), fmtMoney(p.profit),
      ]),
      [2, 3, 4, 5]
    );
  } else if (tab === 'inventory') {
    const rows = (data.inventoryData as Row[]) || [];
    const totalValue = rows.reduce((sum, p) => sum + num(p.stock_value), 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...GRAY);
    doc.text(`Total Stock Value: ${fmtMoney(totalValue)}  ·  ${rows.length} products`, marginX, y);
    y += 6;
    table(
      ['Product', 'SKU', 'Category', 'Stock', 'Avg Cost', 'Stock Value', 'Status'],
      rows.map((p) => [
        str(p.name), str(p.sku), str(p.category_name, '—'),
        formatQuantity(num(p.current_stock), String(p.unit_type || '')),
        fmtMoney(p.avg_cost), fmtMoney(p.stock_value),
        p.is_low_stock ? 'Low Stock' : 'OK',
      ]),
      [3, 4, 5]
    );
  } else if (tab === 'cashiers') {
    table(
      ['Cashier', 'Transactions', 'Revenue', 'Profit'],
      ((data.cashiersData as Row[]) || []).map((c) => [
        str(c.cashier_name), String(c.transactions), fmtMoney(c.revenue), fmtMoney(c.profit),
      ]),
      [1, 2, 3]
    );
  } else if (tab === 'credit' && data.creditData) {
    const s = data.creditData.summary || {};
    table(['Metric', 'Value'], [
      ['Total Outstanding', fmtMoney(s.total_outstanding)],
      ['Customers With Balance', String(num(s.customers_with_balance))],
      ['Total Credit Customers', String(num(s.total_customers))],
    ], [1]);
    table(
      ['Customer', 'Phone', 'Credit Limit', 'Outstanding', 'Lifetime Credit Sales', 'Last Sale', 'Last Payment'],
      (data.creditData.customers as Row[]).map((c) => [
        str(c.name), str(c.phone, '—'),
        c.credit_limit == null ? 'Unlimited' : fmtMoney(c.credit_limit),
        fmtMoney(c.current_balance), fmtMoney(c.lifetime_credit_sales),
        c.last_sale_date ? new Date(String(c.last_sale_date)).toLocaleDateString() : 'Never',
        c.last_payment_date ? new Date(String(c.last_payment_date)).toLocaleDateString() : 'Never',
      ]),
      [2, 3, 4]
    );
  } else if (tab === 'stock-movements') {
    table(
      ['Date', 'Product', 'Type', 'Qty', 'Before', 'After'],
      ((data.stockMovementsData as Row[]) || []).map((m) => [
        new Date(String(m.created_at)).toLocaleString(),
        str(m.product_name), str(m.movement_type),
        num(m.quantity).toFixed(2), num(m.balance_before).toFixed(2), num(m.balance_after).toFixed(2),
      ]),
      [3, 4, 5]
    );
  } else if (tab === 'promotions') {
    sectionTitle('Promotions');
    table(
      ['Promotion', 'Times Used', 'Total Discount'],
      ((data.promotionsData?.promotions as Row[]) || []).map((p) => [str(p.name), String(p.times_used), fmtMoney(p.total_discount)]),
      [1, 2]
    );
    sectionTitle('Coupons');
    table(
      ['Code', 'Times Used', 'Total Discount'],
      ((data.promotionsData?.coupons as Row[]) || []).map((c) => [str(c.code), String(c.times_used), fmtMoney(c.total_discount)]),
      [1, 2]
    );
  }

  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(`Generated on ${new Date().toLocaleString()}`, marginX, Math.max(y + 2, pageHeight - 12));

  doc.save(`${tab}-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}
