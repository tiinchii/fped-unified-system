import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, errorMessage, unwrap, type Role, type Schemas } from '../api/client';
import type { ShellContext } from '../components/Shell';
import { Modal } from '../components/Modal';
import { ROLE_LABEL, ROLES } from '../format';

type LinkView = Schemas['LinkView'];

export function LinksPage() {
  const { reloadLinks } = useOutletContext<ShellContext>();
  const [links, setLinks] = useState<LinkView[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<LinkView | 'new' | null>(null);

  const load = useCallback(() => {
    unwrap(api.GET('/api/admin/links')).then(setLinks).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  const missing = links?.filter((l) => l.active && !l.url) ?? [];

  return (
    <>
      <div className="row head">
        <div>
          <h2>Menu links</h2>
          <p className="sub">Other systems shown in the menu (FIND, FAST, and any system added later). They open in a new tab.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>+ Add a system</button>
      </div>
      {error && <div className="alert bad">{error}</div>}
      {missing.length > 0 && <div className="alert warn">
        Address not set yet: <b>{missing.map((l) => l.name).join(', ')}</b>. Click Edit and enter the address.
      </div>}
      <div className="card flush">
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Address</th><th>Who sees it</th><th /></tr></thead>
          <tbody>
            {links === null && !error && <tr><td colSpan={5} className="muted">Loading…</td></tr>}
            {links?.map((l) => (
              <tr key={l.id} className={l.active ? '' : 'dim'}>
                <td>{l.sortOrder}</td>
                <td>
                  <span className="pill solid" style={{ background: l.color }}>{l.name}</span>{!l.active && <span className="small muted"> hidden</span>}
                  {l.description && <div className="small muted">{l.description}</div>}
                </td>
                <td className="small break">{l.url ?? <span className="pill warn">not set</span>}</td>
                <td className="small">{l.roles.map((r) => ROLE_LABEL[r]).join(', ')}</td>
                <td className="actions"><button className="btn small" onClick={() => setEditing(l)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <LinkForm link={editing === 'new' ? null : editing} nextOrder={(links?.length ?? 0) + 1}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); reloadLinks(); /* the menu on the left shows the change at once */ }} />}
    </>
  );
}

function LinkForm({ link, nextOrder, onClose, onSaved }: { link: LinkView | null; nextOrder: number; onClose(): void; onSaved(): void }) {
  const [code, setCode] = useState(link?.code ?? '');
  const [name, setName] = useState(link?.name ?? '');
  const [description, setDescription] = useState(link?.description ?? '');
  const [url, setUrl] = useState(link?.url ?? '');
  const [roles, setRoles] = useState<Role[]>(link?.roles ?? [...ROLES]);
  const [color, setColor] = useState(link?.color ?? '#2e6aa5');
  const [sortOrder, setSortOrder] = useState(link?.sortOrder ?? nextOrder);
  const [active, setActive] = useState(link?.active ?? true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (r: Role) => setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const body = { code: code.trim().toLowerCase(), name, description, url: url.trim(), roles, color, sortOrder, active };
    try {
      if (link) await unwrap(api.PUT('/api/admin/links/{id}', { params: { path: { id: link.id } }, body }));
      else await unwrap(api.POST('/api/admin/links', { body }));
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={link ? `Edit ${link.name}` : 'Add a system'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert bad">{error}</div>}
        <div className="grid">
          <div>
            <label className="f" htmlFor="lCode">Code (short, no spaces)</label>
            <input id="lCode" value={code} onChange={(e) => setCode(e.target.value)} disabled={!!link} placeholder="e.g. ppmp" autoFocus={!link} />
          </div>
          <div>
            <label className="f" htmlFor="lName">Name</label>
            <input id="lName" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="wide">
            <label className="f" htmlFor="lDesc">Description</label>
            <input id="lDesc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="wide">
            <label className="f" htmlFor="lUrl">Address (URL)</label>
            <input id="lUrl" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <label className="f" htmlFor="lOrder">Order in menu</label>
            <input id="lOrder" type="number" min={1} max={999} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
          </div>
          <div>
            <label className="f" htmlFor="lColor">Color</label>
            <input id="lColor" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
          <div className="wide">
            <span className="f">Who sees it</span>
            {ROLES.map((r) => (
              <label key={r} className="chk"><input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(r)} />{ROLE_LABEL[r]}</label>
            ))}
          </div>
          <label className="chk wide"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Shown in the menu</label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
