import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Sale, Settings } from '../types';
import { amountToWords } from './numberToWords';

const NAVY: [number, number, number] = [23, 37, 68];
const GRAY: [number, number, number] = [90, 90, 90];

const fmtMoney = (v: number | string, symbol: string) =>
  `${symbol} ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtNum = (v: number | string) =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d?: string | null) => {
  if (!d) return '-';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '-';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', mixed: 'Cash & Card', credit: 'Credit',
};

export function generateVatInvoicePdf(sale: Sale, settings: Settings) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const symbol = settings.currency_symbol || '';
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 16;
  const colGap = 6;
  const colWidth = (pageWidth - marginX * 2 - colGap) / 2;
  const rightColX = marginX + colWidth + colGap;
  const labelOffset = 34;

  // ── Title, flanked by rules — no logos/branding, standard tax-invoice
  // format only ─────────────────────────────────────────────────────────
  const titleY = 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text('TAX INVOICE', pageWidth / 2, titleY, { align: 'center' });
  const titleWidth = doc.getTextWidth('TAX INVOICE');
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.4);
  doc.line(marginX, titleY - 1.5, pageWidth / 2 - titleWidth / 2 - 6, titleY - 1.5);
  doc.line(pageWidth / 2 + titleWidth / 2 + 6, titleY - 1.5, pageWidth - marginX, titleY - 1.5);

  let y = titleY + 12;

  // ── Two-column key/value grid ───────────────────────────────────────
  const row = (leftLabel: string, leftValue: string, rightLabel: string, rightValue: string) => {
    const valueWidth = colWidth - labelOffset;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(leftLabel, marginX, y);
    doc.text(rightLabel, rightColX, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...NAVY);
    const leftLines = doc.splitTextToSize(leftValue || '-', valueWidth);
    const rightLines = doc.splitTextToSize(rightValue || '-', valueWidth);
    doc.text(leftLines, marginX + labelOffset, y);
    doc.text(rightLines, rightColX + labelOffset, y);
    y += Math.max(leftLines.length, rightLines.length) * 4.6 + 3.2;
  };

  row('Date of Invoice', fmtDate(sale.created_at), 'Tax Invoice No', sale.vat_invoice_number || sale.sale_number);
  row("Supplier's TIN", settings.vat_registration_number || '-', "Purchaser's TIN", sale.buyer_vat_reg_no || '-');
  row("Supplier's Name", settings.business_name || '-', "Purchaser's Name", sale.customer_name || 'Walk-in Customer');
  row('Address', settings.address || '-', 'Address', sale.buyer_address || '-');
  row('Telephone No', settings.phone || '-', 'Telephone No', sale.buyer_phone || '-');
  row('Date of Delivery', fmtDate(sale.delivery_date), 'Place of Supply', sale.place_of_supply || '-');

  y += 4;

  // ── Line items ───────────────────────────────────────────────────────
  const taxTotalsByName = new Map<string, { amount: number; rate: number }>();
  const rows = (sale.items || []).map((item) => {
    const taxable = Number(item.subtotal) - Number(item.tax_amount);
    for (const t of item.taxes || []) {
      const existing = taxTotalsByName.get(t.tax_name);
      taxTotalsByName.set(t.tax_name, {
        amount: (existing?.amount || 0) + Number(t.tax_amount),
        rate: Number(t.tax_rate),
      });
    }
    return [
      item.barcode || '',
      item.product_name,
      fmtNum(item.quantity),
      fmtNum(item.unit_price),
      fmtNum(taxable),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Reference', 'Description of Goods or Services', 'Quantity', 'Unit Price', 'Amount Excl. Tax']],
    body: rows,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: NAVY, lineColor: [210, 214, 222], lineWidth: 0.2 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', lineColor: NAVY },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Totals ───────────────────────────────────────────────────────────
  const totalsLabelX = pageWidth - marginX - 75;
  const netOfDiscount = round2(Number(sale.subtotal) - Number(sale.item_discount) - Number(sale.bill_discount));
  const totalsLine = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 10.5 : 9.5);
    doc.setTextColor(...NAVY);
    doc.text(label, totalsLabelX, y);
    doc.text(value, pageWidth - marginX, y, { align: 'right' });
    y += bold ? 6.5 : 5.5;
  };

  totalsLine('Total Value of Supply', fmtMoney(netOfDiscount, symbol));
  const taxNames = Array.from(taxTotalsByName.keys());
  for (const name of taxNames) {
    const t = taxTotalsByName.get(name)!;
    totalsLine(`${name} Amount (@ ${t.rate}%)`, fmtMoney(t.amount, symbol));
  }
  // Divider needs clearance from both the row above (its own text already
  // ends a little above the current y) and the bold total row below it
  // (taller font, so its cap-height reaches higher above its baseline) —
  // a flat "y - 2" cut straight through the bold text when there were no
  // itemized tax rows to push y further down first.
  y += 1.5;
  doc.setDrawColor(200);
  doc.line(totalsLabelX, y, pageWidth - marginX, y);
  y += 5;
  const totalLabel = taxNames.length === 1 ? `Total Amount Including ${taxNames[0]}` : 'Total Amount Including Tax';
  totalsLine(totalLabel, fmtMoney(sale.total_amount, symbol), true);

  y += 4;

  // ── Amount in words ──────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...NAVY);
  doc.text('Total Amount in Words', marginX, y);
  y += 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...NAVY);
  const wordsLines = doc.splitTextToSize(amountToWords(Number(sale.total_amount), settings.currency_code), pageWidth - marginX * 2);
  doc.text(wordsLines, marginX, y);
  y += wordsLines.length * 4.6 + 6;

  // ── Mode of payment ──────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...NAVY);
  doc.text('Mode Of Payment', marginX, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...NAVY);
  doc.text(PAYMENT_LABELS[sale.payment_method] || sale.payment_method, marginX + labelOffset, y);
  y += 8;

  if (sale.payment_method === 'cash' || sale.payment_method === 'mixed') {
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text(`Cash Tendered: ${fmtMoney(sale.cash_tendered, symbol)}    Change: ${fmtMoney(sale.change_amount, symbol)}`, marginX, y);
    y += 6;
  }

  // ── Footer ───────────────────────────────────────────────────────────
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('Thank you for your business.', marginX, pageHeight - 14);
  doc.text(`Generated by ${sale.cashier_name || 'System'} on ${new Date().toLocaleString()}`, marginX, pageHeight - 9);

  doc.save(`${sale.vat_invoice_number || sale.sale_number}.pdf`);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
