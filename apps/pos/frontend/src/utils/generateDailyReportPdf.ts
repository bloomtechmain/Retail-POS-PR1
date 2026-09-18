import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Settings } from '../types';

const NAVY: [number, number, number] = [23, 37, 68];
const GRAY: [number, number, number] = [90, 90, 90];

interface TransactionItem {
  product_name: string;
  quantity: number;
}

interface Transaction {
  sale_number: string;
  created_at: string;
  status: string;
  payment_method: string;
  cashier_name: string | null;
  customer_name: string | null;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  items: TransactionItem[];
}

interface DailySummary {
  date: string;
  total_transactions: number;
  total_revenue: number;
  total_profit: number;
  total_discounts: number;
  transactions: Transaction[];
}

const fmtMoney = (v: number, symbol: string) =>
  `${symbol} ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function generateDailyReportPdf(summary: DailySummary, settings: Settings) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const symbol = settings.currency_symbol || '';
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text(settings.business_name || 'Daily Sales Report', marginX, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  if (settings.address) doc.text(settings.address, marginX, 26);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  const reportDate = new Date(summary.date).toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  doc.text(`Daily Sales Report — ${reportDate}`, marginX, 36);

  autoTable(doc, {
    startY: 44,
    head: [['Metric', 'Value']],
    body: [
      ['Transactions', String(summary.total_transactions)],
      ['Revenue', fmtMoney(summary.total_revenue, symbol)],
      ['Profit', fmtMoney(summary.total_profit, symbol)],
      ['Discounts Given', fmtMoney(summary.total_discounts, symbol)],
    ],
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 3, textColor: NAVY, lineColor: [210, 214, 222], lineWidth: 0.2 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = (doc as any).lastAutoTable.finalY + 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text('Every Transaction Today', marginX, y);
  y += 6;

  const rows = summary.transactions.map((tx) => [
    new Date(tx.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    tx.sale_number,
    tx.cashier_name || '-',
    tx.customer_name || 'Walk-in',
    tx.items.map((it) => `${Number(it.quantity)}x ${it.product_name}`).join(', '),
    tx.payment_method,
    tx.status,
    fmtMoney(tx.discount_amount, symbol),
    fmtMoney(tx.tax_amount, symbol),
    fmtMoney(tx.total_amount, symbol),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Time', 'Sale #', 'Cashier', 'Customer', 'Items', 'Payment', 'Status', 'Discount', 'Tax', 'Total']],
    body: rows.length > 0 ? rows : [['—', '—', '—', '—', 'No transactions yet today', '—', '—', '—', '—', '—']],
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, textColor: NAVY, lineColor: [210, 214, 222], lineWidth: 0.2, overflow: 'linebreak' },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      4: { cellWidth: 55 },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right' },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable.finalY;
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(`Generated on ${new Date().toLocaleString()}`, marginX, Math.max(finalY + 10, pageHeight - 12));

  doc.save(`daily-report-${summary.date}.pdf`);
}
