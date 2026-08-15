import { ChangeEvent } from 'react';

export interface BusinessProfileValue {
  business_name: string;
  logo_data_url: string;
  address: string;
  phone: string;
  email: string;
  currency_code: string;
  currency_symbol: string;
}

const CURRENCY_PRESETS = [
  { code: 'USD', symbol: '$', label: 'USD ($) — US Dollar' },
  { code: 'LKR', symbol: 'Rs', label: 'LKR (Rs) — Sri Lankan Rupee' },
  { code: 'INR', symbol: '₹', label: 'INR (₹) — Indian Rupee' },
  { code: 'EUR', symbol: '€', label: 'EUR (€) — Euro' },
  { code: 'GBP', symbol: '£', label: 'GBP (£) — British Pound' },
  { code: 'CUSTOM', symbol: '', label: 'Custom...' },
];

interface Props {
  value: BusinessProfileValue;
  onChange: (value: BusinessProfileValue) => void;
}

export function BusinessProfileForm({ value, onChange }: Props) {
  const set = (patch: Partial<BusinessProfileValue>) => onChange({ ...value, ...patch });

  const selectedPreset = CURRENCY_PRESETS.find(
    (p) => p.code === value.currency_code && p.symbol === value.currency_symbol
  );
  const isCustomCurrency = !selectedPreset;

  const handleLogoFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set({ logo_data_url: String(reader.result || '') });
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="label">Business Name</label>
        <input
          className="input"
          value={value.business_name}
          onChange={(e) => set({ business_name: e.target.value })}
          placeholder="e.g. Green Valley Grocery"
        />
      </div>

      <div>
        <label className="label">Logo</label>
        <div className="flex items-center gap-3">
          {value.logo_data_url && (
            <img src={value.logo_data_url} alt="Logo preview" className="w-12 h-12 rounded-lg object-contain bg-surface-100 border border-surface-200" />
          )}
          <input type="file" accept="image/*" onChange={handleLogoFile} className="text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Phone</label>
          <input className="input" value={value.phone} onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" value={value.email} onChange={(e) => set({ email: e.target.value })} />
        </div>
      </div>

      <div>
        <label className="label">Address</label>
        <textarea className="input" rows={2} value={value.address} onChange={(e) => set({ address: e.target.value })} />
      </div>

      <div>
        <label className="label">Currency</label>
        <select
          className="input"
          value={isCustomCurrency ? 'CUSTOM' : value.currency_code}
          onChange={(e) => {
            const preset = CURRENCY_PRESETS.find((p) => p.code === e.target.value);
            if (preset && preset.code !== 'CUSTOM') {
              set({ currency_code: preset.code, currency_symbol: preset.symbol });
            } else {
              set({ currency_code: '', currency_symbol: '' });
            }
          }}
        >
          {CURRENCY_PRESETS.map((p) => (
            <option key={p.code} value={p.code}>{p.label}</option>
          ))}
        </select>
        {isCustomCurrency && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <input
              className="input"
              placeholder="Code (e.g. AUD)"
              value={value.currency_code}
              onChange={(e) => set({ currency_code: e.target.value.toUpperCase() })}
            />
            <input
              className="input"
              placeholder="Symbol (e.g. A$)"
              value={value.currency_symbol}
              onChange={(e) => set({ currency_symbol: e.target.value })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
