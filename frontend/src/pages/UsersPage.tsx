import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage, unwrap, type Role, type Schemas } from '../api/client';
import { useMe } from '../auth/AuthContext';
import { Modal } from '../components/Modal';
import { formatDateTime, ROLE_LABEL, ROLES } from '../format';

type User = Schemas['UserView'];

export function UsersPage() {
  const me = useMe();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<User | 'new' | null>(null);

  const load = useCallback(() => {
    unwrap(api.GET('/api/admin/users')).then(setUsers).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <div className="row head">
        <div>
          <h2>Users</h2>
          <p className="sub">Admin: everything. Encoder: encode and edit records, Email and Calendar. Viewer: read only.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>+ Add user</button>
      </div>
      {error && <div className="alert bad">{error}</div>}
      <div className="card flush">
        <table>
          <thead><tr><th>Username</th><th>Full name</th><th>Role</th><th>Status</th><th>Last login</th><th /></tr></thead>
          <tbody>
            {users === null && !error && <tr><td colSpan={6} className="muted">Loading…</td></tr>}
            {users?.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'dim'}>
                <td><b>{u.username}</b>{u.username === me.username && <span className="muted"> (you)</span>}</td>
                <td>{u.fullName}</td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td>
                  {u.active ? <span className="pill ok">Active</span> : <span className="pill">Inactive</span>}
                  {u.locked && <span className="pill bad">Locked</span>}
                </td>
                <td className="small">{formatDateTime(u.lastLoginAt) || <span className="muted">never</span>}</td>
                <td className="actions"><button className="btn small" onClick={() => setEditing(u)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <UserForm user={editing === 'new' ? null : editing} isSelf={editing !== 'new' && editing.username === me.username}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function UserForm({ user, isSelf, onClose, onSaved }: { user: User | null; isSelf: boolean; onClose(): void; onSaved(): void }) {
  const [username, setUsername] = useState(user?.username ?? '');
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'ENCODER');
  const [active, setActive] = useState(user?.active ?? true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (user) {
        await unwrap(api.PUT('/api/admin/users/{id}', {
          params: { path: { id: user.id } }, body: { fullName, role, active, password: password || undefined },
        }));
      } else {
        await unwrap(api.POST('/api/admin/users', { body: { username: username.trim().toLowerCase(), fullName, role, password } }));
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={user ? `Edit ${user.username}` : 'Add user'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert bad">{error}</div>}
        <div className="grid">
          <div>
            <label className="f" htmlFor="uName">Username</label>
            <input id="uName" value={username} onChange={(e) => setUsername(e.target.value)} disabled={!!user} autoFocus={!user} />
          </div>
          <div>
            <label className="f" htmlFor="uFull">Full name</label>
            <input id="uFull" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="f" htmlFor="uRole">Role</label>
            <select id="uRole" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <div>
            <label className="f" htmlFor="uPass">{user ? 'New password (blank = no change)' : 'Password (at least 8 characters)'}</label>
            <input id="uPass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {user && <label className="chk wide">
            <input type="checkbox" checked={active} disabled={isSelf} onChange={(e) => setActive(e.target.checked)} />
            Active (can log in){isSelf && <span className="muted"> — you cannot change your own role or status</span>}
          </label>}
        </div>
        {user?.locked && <p className="small muted">This username is locked after too many wrong passwords. Setting a new password unlocks it.</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
