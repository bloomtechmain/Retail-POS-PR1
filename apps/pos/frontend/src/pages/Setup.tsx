import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToastStore } from '../store/toastStore';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import { AxiosError } from 'axios';

export default function Setup() {
  const navigate = useNavigate();
  const toast = useToastStore();
  const { setSettings } = useSettingsStore();
  const { user, setUser } = useAuthStore();
  const [saving, setSaving] = useState(false);

  const [loginEmail, setLoginEmail] = useState(user?.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (user?.email) setLoginEmail(user.email);
  }, [user?.email]);

  const submit = async () => {
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
      }

      const r = await api.post('/settings/complete-setup', {});
      setSettings(r.data.data);
      toast.success('Setup complete');
      navigate('/pos');
    } catch (err) {
      const axiosErr = err as AxiosError<{ message: string }>;
      toast.error(axiosErr.response?.data?.message || 'Failed to save setup');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-900 via-surface-800 to-surface-900 flex justify-center items-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl shadow-lg mb-4 overflow-hidden bg-white">
            <img src="/logo.png" alt="BloomPOS" className="w-full h-full object-contain p-1" />
          </div>
          <h1 className="text-2xl font-bold text-white">BloomPOS</h1>
          <p className="text-surface-400 text-sm mt-1">Set your password to get started</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 space-y-6">
          <p className="text-surface-500 text-sm">
            Your business, package, and features were already set up for you. You can configure everything else — business profile, categories, and more — anytime from Settings.
          </p>

          <div>
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

          <button className="btn-primary w-full" disabled={saving} onClick={submit}>
            {saving ? 'Saving...' : 'Continue to POS'}
          </button>
        </div>
      </div>
    </div>
  );
}
