import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { AxiosError } from 'axios';

export default function Login() {
  const [email, setEmail] = useState('admin@retailpos.com');
  const [password, setPassword] = useState('admin123');
  const { login, isLoading } = useAuthStore();
  const { error: showError } = useToastStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/pos');
    } catch (err) {
      const axiosErr = err as AxiosError<{ message: string }>;
      showError(axiosErr.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-900 via-surface-800 to-surface-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl shadow-lg mb-4 overflow-hidden bg-white">
            <img src="/logo.png" alt="BloomPOS" className="w-full h-full object-contain p-1" />
          </div>
          <h1 className="text-2xl font-bold text-white">BloomPOS</h1>
          <p className="text-surface-400 text-sm mt-1">Sign in to continue</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@retailpos.com"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary btn-lg w-full mt-2"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className="text-center text-xs text-surface-400 mt-6">
            Default: admin@retailpos.com / admin123
          </p>
        </div>
      </div>
    </div>
  );
}
