import { useState, useEffect, useCallback } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { PageLoader } from '../components/ui/LoadingSpinner';
import api from '../services/api';
import { useT } from '../i18n/translations';

const fmt = (n: number) => `LKR ${Number(n).toFixed(2)}`;
const today = new Date().toISOString().slice(0, 10);
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

type ReportTab = 'sales' | 'products' | 'inventory' | 'cashiers';

export default function Reports() {
  const t = useT();
  const [tab, setTab] = useState<ReportTab>('sales');
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [loading, setLoading] = useState(false);
  const [salesData, setSalesData] = useState<{ periods: unknown[]; summary: Record<string, number> } | null>(null);
  const [productsData, setProductsData] = useState<unknown[]>([]);
  const [inventoryData, setInventoryData] = useState<unknown[]>([]);
  const [cashiersData, setCashiersData] = useState<unknown[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'sales') {
        const r = await api.get(`/reports/sales?date_from=${dateFrom}&date_to=${dateTo}`);
        setSalesData(r.data.data);
      } else if (tab === 'products') {
        const r = await api.get(`/reports/product-sales?date_from=${dateFrom}&date_to=${dateTo}`);
        setProductsData(r.data.data);
      } else if (tab === 'inventory') {
        const r = await api.get('/reports/inventory');
        setInventoryData(r.data.data);
      } else if (tab === 'cashiers') {
        const r = await api.get(`/reports/cashiers?date_from=${dateFrom}&date_to=${dateTo}`);
        setCashiersData(r.data.data);
      }
    } finally { setLoading(false); }
  }, [tab, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const tabs: Array<{ key: ReportTab; label: string }> = [
    { key: 'sales', label: t.reports_tab_sales },
    { key: 'products', label: t.reports_tab_products },
    { key: 'inventory', label: t.reports_tab_inventory },
    { key: 'cashiers', label: t.reports_tab_cashiers },
  ];

  return (
    <PageContainer>
      <div className="page-header">
        <h1 className="page-title">{t.reports_title}</h1>
        <button onClick={() => window.print()} className="btn-secondary btn-sm">
          🖨️ Print
        </button>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-surface-200 mb-4">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Date Range (not for inventory) */}
      {tab !== 'inventory' && (
        <div className="flex items-center gap-3 mb-4">
          <div>
            <label className="label">{t.reports_from}</label>
            <input type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">{t.reports_to}</label>
            <input type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="pt-5">
            <button onClick={load} className="btn-primary">{t.reports_load}</button>
          </div>
        </div>
      )}

      {loading ? <PageLoader /> : (
        <>
          {/* SALES REPORT */}
          {tab === 'sales' && salesData && (
            <>
              <div className="grid grid-cols-4 gap-4 mb-4">
                {[
                  [t.reports_total_sales, fmt(salesData.summary?.total_revenue || 0), 'text-primary-600'],
                  [t.reports_total_profit, fmt(salesData.summary?.total_profit || 0), 'text-emerald-600'],
                  [t.reports_transactions, salesData.summary?.total_transactions || 0, ''],
                  [t.reports_cash_sales, fmt(salesData.summary?.total_discounts || 0), 'text-red-600'],
                ].map(([label, value, color], i) => (
                  <div key={i} className="stat-card">
                    <p className="stat-label">{label}</p>
                    <p className={`stat-value ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="card">
                <table className="table">
                  <thead><tr><th>{t.reports_col_date}</th><th className="text-right">{t.reports_col_transactions}</th><th className="text-right">{t.reports_col_revenue}</th><th className="text-right">{t.reports_col_profit}</th><th className="text-right">{t.reports_cash_sales}</th></tr></thead>
                  <tbody>
                    {(salesData.periods as Array<Record<string, unknown>>).map((row, i) => (
                      <tr key={i}>
                        <td>{new Date(String(row.period)).toLocaleDateString()}</td>
                        <td className="text-right">{String(row.transactions)}</td>
                        <td className="text-right font-mono font-semibold text-primary-600">{fmt(Number(row.revenue))}</td>
                        <td className="text-right font-mono text-emerald-600">{fmt(Number(row.profit))}</td>
                        <td className="text-right font-mono text-red-500">{fmt(Number(row.discounts))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* PRODUCT SALES */}
          {tab === 'products' && (
            <div className="card">
              <table className="table">
                <thead><tr><th>{t.reports_col_product}</th><th>{t.category}</th><th className="text-right">{t.reports_col_qty}</th><th className="text-right">{t.reports_col_revenue}</th><th className="text-right">{t.reports_col_cost}</th><th className="text-right">{t.reports_col_profit}</th></tr></thead>
                <tbody>
                  {(productsData as Array<Record<string, unknown>>).map((p, i) => (
                    <tr key={i}>
                      <td className="font-medium">{String(p.product_name)}</td>
                      <td>{String(p.category_name || '—')}</td>
                      <td className="text-right font-mono">{Number(p.qty_sold).toFixed(2)}</td>
                      <td className="text-right font-mono text-primary-600">{fmt(Number(p.revenue))}</td>
                      <td className="text-right font-mono text-surface-500">{fmt(Number(p.cost))}</td>
                      <td className="text-right font-mono text-emerald-600">{fmt(Number(p.profit))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* INVENTORY */}
          {tab === 'inventory' && (
            <div className="card">
              <div className="px-4 py-3 border-b border-surface-200 flex items-center justify-between">
                <span className="text-sm font-medium text-surface-700">
                  Total Stock Value: <span className="font-bold text-primary-600">
                    {fmt((inventoryData as Array<Record<string, number>>).reduce((s, p) => s + (Number(p.stock_value) || 0), 0))}
                  </span>
                </span>
                <span className="text-sm text-surface-500">{inventoryData.length} products</span>
              </div>
              <table className="table">
                <thead><tr><th>{t.reports_col_product}</th><th>SKU</th><th>{t.category}</th><th className="text-right">{t.reports_col_stock}</th><th className="text-right">{t.inventory_col_avg_cost}</th><th className="text-right">{t.reports_col_stock_value}</th><th>{t.status}</th></tr></thead>
                <tbody>
                  {(inventoryData as Array<Record<string, unknown>>).map((p, i) => (
                    <tr key={i}>
                      <td className="font-medium">{String(p.name)}</td>
                      <td className="font-mono text-xs">{String(p.sku)}</td>
                      <td>{String(p.category_name || '—')}</td>
                      <td className="text-right font-mono">{Number(p.current_stock).toFixed(2)}</td>
                      <td className="text-right font-mono">LKR {Number(p.avg_cost).toFixed(4)}</td>
                      <td className="text-right font-mono font-semibold">LKR {Number(p.stock_value).toFixed(2)}</td>
                      <td><span className={`badge ${p.is_low_stock ? 'badge-red' : 'badge-green'}`}>{p.is_low_stock ? t.inventory_low_stock : t.inventory_ok}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* CASHIERS */}
          {tab === 'cashiers' && (
            <div className="card">
              <table className="table">
                <thead><tr><th>{t.reports_col_name}</th><th className="text-right">{t.reports_col_transactions}</th><th className="text-right">{t.reports_col_revenue}</th><th className="text-right">{t.reports_col_profit}</th></tr></thead>
                <tbody>
                  {(cashiersData as Array<Record<string, unknown>>).map((c, i) => (
                    <tr key={i}>
                      <td className="font-medium">{String(c.cashier_name)}</td>
                      <td className="text-right">{String(c.transactions)}</td>
                      <td className="text-right font-mono text-primary-600">{fmt(Number(c.revenue))}</td>
                      <td className="text-right font-mono text-emerald-600">{fmt(Number(c.profit))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
