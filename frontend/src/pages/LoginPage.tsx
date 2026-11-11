import { useState, type FormEvent } from 'react';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { login, notice } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) { setError('Enter your username and password.'); return; }
    setBusy(true); setError('');
    try {
      await login(username, password);
    } catch (err) {
      setError(errorMessage(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <h2>FPED Unified System</h2>
        <p className="sub">Planning Division. Same username and password as the Travel Order System.</p>
        {error ? <div className="alert bad">{error}</div> : notice && <div className="alert warn">{notice}</div>}
        <label className="f" htmlFor="lgUser">Username</label>
        <input id="lgUser" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        <label className="f" htmlFor="lgPass">Password</label>
        <input id="lgPass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn primary wide" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
    </div>
  );
}
