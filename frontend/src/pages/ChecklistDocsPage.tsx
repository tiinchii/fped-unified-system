import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage, unwrap, type Schemas } from '../api/client';
import { Modal } from '../components/Modal';

type Doc = Schemas['DocumentTypeView'];

/** The documents the travel order checklist asks for. A document in use is hidden, never deleted. */
export function ChecklistDocsPage() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Doc | 'new' | null>(null);

  const load = useCallback(() => {
    unwrap(api.GET('/api/travel/data', { params: { query: {} } })).then((d) => setDocs(d.documentTypes)).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <div className="row head">
        <div>
          <h2>TO checklist</h2>
          <p className="sub">Ang mga dokumentong iche-check sa bawat travel order. Lalabas ito sa form at sa listahan ng Travel Orders,
            at makikita agad kung ano ang kulang kapag ibinalik ang papeles.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>+ Add document</button>
      </div>
      {error && <div className="alert bad">{error}</div>}
      <div className="card flush">
        <table>
          <thead><tr><th>#</th><th>Document</th><th>Status</th><th /></tr></thead>
          <tbody>
            {docs === null && !error && <tr><td colSpan={4} className="muted">Loading…</td></tr>}
            {docs?.length === 0 && <tr><td colSpan={4} className="muted">Wala pang dokumento. Habang wala, hindi lumalabas ang checklist sa Travel Orders.</td></tr>}
            {docs?.map((d) => (
              <tr key={d.id} className={d.active ? '' : 'dim'}>
                <td className="small muted">{d.sortOrder}</td>
                <td><b>{d.name}</b></td>
                <td>{d.active ? <span className="pill ok">Hinihingi</span> : <span className="pill">Hidden</span>}</td>
                <td className="actions"><button className="btn small" onClick={() => setEditing(d)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <DocForm doc={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function DocForm({ doc, onClose, onSaved }: { doc: Doc | null; onClose(): void; onSaved(): void }) {
  const [name, setName] = useState(doc?.name ?? '');
  const [sortOrder, setSortOrder] = useState(doc ? String(doc.sortOrder) : '');
  const [active, setActive] = useState(doc?.active ?? true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const body = { name, sortOrder: sortOrder === '' ? undefined : Number(sortOrder), active };
      if (doc) await unwrap(api.PUT('/api/admin/to-documents/{id}', { params: { path: { id: doc.id } }, body }));
      else await unwrap(api.POST('/api/admin/to-documents', { body }));
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={doc ? 'Edit document' : 'Add document'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert bad">{error}</div>}
        <label className="f" htmlFor="dName">Document</label>
        <input id="dName" value={name} maxLength={150} autoFocus placeholder="e.g. Approved itinerary of travel" onChange={(e) => setName(e.target.value)} />
        <label className="f" htmlFor="dOrder">Order in the list</label>
        <input id="dOrder" type="number" min="0" value={sortOrder} placeholder="blank = last" onChange={(e) => setSortOrder(e.target.value)} />
        {doc && <label className="chk"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Hinihingi pa (kapag tinanggal, mananatili sa lumang checklist)</label>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
