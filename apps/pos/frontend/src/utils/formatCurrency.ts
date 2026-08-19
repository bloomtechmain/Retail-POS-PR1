import { useSettingsStore } from '../store/settingsStore';

export function formatCurrency(amount: number | string, decimals = 2): string {
  const symbol = useSettingsStore.getState().settings?.currency_symbol ?? '$';
  const n = Number(amount) || 0;
  return `${symbol} ${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
