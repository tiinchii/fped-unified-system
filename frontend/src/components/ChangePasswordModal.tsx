import { useState, type FormEvent } from 'react';
import { api, errorMessage, unwrap } from '../api/client';
import { Modal } from './Modal';

export function ChangePasswordModal({ onClose, onDone }: { onClose(): void; onDone(): void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== again) { setError('The two new passwords are not the same.'); return; }
    setBusy(true); setError('');
    try {
      await unwrap(api.POST('/api/auth/change-password', { body: { currentPassword: current, newPassword: next } }));
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Change password" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert bad">{error}</div>}
        <label className="f" htmlFor="cpCurrent">Current password</label>
        <input id="cpCurrent" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
        <label className="f" htmlFor="cpNew">New password (at least 8 characters)</label>
        <input id="cpNew" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <label className="f" htmlFor="cpAgain">New password again</label>
        <input id="cpAgain" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy || !current || !next}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
