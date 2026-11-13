import { useMemo, useState, type KeyboardEvent } from 'react';
import { api, errorMessage, unwrap } from '../api/client';
import { ChecklistBoxes } from './dialogs';
import { ConflictBox, EmpTag, HistoryBox, NoticeBox, serverItems, tripItems, type ConflictItem } from './bits';
import { useTravel } from './context';
import { conflictsFor, days, inWindow, norm, officeChoices, personOption, range, statusOf, type Person } from './model';

/** New travel order, or the edit form of an active one. */
export function OrderForm() {
  const { m, form, setForm, newForm, formNotice, setFormNotice, applyOrder, reload, toast, askCancel, openPersonDialog } = useTravel();
  const [typed, setTyped] = useState('');
  const [notFound, setNotFound] = useState('');
  const [busy, setBusy] = useState(false);
  const [fromServer, setFromServer] = useState<ConflictItem[] | null>(null);
  const editing = form.id == null ? undefined : m.orderById.get(form.id);

  const start = form.start, end = form.end || form.start;
  const checkable = !!start && form.pids.length > 0;
  const outside = checkable && !inWindow(m, start, end);
  const local = useMemo(() => checkable && !outside ? conflictsFor(m, form.pids, start, end, form.id) : [],
    [m, form.pids, form.id, start, end, checkable, outside]);
  const conflicts = fromServer ?? tripItems(m, local);
  const badPids = new Set(local.map((t) => t.pid));
  const options = useMemo(() => m.data.people.filter((p) => p.active).map(personOption), [m]);

  function addPerson(p: Person) {
    setForm({ pids: form.pids.includes(p.id) ? form.pids : [...form.pids, p.id], officeId: form.officeId ?? p.officeId });
    setTyped(''); setNotFound(''); setFromServer(null);
  }

  /** The name box holds either a line picked from the list ("NAME — OFFICE (P0001)") or a name typed by hand. */
  function tryAdd(text: string, typedByHand: boolean) {
    const v = text.trim();
    if (!v) return;
    const code = /\((P\d+)\)\s*$/.exec(v)?.[1];
    const hit = (code && m.data.people.find((p) => p.code === code))
      || (typedByHand ? m.data.people.find((p) => p.active && norm(p.name) === norm(v)) : undefined);
    if (hit) addPerson(hit);
    else if (typedByHand && !v.includes('(')) setNotFound(v);
  }

  function onNameKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); tryAdd(typed, true); }
  }

  function change(patch: Parameters<typeof setForm>[0]) {
    setForm(patch); setFromServer(null);
  }

  async function save() {
    const missing: string[] = [];
    if (!form.pids.length) missing.push('travelers');
    if (!start) missing.push('start date');
    if (form.officeId == null) missing.push('office');
    if (!form.dest.trim()) missing.push('destination');
    if (!form.purpose.trim()) missing.push('purpose');
    if (missing.length || form.officeId == null) { setFormNotice({ kind: 'bad', text: 'Please fill in: ' + missing.join(', ') + '.' }); return; }
    if (end < start) { setFormNotice({ kind: 'bad', text: 'End date is earlier than start date.' }); return; }
    if (conflicts.length && !form.reason.trim()) {
      setFormNotice({ kind: 'bad', text: 'There is an overlap. Remove the traveler, change the dates, or enter a reason to save anyway.' });
      return;
    }
    setBusy(true); setFormNotice({ kind: 'warn', text: 'Saving…' });
    try {
      const body = {
        startDate: start, endDate: end, dateFiled: form.filed || undefined, officeId: form.officeId, destination: form.dest,
        purpose: form.purpose, dtsNo: form.dts, toNo: form.toNo, remarks: form.remarks, travelerIds: form.pids, overlapReason: form.reason, checkedDocumentIds: form.checked,
      };
      const res = form.id == null
        ? await unwrap(api.POST('/api/travel/orders', { body }))
        : await unwrap(api.PUT('/api/travel/orders/{id}', { params: { path: { id: form.id } }, body }));
      if (!res.order) {
        // someone else saved a conflicting travel in the meantime, or the dates are outside the loaded year
        setFromServer(serverItems(res.conflicts));
        setFormNotice({ kind: 'bad', text: 'Overlap found while saving. Enter a reason to save anyway.' });
        void reload();
        return;
      }
      applyOrder(res.order);
      newForm({ kind: 'ok', text: '✔ ' + res.order.code + (form.id == null ? ' saved.' : ' updated.') });
      setFromServer(null);
      toast(res.order.code + ' saved');
    } catch (err) {
      setFormNotice({ kind: 'bad', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h3 className="first">{editing ? 'Edit ' + editing.code : 'New Travel Order'}</h3>
      <div className="card">
        <div className="grid">
          <div className="wide">
            <label className="f first" htmlFor="fTraveler">Travelers *</label>
            <input id="fTraveler" list="peopleOpts" autoComplete="off" placeholder="Type a name and pick from the list…" value={typed}
              onChange={(e) => { setTyped(e.target.value); setNotFound(''); if (options.includes(e.target.value)) tryAdd(e.target.value, false); }}
              onKeyDown={onNameKey} onBlur={() => tryAdd(typed, true)} />
            <datalist id="peopleOpts">{options.map((o) => <option key={o} value={o} />)}</datalist>
            <div className="chips">
              {form.pids.map((pid) => {
                const p = m.personById.get(pid);
                return (
                  <span key={pid} className={'chip' + (badPids.has(pid) ? ' bad' : '')}>
                    {badPids.has(pid) && '⚠ '}{p?.name ?? '#' + pid}<EmpTag person={p} />
                    <button type="button" title="Remove" aria-label={'Remove ' + (p?.name ?? '')} onClick={() => change({ pids: form.pids.filter((x) => x !== pid) })}>×</button>
                  </span>
                );
              })}
            </div>
            {notFound && <div className="small gap">
              “{notFound}” is not in the personnel list.{' '}
              <button type="button" className="link" onClick={() => openPersonDialog({ presetName: notFound, presetOfficeId: form.officeId, onPicked: addPerson })}>+ Add as new person</button>
            </div>}
          </div>
          <div><label className="f" htmlFor="fStart">Start of travel *</label>
            <input id="fStart" type="date" value={form.start} onChange={(e) => change({ start: e.target.value, end: !form.end || form.end < e.target.value ? e.target.value : form.end })} /></div>
          <div><label className="f" htmlFor="fEnd">End of travel *</label>
            <input id="fEnd" type="date" value={form.end} min={form.start} onChange={(e) => change({ end: e.target.value })} /></div>
          <div><label className="f" htmlFor="fOffice">Office *</label>
            <select id="fOffice" value={form.officeId ?? ''} onChange={(e) => setForm({ officeId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">— select —</option>
              {officeChoices(m, form.officeId).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select></div>
          <div><label className="f" htmlFor="fFiled">Date received</label>
            <input id="fFiled" type="date" value={form.filed} onChange={(e) => setForm({ filed: e.target.value })} /></div>
          <div className="wide"><label className="f" htmlFor="fDest">Destination *</label>
            <input id="fDest" value={form.dest} maxLength={500} placeholder="e.g. Region 7 (Cebu City)" onChange={(e) => setForm({ dest: e.target.value })} /></div>
          <div className="wide"><label className="f" htmlFor="fPurpose">Purpose *</label>
            <textarea id="fPurpose" value={form.purpose} maxLength={2000} onChange={(e) => setForm({ purpose: e.target.value })} /></div>
          <div><label className="f" htmlFor="fDts">DTS #</label>
            <input id="fDts" value={form.dts} maxLength={100} onChange={(e) => setForm({ dts: e.target.value })} /></div>
          <div><label className="f" htmlFor="fToNo">TO / Page #</label>
            <input id="fToNo" value={form.toNo} maxLength={100} onChange={(e) => setForm({ toNo: e.target.value })} /></div>
          <div className="wide"><label className="f" htmlFor="fRemarks">Remarks</label>
            <input id="fRemarks" value={form.remarks} maxLength={1000} onChange={(e) => setForm({ remarks: e.target.value })} /></div>
        </div>
        <ChecklistBoxes checked={form.checked} onChange={(checked) => setForm({ checked })} />

        <div className="gap">
          {editing && <HistoryBox order={editing} />}
          {editing && statusOf(editing, m.today) === 'Completed' && <div className="alert warn">This travel is already completed. Edit only to correct the record.</div>}
          {outside && !fromServer && <div className="alert warn">
            These dates are outside {m.year}. The overlap check will be done when you save (or switch the year at the top to preview it).
          </div>}
          {checkable && !outside && conflicts.length === 0 && <div className="alert ok">
            ✔ No overlap — all {form.pids.length} traveler(s) are free on {range(start, end)} ({days(start, end)} day(s)).
          </div>}
          <ConflictBox items={conflicts} />
          {conflicts.length > 0 && <>
            <label className="f" htmlFor="fReason">Reason for allowing the overlap *</label>
            <textarea id="fReason" value={form.reason} maxLength={1000} placeholder="e.g. Amended travel order / same activity / approved by Director"
              onChange={(e) => setForm({ reason: e.target.value })} />
          </>}
          <div className="gap"><NoticeBox notice={formNotice} /></div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>
            {conflicts.length ? 'Save anyway (with reason)' : 'Save travel order'}
          </button>
          <button type="button" className="btn" onClick={() => { newForm(); setTyped(''); setNotFound(''); setFromServer(null); }}>Clear</button>
          {editing && <button type="button" className="btn danger push" onClick={() => askCancel(editing)}>Cancel this travel order</button>}
        </div>
      </div>
    </>
  );
}
