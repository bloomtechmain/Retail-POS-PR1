import { useState, useEffect } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { BusinessProfileForm, BusinessProfileValue } from '../components/settings/BusinessProfileForm';
import { TaxRatesManager } from '../components/settings/TaxRatesManager';
import { PlanPicker } from '../components/settings/PlanPicker';
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
  vat_registration_number: '',
};

export default function SettingsPage() {
  const toast = useToastStore();
  const { settings, setSettings, plans, fetchPlans, hasFeature } = useSettingsStore();
  const { user, setUser } = useAuthStore();
  const [profile, setProfile] = useState<BusinessProfileValue>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('basic');
  const [switchingPlan, setSwitchingPlan] = useState(false);

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
        vat_registration_number: settings.vat_registration_number || '',
      });
      setSelectedPlan(settings.plan_key || 'basic');
      setLoading(false);
    }
  }, [settings]);

  const switchPlan = async () => {
    setSwitchingPlan(true);
    try {
      const r = await api.put('/settings', { plan_key: selectedPlan });
      setSettings(r.data.data);
      toast.success(`Switched to the ${plans.find(p => p.key === selectedPlan)?.name || selectedPlan} plan`);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message: string }>;
      toast.error(axiosErr.response?.data?.message || 'Failed to switch plan');
    } finally {
      setSwitchingPlan(false);
    }
  };

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
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-surface-900">Subscription Plan</h3>
            <p className="text-surface-500 text-sm mt-0.5">Switch plans any time — takes effect immediately.</p>
          </div>
          {selectedPlan !== settings?.plan_key && (
            <button onClick={switchPlan} disabled={switchingPlan} className="btn-primary btn-sm">
              {switchingPlan ? 'Switching...' : `Switch to ${plans.find(p => p.key === selectedPlan)?.name || selectedPlan}`}
            </button>
          )}
        </div>
        <PlanPicker plans={plans} selected={selectedPlan} onSelect={setSelectedPlan} currentKey={settings?.plan_key} />
      </div>

      {hasFeature('vat_invoice') && (
        <div className="card p-6 mt-6">
          <TaxRatesManager />
        </div>
      )}
    </PageContainer>
  );
}
