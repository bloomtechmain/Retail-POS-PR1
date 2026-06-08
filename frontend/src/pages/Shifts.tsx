import { useState, useEffect, useCallback } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { Modal } from '../components/ui/Modal';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { useToastStore } from '../store/toastStore';
import { Shift } from '../types';
import api from '../services/api';
import { AxiosError } from 'axios';
import { useT } from '../i18n/translations';

const fmt = (n: number) => `LKR ${Number(n).toFixed(2)}`;

export default function Shifts() {
  const t = useT();
  const toast = useToastStore();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [reportModal, setReportModal] = useState(false);
  const [shiftReport, setShiftReport] = useState<{
    shift: Shift; summary: Record<string, number>; topProducts: Array<Record<string, unknown>>;
  } | null>(null);
  const [openingCash, setOpeningCash] = useState('0');
  const [actualCash, setActualCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shiftsR, currentR] = await Promise.all([
        api.get('/shifts'),
        api.get('/shifts/current'),
      ]);
      setShifts(shiftsR.data.data);
      setCurrentShift(currentR.data.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleOpenShift = async () => {
    setSaving(true);
    try {
      await api.post('/shifts/open', { opening_cash: parseFloat(openingCash) || 0 });
      toast.success('Shift opened');
      setOpenModal(false);
      load();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  const handleCloseShift = async () => {
    if (!currentShift || actualCash === '') { toast.error('Enter actual cash amount'); return; }
    setSaving(true);
    try {
      await api.put(`/shifts/${currentShift.id}/close`, {
        actual_cash: parseFloat(actualCash),
        notes: closeNotes,
      });
      toast.success('Shift closed');
      setCloseModal(false);
      setActualCash('');
      setCloseNotes('');
      load();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  const viewReport = async (id: number) => {
    const r = await api.get(`/shifts/${id}/report`);
    setShiftReport(r.data.data);
    setReportModal(true);
  };

  return (
    <PageContainer>
      <div className="page-header">
        <h1 className="page-title">{t.shifts_title}</h1>
        <div className="flex gap-2">
          {currentShift ? (
            <button onClick={() => setCloseModal(true)} className="btn-danger">
              {t.shifts_close_btn}
            </button>
          ) : (
            <button onClick={() => setOpenModal(true)} className="btn-primary">
              {t.shifts_open_btn}
            </button>
          )}
        </div>
      </div>

      {/* Current Shift Banner */}
      {currentShift && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">{t.shifts_active} {currentShift.shift_number}</p>
            <p className="text-xs text-emerald-600">
              Opened {new Date(currentShift.open_time).toLocaleString()} by {currentShift.opened_by_name}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-emerald-700">{fmt(currentShift.total_sales || 0)}</p>
            <p className="text-xs text-emerald-600">{currentShift.total_transactions} {t.shifts_transactions}</p>
          </div>
        </div>
      )}

      {loading ? <PageLoader /> : (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.shifts_col_shift}</th>
                  <th>{t.shifts_col_opened_by}</th>
                  <th>{t.shifts_col_open_time}</th>
                  <th>{t.shifts_col_close_time}</th>
                  <th className="text-right">{t.shifts_col_opening_cash}</th>
                  <th className="text-right">{t.shifts_col_total_sales}</th>
                  <th className="text-right">{t.shifts_col_cash_diff}</th>
                  <th>{t.shifts_col_status}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shifts.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-surface-400">{t.shifts_no_data}</td></tr>
                ) : shifts.map((s: Shift & { total_sales_amount?: number; transaction_count?: number }) => (
                  <tr key={s.id}>
                    <td className="font-mono text-primary-600">{s.shift_number}</td>
                    <td>{s.opened_by_name}</td>
                    <td className="text-sm">{new Date(s.open_time).toLocaleString()}</td>
                    <td className="text-sm">{s.close_time ? new Date(s.close_time).toLocaleString() : '—'}</td>
                    <td className="text-right font-mono">{fmt(s.opening_cash)}</td>
                    <td className="text-right font-mono font-semibold">{fmt(s.total_sales || 0)}</td>
                    <td className={`text-right font-mono ${s.cash_difference ? (s.cash_difference < 0 ? 'text-red-600' : 'text-emerald-600') : ''}`}>
                      {s.cash_difference !== undefined && s.cash_difference !== null ? fmt(s.cash_difference) : '—'}
                    </td>
                    <td>
                      <span className={`badge ${s.status === 'open' ? 'badge-green' : 'badge-gray'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => viewReport(s.id)} className="btn-ghost btn-sm">{t.shifts_report_btn}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Open Shift Modal */}
      <Modal isOpen={openModal} onClose={() => setOpenModal(false)} title={t.shifts_open_title} size="sm"
        footer={
          <>
            <button onClick={() => setOpenModal(false)} className="btn-secondary">{t.cancel}</button>
            <button onClick={handleOpenShift} disabled={saving} className="btn-primary">{t.shifts_open_btn}</button>
          </>
        }>
        <div className="space-y-4">
          <div>
            <label className="label">{t.shifts_opening_cash_label}</label>
            <input type="number" className="input-lg font-mono text-center" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} min="0" step="0.01" autoFocus />
          </div>
        </div>
      </Modal>

      {/* Close Shift Modal */}
      <Modal isOpen={closeModal} onClose={() => setCloseModal(false)} title={t.shifts_close_title} size="sm"
        footer={
          <>
            <button onClick={() => setCloseModal(false)} className="btn-secondary">{t.cancel}</button>
            <button onClick={handleCloseShift} disabled={saving} className="btn-danger">{t.shifts_close_btn}</button>
          </>
        }>
        <div className="space-y-4">
          {currentShift && (
            <div className="bg-surface-50 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-surface-500">{t.shifts_close_opening_cash}</span>
<span className="font-mono">{fmt(currentShift.opening_cash)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-surface-500">{t.shifts_close_cash_sales}</span>
                <span className="font-mono">{fmt(currentShift.total_cash_sales || 0)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-surface-200 pt-1">
                <span>{t.shifts_close_expected}</span>
                <span className="font-mono">{fmt((currentShift.opening_cash || 0) + (currentShift.total_cash_sales || 0))}</span>
              </div>
            </div>
          )}
          <div>
            <label className="label">{t.shifts_actual_cash_label}</label>
            <input type="number" className="input-lg font-mono text-center" value={actualCash} onChange={(e) => setActualCash(e.target.value)} min="0" step="0.01" autoFocus />
          </div>
          <div>
            <label className="label">{t.shifts_notes_label}</label>
            <textarea className="input h-20 resize-none" value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} placeholder={t.shifts_notes_placeholder} />
          </div>
        </div>
      </Modal>

      {/* Report Modal */}
      <Modal isOpen={reportModal} onClose={() => setReportModal(false)} title={t.shifts_report_title} size="xl">
        {shiftReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                [t.shifts_report_revenue, fmt(shiftReport.summary.total_revenue || 0), 'text-primary-600'],
                [t.shifts_report_profit, fmt(shiftReport.summary.total_profit || 0), 'text-emerald-600'],
                [t.shifts_report_tx, shiftReport.summary.total_transactions, ''],
                [t.shifts_report_cash, fmt(shiftReport.summary.total_cash || 0), ''],
                [t.shifts_report_card, fmt(shiftReport.summary.total_card || 0), ''],
                [t.shifts_report_voided, shiftReport.summary.voided_count, 'text-red-600'],
              ].map(([label, value, color], i) => (
                <div key={i} className="bg-surface-50 rounded-lg p-3">
                  <p className="text-xs text-surface-500">{label}</p>
                  <p className={`text-lg font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>
            {shiftReport.topProducts.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">{t.shifts_report_top}</h4>
                <table className="table border border-surface-200 rounded-lg overflow-hidden">
                  <thead><tr><th>{t.shifts_report_col_product}</th><th className="text-right">{t.shifts_report_col_qty}</th><th className="text-right">{t.shifts_report_col_revenue}</th></tr></thead>
                  <tbody>
                    {shiftReport.topProducts.map((p, i) => (
                      <tr key={i}>
                        <td>{String(p.name)}</td>
                        <td className="text-right font-mono">{String(p.qty_sold)}</td>
                        <td className="text-right font-mono">{fmt(Number(p.revenue))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
