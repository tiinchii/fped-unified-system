import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage, unwrap, type Schemas } from '../api/client';
import { Modal } from '../components/Modal';

type Office = Schemas['OfficeView'];

/** The list of offices used in Travel Orders (and later Procurement). An office in use is hidden, never deleted. */
export function OfficesPage() {
  const [offices, setOffices] = useState<Office[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Office | 'new' | null>(null);

  const load = useCallback(() => {
    unwrap(api.GET('/api/travel/data', { params: { query: {} } })).then((d) => setOffices(d.offices)).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <div className="row head">
        <div>
          <h2>Offices</h2>
          <p className="sub">The offices that can be chosen for a person or a travel order. A hidden office stays on old records but is no longer offered.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>+ Add office</button>
      </div>
      {error && <div className="alert bad">{error}</div>}
      <div className="card flush">
        <table>
          <thead><tr><th>Office</th><th>Status</th><th /></tr></thead>
          <tbody>
            {offices === null && !error && <tr><td colSpan={3} className="muted">Loading…</td></tr>}
            {offices?.map((o) => (
              <tr key={o.id} className={o.active ? '' : 'dim'}>
                <td><b>{o.name}</b></td>
                <td>{o.active ? <span className="pill ok">Active</span> : <span className="pill">Hidden</span>}</td>
                <td className="actions"><button className="btn small" onClick={() => setEditing(o)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <OfficeForm office={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function OfficeForm({ office, onClose, onSaved }: { office: Office | null; onClose(): void; onSaved(): void }) {
  const [name, setName] = useState(office?.name ?? '');
  const [active, setActive] = useState(office?.active ?? true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (office) await unwrap(api.PUT('/api/admin/offices/{id}', { params: { path: { id: office.id } }, body: { name, active } }));
      else await unwrap(api.POST('/api/admin/offices', { body: { name, active: true } }));
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={office ? `Edit ${office.name}` : 'Add office'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert bad">{error}</div>}
        <label className="f" htmlFor="oName">Name (saved in capital letters)</label>
        <input id="oName" value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} />
        {office && <p className="small muted">Renaming changes the name on every person and travel order of this office.</p>}
        {office && <label className="chk"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Active (can be chosen)</label>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
