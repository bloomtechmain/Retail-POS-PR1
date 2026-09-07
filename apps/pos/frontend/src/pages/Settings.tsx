import { useState, useEffect } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { BusinessProfileForm, BusinessProfileValue } from '../components/settings/BusinessProfileForm';
import { TaxRatesManager } from '../components/settings/TaxRatesManager';
import { KitchenStationsCard } from '../components/settings/KitchenStationsCard';
import { MultiTerminalCard } from '../components/settings/MultiTerminalCard';
import { PrintAgentCard } from '../components/settings/PrintAgentCard';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { useToastStore } from '../store/toastStore';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
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
};

export default function SettingsPage() {
  const toast = useToastStore();
  const { settings, setSettings, plans, fetchPlans, hasFeature } = useSettingsStore();
  const { user, setUser, sandbox, setToken } = useAuthStore();
  const [profile, setProfile] = useState<BusinessProfileValue>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [switchingEnv, setSwitchingEnv] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);
  const [vatRegNumber, setVatRegNumber] = useState('');
  const [savingVat, setSavingVat] = useState(false);

  const [loginEmail, setLoginEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingCredentials, setSavingCredentials] = useState(false);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  useEffect(() => {
    if (user?.email) setLoginEmail(user.email);
  }, [user?.email]);

  useEffect(() => {
    if (settings) {
      setProfile({
        business_name: settings.business_name || '',
        logo_data_url: settings.logo_data_url || '',
        address: settings.address || '',
        phone: settings.phone || '',
        email: settings.email || '',
        currency_code: settings.currency_code || 'USD',
        currency_symbol: settings.currency_symbol || '$',
      });
      setVatRegNumber(settings.vat_registration_number || '');
      setLoading(false);
    }
  }, [settings]);

  const saveCredentials = async () => {
    if (newPassword && !currentPassword) {
      toast.error('Enter your current password to set a new one');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (!newPassword && loginEmail === user?.email) {
      toast.error('Nothing to change');
      return;
    }

    setSavingCredentials(true);
    try {
      if (newPassword) {
        await api.put('/auth/change-password', {
          current_password: currentPassword,
          new_password: newPassword,
        });
      }
      if (loginEmail && loginEmail !== user?.email && user) {
        const r = await api.put(`/users/${user.id}`, { email: loginEmail });
        setUser({ ...user, email: r.data.data.email });
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Login details updated');
    } catch (err) {
      const axiosErr = err as AxiosError<{ message: string }>;
      toast.error(axiosErr.response?.data?.message || 'Failed to update login details');
    } finally {
      setSavingCredentials(false);
    }
  };

  const switchEnvironment = async () => {
    const goingToSandbox = !sandbox;
    if (!confirm(
      goingToSandbox
        ? 'Switch to the sandbox? You\'ll see sample data instead of your real business data — nothing you add there affects your live account.'
        : 'Switch back to your live account? You\'ll leave the sandbox and return to your real business data.'
    )) return;

    setSwitchingEnv(true);
    try {
      const r = await api.post('/auth/sandbox', { sandbox: goingToSandbox });
      setToken(r.data.token, r.data.sandbox);
      // Every store (settings, products, sales, ...) is scoped to whichever
      // schema the token now points at — a hard reload guarantees nothing
      // client-side is left showing stale data from the other environment.
      window.location.href = '/pos';
    } catch (err) {
      const axiosErr = err as AxiosError<{ message: string }>;
      toast.error(axiosErr.response?.data?.message || 'Failed to switch environment');
      setSwitchingEnv(false);
    }
  };

  const toggleRestaurantMode = async () => {
    const goingToRestaurant = !settings?.restaurant_mode_enabled;
    if (!confirm(
      goingToRestaurant
        ? 'Switch this till to Restaurant Mode? Regular retail checkout will be replaced by dine-in/takeaway ordering until you switch back.'
        : 'Switch back to regular POS Mode? Dine-in/takeaway ordering will no longer be available on this till.'
    )) return;

    setSwitchingMode(true);
    try {
      const r = await api.put('/settings', { restaurant_mode_enabled: goingToRestaurant });
      setSettings(r.data.data);
      toast.success(goingToRestaurant ? 'Switched to Restaurant Mode' : 'Switched to POS Mode');
    } catch (err) {
      const axiosErr = err as AxiosError<{ message: string }>;
      toast.error(axiosErr.response?.data?.message || 'Failed to switch mode');
    } finally {
      setSwitchingMode(false);
    }
  };

  const saveVatSettings = async () => {
    setSavingVat(true);
    try {
      const r = await api.put('/settings', { vat_registration_number: vatRegNumber });
      setSettings(r.data.data);
      toast.success('VAT settings saved');
    } catch (err) {
      const axiosErr = err as AxiosError<{ message: string }>;
      toast.error(axiosErr.response?.data?.message || 'Failed to save VAT settings');
    } finally {
      setSavingVat(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put('/settings', profile);
      setSettings(r.data.data);
      toast.success('Settings saved');
    } catch (err) {
      const axiosErr = err as AxiosError<{ message: string }>;
      toast.error(axiosErr.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <PageContainer className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">Business Settings</h1>
        <p className="text-surface-500 text-sm mt-1">Update your shop name, logo, contact details, and currency.</p>
      </div>

      <div className={`card p-6 mb-6 ${sandbox ? 'ring-2 ring-amber-300' : ''}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-surface-900">Environment</h3>
            <p className="text-surface-500 text-sm mt-0.5">
              {sandbox
                ? 'You are in the sandbox — sample data only, safe to experiment with.'
                : 'You are on your live account. Switch to a sandbox to learn the system with sample data, without touching anything real.'}
            </p>
          </div>
          <button
            className={sandbox ? 'btn-primary' : 'btn-secondary'}
            disabled={switchingEnv}
            onClick={switchEnvironment}
          >
            {switchingEnv ? 'Switching...' : sandbox ? 'Switch to Live Data' : 'Switch to Sandbox'}
          </button>
        </div>
      </div>

      {hasFeature('restaurant_mode') && (
        <div className={`card p-6 mb-6 ${settings?.restaurant_mode_enabled ? 'ring-2 ring-primary-300' : ''}`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-surface-900">Operating Mode</h3>
              <p className="text-surface-500 text-sm mt-0.5">
                {settings?.restaurant_mode_enabled
                  ? 'This till is in Restaurant Mode — every sale is a dine-in or takeaway order. Regular retail checkout is off.'
                  : 'This till is in regular POS Mode — plain retail checkout. Switch to Restaurant Mode for tables, dine-in/takeaway, and kitchen tickets.'}
              </p>
            </div>
            <button
              className={settings?.restaurant_mode_enabled ? 'btn-secondary' : 'btn-primary'}
              disabled={switchingMode}
              onClick={toggleRestaurantMode}
            >
              {switchingMode ? 'Switching...' : settings?.restaurant_mode_enabled ? 'Switch to POS Mode' : 'Switch to Restaurant Mode'}
            </button>
          </div>
        </div>
      )}

      <div className="card p-6 space-y-6">
        <BusinessProfileForm value={profile} onChange={setProfile} />

        <div className="flex justify-end pt-2">
          <button className="btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="card p-6 mt-6">
        <div className="mb-4">
          <h3 className="font-semibold text-surface-900">Login &amp; Security</h3>
          <p className="text-surface-500 text-sm mt-0.5">Change the email or password you log in with.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Login Email</label>
            <input
              type="email"
              className="input"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Current Password</label>
            <input
              type="password"
              className="input"
              placeholder="Required to set a new password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
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
            <label className="label">Confirm New Password</label>
            <input
              type="password"
              className="input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end pt-4">
          <button className="btn-primary" disabled={savingCredentials} onClick={saveCredentials}>
            {savingCredentials ? 'Saving...' : 'Update Login Details'}
          </button>
        </div>
      </div>

      <div className="card p-6 mt-6">
        <h3 className="font-semibold text-surface-900">Subscription Plan</h3>
        <p className="text-surface-500 text-sm mt-0.5 mb-3">
          Your package is set by your agent — contact them to upgrade or change it.
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 text-primary-700 text-sm font-medium">
          {plans.find((p) => p.key === settings?.plan_key)?.name || settings?.plan_key}
        </div>
      </div>

      <PrintAgentCard />

      {hasFeature('kot_printing') && settings?.restaurant_mode_enabled && (
        <div className="card p-6 mt-6">
          <KitchenStationsCard />
        </div>
      )}

      {hasFeature('multi_terminal') && (
        <div className="card p-6 mt-6">
          <MultiTerminalCard />
        </div>
      )}

      {/* Everything VAT/tax-related lives in this one place — the TIN
          number a Tax Invoice needs, and the named tax rates (VAT, NBT,
          etc.) available when generating one. */}
      {hasFeature('vat_invoice') && (
        <div className="card p-6 mt-6 space-y-6">
          <div>
            <h3 className="font-semibold text-surface-900">VAT &amp; Tax Settings</h3>
            <p className="text-surface-500 text-sm mt-0.5">Your TIN and tax rates, used on every generated Tax Invoice.</p>
          </div>
          <div>
            <label className="label">TIN Number <span className="font-normal text-surface-400">(Taxpayer Identification Number)</span></label>
            <input
              className="input font-mono max-w-xs"
              value={vatRegNumber}
              onChange={(e) => setVatRegNumber(e.target.value)}
              placeholder="e.g. TN2342"
            />
            <div className="flex justify-end mt-2">
              <button className="btn-primary btn-sm" disabled={savingVat} onClick={saveVatSettings}>
                {savingVat ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
          <div className="border-t border-surface-200 pt-6">
            <TaxRatesManager />
          </div>
        </div>
      )}
    </PageContainer>
  );
}
