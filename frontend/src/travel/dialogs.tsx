import { useMemo, useState, type FormEvent } from 'react';
import { api, errorMessage, unwrap } from '../api/client';
import { Modal } from '../components/Modal';
import { ConflictBox, serverItems, tripItems, type ConflictItem } from './bits';
import { useTravel, type PersonDialogOptions } from './context';
import { conflictsFor, EMPLOYMENT_LABEL, EMPLOYMENTS, inWindow, norm, officeChoices, range, travelerNames, type Employment, type Order } from './model';

/** Confirmation for cancelling or restoring a travel order. */
export function StatusDialog({ order, mode, onClose }: { order: Order; mode: 'cancel' | 'restore'; onClose(): void }) {
  const { m, applyOrder, toast, form, newForm } = useTravel();
  const restore = mode === 'restore';
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fromServer, setFromServer] = useState<ConflictItem[] | null>(null);
  // when restoring, warn right away if the travelers already have other travel on those dates
  const local = useMemo(() => restore && inWindow(m, order.startDate, order.endDate)
    ? tripItems(m, conflictsFor(m, order.travelerIds, order.startDate, order.endDate, order.id)) : [], [m, order, restore]);
  const conflicts = fromServer ?? local;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = reason.trim();
    if (conflicts.length && !text) { setError('Please enter a reason.'); return; }
    setBusy(true); setError('');
    try {
      const params = { path: { id: order.id } };
      if (restore) {
        const res = await unwrap(api.POST('/api/travel/orders/{id}/restore', { params, body: { reason: text } }));
        if (!res.order) { setFromServer(serverItems(res.conflicts)); setError('Overlap found. Enter a reason to restore anyway.'); return; }
        applyOrder(res.order);
      } else {
        applyOrder(await unwrap(api.POST('/api/travel/orders/{id}/cancel', { params, body: { reason: text } })));
        if (form.id === order.id) newForm();
      }
      toast(order.code + (restore ? ' restored' : ' cancelled'));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={(restore ? 'Restore ' : 'Cancel ') + order.code + '?'} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">{range(order.startDate, order.endDate)} — {order.destination} — {travelerNames(m, order).join(', ')}</p>
        <ConflictBox items={conflicts} />
        <label className="f" htmlFor="stReason">{conflicts.length ? 'Reason for allowing the overlap *' : 'Reason'}</label>
        <input id="stReason" value={reason} maxLength={500} placeholder={conflicts.length ? 'required' : 'optional'} autoFocus
          onChange={(e) => setReason(e.target.value)} />
        {error && <div className="alert bad gap">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Back</button>
          <button type="submit" className={'btn ' + (restore ? 'primary' : 'danger')} disabled={busy}>
            {restore ? 'Restore travel order' : 'Cancel travel order'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Moves a travel order to new dates and/or a new place. Same TO ID; the old ones go to the history. */
export function RescheduleDialog({ order, onClose }: { order: Order; onClose(): void }) {
  const { m, applyOrder, toast, form, setForm } = useTravel();
  const [start, setStart] = useState(order.startDate);
  const [end, setEnd] = useState(order.endDate);
  const [dest, setDest] = useState(order.destination);
  const [reason, setReason] = useState('');
  const [overlap, setOverlap] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fromServer, setFromServer] = useState<ConflictItem[] | null>(null);

  const sameDates = start === order.startDate && end === order.endDate; // same dates = no new overlap
  const local = useMemo(() => start && end && !sameDates && inWindow(m, start, end)
    ? tripItems(m, conflictsFor(m, order.travelerIds, start, end, order.id)) : [], [m, order, start, end, sameDates]);
  const conflicts = fromServer ?? local;

  function changeStart(v: string) { setStart(v); if (!end || end < v) setEnd(v); setFromServer(null); }
  function changeEnd(v: string) { setEnd(v < start ? start : v); setFromServer(null); }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!start) { setError('Please enter the new dates.'); return; }
    if (!dest.trim()) { setError('Please enter the place / destination.'); return; }
    if (sameDates && dest.trim() === order.destination) { setError('Nothing was changed. Change the dates and/or the place.'); return; }
    if (!reason.trim()) { setError('Please enter the reason for the change.'); return; }
    if (conflicts.length && !overlap.trim()) { setError('There is an overlap. Enter a reason to allow it, or pick other dates.'); return; }
    setBusy(true); setError('');
    try {
      const res = await unwrap(api.POST('/api/travel/orders/{id}/reschedule', {
        params: { path: { id: order.id } },
        body: { startDate: start, endDate: end || start, destination: dest.trim(), reason: reason.trim(), overlapReason: overlap.trim() },
      }));
      if (!res.order) { setFromServer(serverItems(res.conflicts)); setError('Overlap found. Enter a reason to allow it, or pick other dates.'); return; }
      applyOrder(res.order);
      // the edit form may be open on this same travel order
      if (form.id === order.id) setForm({ start: res.order.startDate, end: res.order.endDate, dest: res.order.destination, reason: res.order.overlapReason });
      toast(order.code + ' changed: ' + range(res.order.startDate, res.order.endDate) + ' — ' + res.order.destination);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={'Change date / place — ' + order.code} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">Current: {range(order.startDate, order.endDate)} — {order.destination} — {travelerNames(m, order).join(', ')}</p>
        <div className="grid">
          <div><label className="f" htmlFor="rsStart">New start *</label><input id="rsStart" type="date" value={start} onChange={(e) => changeStart(e.target.value)} /></div>
          <div><label className="f" htmlFor="rsEnd">New end *</label><input id="rsEnd" type="date" value={end} min={start} onChange={(e) => changeEnd(e.target.value)} /></div>
        </div>
        <label className="f" htmlFor="rsDest">Place / destination *</label>
        <input id="rsDest" value={dest} maxLength={500} onChange={(e) => setDest(e.target.value)} />
        <label className="f" htmlFor="rsReason">Reason for the change *</label>
        <input id="rsReason" value={reason} maxLength={500} placeholder="e.g. Activity moved by organizer / venue changed" onChange={(e) => setReason(e.target.value)} />
        {conflicts.length > 0 && <>
          <div className="gap"><ConflictBox items={conflicts} /></div>
          <label className="f" htmlFor="rsOverlap">Reason for allowing the overlap *</label>
          <input id="rsOverlap" value={overlap} maxLength={1000} onChange={(e) => setOverlap(e.target.value)} />
        </>}
        {error && <div className="alert bad gap">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Back</button>
          <button type="submit" className="btn primary" disabled={busy}>Save change</button>
        </div>
      </form>
    </Modal>
  );
}

const SUFFIX = /^(JR|SR|II|III|IV)$/;

/** Add or edit a person. Warns when the name looks like someone already in the list. */
export function PersonDialog({ options, onClose }: { options: PersonDialogOptions; onClose(): void }) {
  const { m, applyPerson, toast } = useTravel();
  const { person, onPicked } = options;
  const [name, setName] = useState(person ? person.name : (options.presetName ?? '').toUpperCase());
  const [officeId, setOfficeId] = useState<number | null>(person ? person.officeId : options.presetOfficeId ?? null);
  const [position, setPosition] = useState(person?.position ?? '');
  const [employment, setEmployment] = useState<Employment | null>(person?.employment ?? null);
  const [active, setActive] = useState(person?.active ?? true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // same person typed two ways, e.g. "ABIGAIL M. JAVIER" and "ABIGAIL JAVIER": two words in common is enough to ask
  const similar = useMemo(() => {
    const words = norm(name).split(' ').filter((w) => w.length > 1 && !SUFFIX.test(w));
    if (words.length < 2) return [];
    return m.data.people.filter((p) => p.id !== person?.id).filter((p) => {
      const theirs = norm(p.name).split(' ');
      return words.filter((w) => theirs.includes(w)).length >= 2;
    }).slice(0, 5);
  }, [m, name, person]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!employment) { setError('Please click Permanent or COS.'); return; }
    setBusy(true); setError('');
    try {
      const body = { name, officeId: officeId ?? undefined, position, employment, active };
      const saved = person
        ? await unwrap(api.PUT('/api/travel/personnel/{id}', { params: { path: { id: person.id } }, body }))
        : await unwrap(api.POST('/api/travel/personnel', { body }));
      applyPerson(saved);
      onPicked?.(saved);
      toast(saved.name + ' saved');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={person ? 'Edit ' + person.code : 'Add person'} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="f" htmlFor="pmName">Full name *</label>
        <input id="pmName" value={name} maxLength={150} placeholder="e.g. JUAN A. DELA CRUZ JR." autoFocus onChange={(e) => setName(e.target.value)} />
        {similar.length > 0 && <div className="alert warn small gap">
          <b>Similar names already in the list:</b>
          <ul>
            {similar.map((p) => (
              <li key={p.id}>
                {p.name} — {p.office || 'no office'} ({p.code}){!p.active && ' · inactive'}
                {onPicked && p.active && <> <button type="button" className="link" onClick={() => { onPicked(p); onClose(); }}>use this</button></>}
              </li>
            ))}
          </ul>
          Make sure this is a different person.
        </div>}
        <label className="f" htmlFor="pmOffice">Office</label>
        <select id="pmOffice" value={officeId ?? ''} onChange={(e) => setOfficeId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">— select —</option>
          {officeChoices(m, person?.officeId).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <label className="f" htmlFor="pmPos">Position</label>
        <input id="pmPos" value={position} maxLength={150} onChange={(e) => setPosition(e.target.value)} />
        <span className="f">Employment *</span>
        <div className="seg big">
          {EMPLOYMENTS.map((v) => (
            <button key={v} type="button" className={employment === v ? 'on' : ''} aria-pressed={employment === v} onClick={() => setEmployment(v)}>{EMPLOYMENT_LABEL[v]}</button>
          ))}
        </div>
        {person && <div><label className="chk"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Active</label></div>}
        {error && <div className="alert bad gap">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
