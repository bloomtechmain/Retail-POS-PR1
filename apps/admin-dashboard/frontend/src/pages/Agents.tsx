import { useEffect, useState } from 'react';
import { listAgents, createAgent, setAgentActive, Agent } from '../services/api';

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    listAgents().then(setAgents).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim() || password.length < 6) {
      setError('Name, email, and a password of at least 6 characters are required.');
      return;
    }
    setSubmitting(true);
    try {
      await createAgent({ name: name.trim(), email: email.trim(), password });
      setName('');
      setEmail('');
      setPassword('');
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create agent.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (agent: Agent) => {
    await setAgentActive(agent.id, !agent.is_active);
    load();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">Marketing Agents</h1>
        <p className="text-surface-500 text-sm mt-1">Agents can only create customer accounts — nothing else in this dashboard.</p>
      </div>

      <div className="card p-6 mb-6">
        <h3 className="font-semibold text-surface-900 mb-4">Add Agent</h3>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
          </div>
          {error && <p className="sm:col-span-3 text-sm text-red-600">{error}</p>}
          <div className="sm:col-span-3">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Adding...' : 'Add Agent'}
            </button>
          </div>
        </form>
      </div>

      <div className="card table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="text-center text-surface-400 py-8">Loading...</td></tr>
            )}
            {!loading && agents.length === 0 && (
              <tr><td colSpan={5} className="text-center text-surface-400 py-8">No agents yet.</td></tr>
            )}
            {agents.map((a) => (
              <tr key={a.id}>
                <td className="font-medium text-surface-900">{a.name}</td>
                <td>{a.email}</td>
                <td>
                  <span className={a.is_active ? 'badge-green' : 'badge-red'}>
                    {a.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="text-surface-500 text-xs">{new Date(a.created_at).toLocaleDateString()}</td>
                <td>
                  <button className="btn-secondary btn-sm" onClick={() => toggleActive(a)}>
                    {a.is_active ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
