import { useState, useEffect } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { BusinessProfileForm, BusinessProfileValue } from '../components/settings/BusinessProfileForm';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { useToastStore } from '../store/toastStore';
import { useSettingsStore } from '../store/settingsStore';
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
  const { settings, setSettings } = useSettingsStore();
  const [profile, setProfile] = useState<BusinessProfileValue>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      setLoading(false);
    }
  }, [settings]);

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
    </PageContainer>
  );
}
