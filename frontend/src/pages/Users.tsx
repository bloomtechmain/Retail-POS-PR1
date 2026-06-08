import { useState, useEffect, useCallback } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { Modal } from '../components/ui/Modal';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { useToastStore } from '../store/toastStore';
import api from '../services/api';
import { AxiosError } from 'axios';
import { useT } from '../i18n/translations';

interface UserRow {
  id: number;
  name: string;
  email: string;
  role_id: number;
  role_name: string;
  is_active: boolean;
  last_login?: string;
  created_at: string;
}

interface Role { id: number; name: string; }

const EMPTY = { name: '', email: '', password: '', role_id: '', pin: '', is_active: true };

export default function Users() {
  const t = useT();
  const toast = useToastStore();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersR, rolesR] = await Promise.all([
        api.get('/users'),
        api.get('/users/roles'),
      ]);
      setUsers(usersR.data.data);
      setRoles(rolesR.data.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm(EMPTY);
    setIsEditing(false);
    setEditId(null);
    setModalOpen(true);
  };

  const openEdit = (u: UserRow) => {
    setForm({ name: u.name, email: u.email, password: '', role_id: String(u.role_id), pin: '', is_active: u.is_active });
    setIsEditing(true);
    setEditId(u.id);
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        email: form.email,
        role_id: parseInt(form.role_id),
        pin: form.pin || undefined,
        is_active: form.is_active,
        ...(form.password ? { password: form.password } : {}),
      };
      if (isEditing) {
        await api.put(`/users/${editId}`, payload);
        toast.success('User updated');
      } else {
        if (!form.password) { toast.error('Password is required'); return; }
        await api.post('/users', { ...payload, password: form.password });
        toast.success('User created');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this user?')) return;
    await api.delete(`/users/${id}`);
    toast.success('User deleted');
    load();
  };

  const roleColors: Record<string, string> = {
    admin: 'badge-red',
    manager: 'badge-blue',
    cashier: 'badge-gray',
  };

  return (
    <PageContainer>
      <div className="page-header">
        <h1 className="page-title">{t.users_title}</h1>
        <button onClick={openCreate} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t.users_add}
        </button>
      </div>

      {loading ? <PageLoader /> : (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.users_col_name}</th>
                  <th>{t.users_col_email}</th>
                  <th>{t.users_col_role}</th>
                  <th>{t.users_col_status}</th>
                  <th>{t.users_col_last_login}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.name}</td>
                    <td className="text-sm text-surface-600">{u.email}</td>
                    <td>
                      <span className={`badge ${roleColors[u.role_name] || 'badge-gray'} capitalize`}>
                        {u.role_name}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>
                        {u.is_active ? t.active : t.inactive}
                      </span>
                    </td>
                    <td className="text-sm text-surface-500">
                      {u.last_login ? new Date(u.last_login).toLocaleDateString() : t.users_never}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(u)} className="btn-ghost btn-sm">{t.edit}</button>
                        <button onClick={() => handleDelete(u.id)} className="btn-sm text-red-500 hover:bg-red-50 rounded-lg px-2 py-1 text-xs font-medium">{t.del}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={isEditing ? t.users_edit : t.users_new}
        size="md"
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{t.cancel}</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? t.saving : t.users_save}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">{t.users_full_name}</label>
            <input className="input" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t.users_email}</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">{isEditing ? t.users_password_edit : t.users_password}</label>
            <input type="password" className="input" value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} placeholder={isEditing ? t.users_password_placeholder_edit : t.users_password_placeholder_new} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{t.users_role}</label>
              <select className="input" value={form.role_id} onChange={(e) => setForm(f => ({ ...f, role_id: e.target.value }))}>
                <option value="">{t.users_select_role}</option>
                {roles.map(r => <option key={r.id} value={r.id} className="capitalize">{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t.users_pin}</label>
              <input type="password" className="input font-mono" value={form.pin} onChange={(e) => setForm(f => ({ ...f, pin: e.target.value }))} placeholder={t.users_pin_placeholder} maxLength={6} />
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" checked={form.is_active} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              <span className="text-sm">{t.users_active}</span>
            </label>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
