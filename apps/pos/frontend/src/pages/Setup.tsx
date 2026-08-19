import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BusinessProfileForm, BusinessProfileValue } from '../components/settings/BusinessProfileForm';
import { PlanPicker } from '../components/settings/PlanPicker';
import { useToastStore } from '../store/toastStore';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { CategoryTemplate } from '../types';
import api from '../services/api';
import { AxiosError } from 'axios';

const EMPTY: BusinessProfileValue = {
  business_name: '',
  logo_data_url: '',
  address: '',
  phone: '',
  email: '',
  currency_code: 'USD',
  currency_symbol: '$',
  vat_registration_number: '',
};

export default function Setup() {
  const navigate = useNavigate();
  const toast = useToastStore();
  const { setSettings, plans, fetchPlans } = useSettingsStore();
  const { user, setUser } = useAuthStore();
  const [profile, setProfile] = useState<BusinessProfileValue>(EMPTY);
  const [templates, setTemplates] = useState<CategoryTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [customType, setCustomType] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('basic');
  const [saving, setSaving] = useState(false);

  const [loginEmail, setLoginEmail] = useState(user?.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    api.get('/settings/templates').then((r) => setTemplates(r.data.data));
    fetchPlans();
    // Electron only: a marketing agent may have preset this install's login
    // at license activation (see main.js's activation-complete handler).
    // Served exactly once — pre-fill the credential fields below so the
    // agent's password becomes this account's working login as soon as
    // setup is saved, instead of the customer having to know/retype it.
    api.get('/settings/preset-admin').then((r) => {
      const preset = r.data.data as { email: string; password: string } | null;
      if (preset) {
        setLoginEmail(preset.email);
        setNewPassword(preset.password);
        setConfirmPassword(preset.password);
      }
    }).catch(() => {});
  }, [fetchPlans]);

  useEffect(() => {
    if (user?.email) setLoginEmail(user.email);
  }, [user?.email]);

  const activeTemplate = templates.find((t) => t.key === selectedTemplate);

  const submit = async (skip: boolean) => {
    if (newPassword && newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setSaving(true);
    try {
      const credentialsChanged = (loginEmail && loginEmail !== user?.email) || newPassword;
      if (credentialsChanged && user) {
        const payload: Record<string, string> = {};
        if (loginEmail && loginEmail !== user.email) payload.email = loginEmail;
        if (newPassword) payload.password = newPassword;
        const r = await api.put(`/users/${user.id}`, payload);
        setUser({ ...user, email: r.data.data.email });
        setNewPassword('');
        setConfirmPassword('');
      }

      const payload = skip
        ? { setup_completed: true }
        : {
            business_name: profile.business_name || 'My Business',
            business_type: selectedTemplate ? activeTemplate?.label : customType,
            logo_data_url: profile.logo_data_url || undefined,
            address: profile.address || undefined,
            phone: profile.phone || undefined,
            email: profile.email || undefined,
            currency_code: profile.currency_code,
            currency_symbol: profile.currency_symbol,
            template_key: selectedTemplate || undefined,
            plan_key: selectedPlan,
          };
      const r = await api.post('/settings/complete-setup', payload);
      setSettings(r.data.data);
      toast.success(skip ? 'Setup skipped' : 'Setup complete');
      navigate('/pos');
    } catch (err) {
      const axiosErr = err as AxiosError<{ message: string }>;
      toast.error(axiosErr.response?.data?.message || 'Failed to save setup');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-900 via-surface-800 to-surface-900 flex justify-center p-4 py-10 overflow-y-auto">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl shadow-lg mb-4 overflow-hidden bg-white">
            <img src="/logo.png" alt="BloomPOS" className="w-full h-full object-contain p-1" />
          </div>
          <h1 className="text-2xl font-bold text-white">BloomPOS</h1>
          <p className="text-surface-400 text-sm mt-1">Let's set up your shop</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 space-y-8">
          <p className="text-surface-500 text-sm -mt-2">
            This POS works for any type of retail business. Tell us about yours, or skip and configure it later from Settings.
          </p>

          <div>
            <h2 className="text-sm font-semibold text-surface-900 mb-3">Your Login</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Login Email</label>
                <input
                  type="email"
                  className="input"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="label">New Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Leave blank to keep current"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Confirm Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-surface-900 mb-3">Business Profile</h2>
            <BusinessProfileForm value={profile} onChange={setProfile} />
          </div>

          <div>
            <h2 className="text-sm font-semibold text-surface-900 mb-1">Business Type</h2>
            <p className="text-xs text-surface-400 mb-2">
              Pick a starting point for your product categories, or choose Custom to describe your own business — either way you can add, edit, or remove categories any time.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {templates.map((tpl) => (
                <button
                  key={tpl.key}
                  type="button"
                  onClick={() => setSelectedTemplate(tpl.key)}
                  className={`text-left p-3 rounded-xl border text-sm transition-colors ${
                    selectedTemplate === tpl.key
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-surface-200 hover:border-surface-300'
                  }`}
                >
                  <div className="font-medium">{tpl.label}</div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelectedTemplate('')}
                className={`text-left p-3 rounded-xl border text-sm transition-colors ${
                  selectedTemplate === ''
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-surface-200 hover:border-surface-300'
                }`}
              >
                <div className="font-medium">Custom / Other</div>
              </button>
            </div>

            {selectedTemplate === '' && (
              <input
                className="input mt-3"
                placeholder="Describe your business type (e.g. Bookstore, Bakery...)"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
              />
            )}

            {activeTemplate && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {activeTemplate.categories.map((c) => (
                  <span
                    key={c.name}
                    className="text-xs px-2 py-1 rounded-full"
                    style={{ backgroundColor: `${c.color}20`, color: c.color }}
                  >
                    {c.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-surface-900 mb-1">Choose Your Plan</h2>
            <p className="text-xs text-surface-400 mb-2">
              Every plan includes Dashboard, POS, Products, Inventory, GRN, and Shifts. You can change this any time from Settings.
            </p>
            <PlanPicker plans={plans} selected={selectedPlan} onSelect={setSelectedPlan} />
          </div>

          <div className="flex gap-3 pt-2">
            <button className="btn-secondary flex-1" disabled={saving} onClick={() => submit(true)}>
              Skip for now
            </button>
            <button className="btn-primary flex-1" disabled={saving} onClick={() => submit(false)}>
              Complete Setup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
