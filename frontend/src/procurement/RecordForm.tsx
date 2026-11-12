import { useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage, unwrap } from '../api/client';
import { NoticeBox, SimilarItem } from './bits';
import { useProc } from './context';
import {
  contractLength, DOC_LABEL, DOC_STATUSES, findSimilar, ITEM_LABEL, PROC_LABEL, PROC_TYPES, PROPOSAL_LABEL, REPEAT_LABEL, REPEAT_TYPES,
  type DocStatus, type FullRecord, type ProcType, type ProposalType, type RepeatType, type Similar,
} from './model';

interface Form {
  id: number | null; imported: boolean;
  dateReceived: string; officeId: number | null; preparedBy: string; dtsNo: string; logbookNo: string;
  procType: ProcType | null; proposalType: ProposalType; proposalStatus: DocStatus; withAtc: boolean; atcStatus: DocStatus;
  title: string; venue: string; start: string; end: string; cStart: string; cEnd: string; details: string; amount: string;
  repeatType: RepeatType | null; repeatOfId: number | null; repeatNote: string; remarks: string;
}

function empty(today: string): Form {
  return {
    id: null, imported: false, dateReceived: today, officeId: null, preparedBy: '', dtsNo: '', logbookNo: '',
    procType: null, proposalType: 'ACTIVITY_PROPOSAL', proposalStatus: 'FOR_REVIEW', withAtc: true, atcStatus: 'FOR_REVIEW',
    title: '', venue: '', start: '', end: '', cStart: '', cEnd: '', details: '', amount: '',
    repeatType: null, repeatOfId: null, repeatNote: '', remarks: '',
  };
}

function fromRecord(r: FullRecord): Form {
  const event = r.procType === 'EVENT';
  return {
    id: r.id, imported: !!r.source, dateReceived: r.dateReceived ?? '', officeId: r.officeId, preparedBy: r.preparedBy, dtsNo: r.dtsNo,
    logbookNo: r.logbookNo, procType: r.procType, proposalType: r.proposalType, proposalStatus: r.proposalStatus ?? 'FOR_REVIEW',
    withAtc: r.withAtc, atcStatus: r.atcStatus ?? 'FOR_REVIEW', title: r.title, venue: r.venue,
    start: event ? r.startDate ?? '' : '', end: event ? r.endDate ?? '' : '', cStart: event ? '' : r.startDate ?? '', cEnd: event ? '' : r.endDate ?? '',
    details: r.details, amount: r.amount != null ? String(r.amount) : '', repeatType: r.repeatType, repeatOfId: r.repeatOfId,
    repeatNote: r.repeatNote, remarks: r.remarks,
  };
}

/** What is wrong with the form, in the words the old system used; '' when it can be saved. */
function check(f: Form): string {
  if (!f.dateReceived) return 'Date received is required.';
  if (f.officeId == null) return 'Choose the office.';
  if (!f.imported) {
    if (!f.preparedBy.trim()) return 'Ilagay kung sino ang nag-prepare (Prepared by).';
    if (!f.dtsNo.trim()) return 'Ilagay ang DTS No.';
    if (!f.logbookNo.trim()) return 'Ilagay ang Logbook No. (G#).';
  }
  if (!f.title.trim()) return 'Enter the title.';
  if ((f.proposalType !== 'NONE' || f.withAtc) && !(Number(f.amount) > 0)) return 'Amount is required.';
  if (f.procType === 'EVENT') {
    if (!f.venue.trim()) return 'Venue of the event is required.';
    if (!f.start) return 'Date of the event is required.';
    if (f.end && f.end < f.start) return 'The end date is earlier than the start.';
  }
  const item = f.procType ? ITEM_LABEL[f.procType] : undefined;
  if (item?.[2] && !f.details.trim()) return f.procType === 'REPAIR' ? 'Ilagay kung ano ang ire-repair.' : 'Ilagay kung anong equipment.';
  if (f.procType === 'HIRING') {
    if (!f.cStart || !f.cEnd) return 'Duration of the contract (start and end) is required.';
    if (f.cEnd < f.cStart) return 'The end of the contract is earlier than the start.';
  }
  return '';
}

/** Step 1: a new procurement, or the edit form of one. */
export function RecordForm() {
  const { m, editRequest, full, applyRecord, viewRecord, toast, askStatus } = useProc();
  const [f, setF] = useState<Form>(() => empty(m.today));
  const [notice, setNotice] = useState<{ kind: 'bad' | 'warn' | 'info'; text: string } | null>(null);
  const [fromServer, setFromServer] = useState<Similar[] | null>(null);
  const [typedTitle, setTypedTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const repeatCard = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<Form>) => { setF((x) => ({ ...x, ...patch })); setNotice(null); };

  // the title is checked a moment after typing stops, not on every key
  useEffect(() => { const t = setTimeout(() => setTypedTitle(f.title), 300); return () => clearTimeout(t); }, [f.title]);

  useEffect(() => {
    if (editRequest.n === 0) return;
    setFromServer(null); setNotice(null);
    if (editRequest.id == null) { setF(empty(m.today)); return; }
    void full(editRequest.id).then((r) => {
      if (!r) return;
      setF(fromRecord(r));
      setTypedTitle(r.title);
      if (r.source) setNotice({ kind: 'info', text: 'Galing sa 2026 file. Hula lang ang klase ng procurement (base sa title) — i-check. Walang venue at petsa noong 2026; kailangang ilagay kung Event o Hiring.' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest]);

  const similar = useMemo(() => fromServer ?? findSimilar(m, typedTitle, f.id, f.officeId), [m, typedTitle, f.id, f.officeId, fromServer]);
  const mine = similar.filter((s) => s.officeId === f.officeId), other = similar.filter((s) => s.officeId !== f.officeId);
  const mustAnswer = mine.length > 0;
  const office = f.officeId != null ? m.officeById.get(f.officeId)?.name ?? '' : '';
  const item = f.procType ? ITEM_LABEL[f.procType] : undefined;
  const editing = f.id != null ? m.recById.get(f.id)?.full ?? null : null;

  // "Which one?": same office first; the record already chosen stays in the list
  const repeatChoices = useMemo(() => {
    const list = [...mine, ...other].map((s) => ({ id: s.id, label: s.code + ' · ' + s.office + ' · ' + s.title.slice(0, 70) }));
    const kept = f.repeatOfId != null ? m.recById.get(f.repeatOfId) : undefined;
    if (kept && !list.some((x) => x.id === kept.id)) list.unshift({ id: kept.id, label: kept.code + ' · ' + kept.office + ' · ' + kept.title.slice(0, 70) });
    return list;
  }, [mine, other, f.repeatOfId, m]);
  useEffect(() => {
    if (f.repeatType && f.repeatType !== 'DIFFERENT' && f.repeatOfId == null && repeatChoices[0]) setF((x) => ({ ...x, repeatOfId: repeatChoices[0]!.id }));
  }, [f.repeatType, f.repeatOfId, repeatChoices]);

  const hint = !f.procType ? 'Piliin kung anong klaseng procurement.' : mustAnswer && !f.repeatType ? 'Sagutin muna kung repeat ba ito.' : '';

  async function save() {
    const err = check(f);
    if (err) { setNotice({ kind: 'bad', text: err }); return; }
    if (!f.procType || f.officeId == null) return;
    setBusy(true); setNotice(null);
    const hire = f.procType === 'HIRING';
    const body = {
      dateReceived: f.dateReceived, officeId: f.officeId, preparedBy: f.preparedBy, proposalType: f.proposalType, withAtc: f.withAtc,
      procType: f.procType, title: f.title, details: item ? f.details : '', venue: f.venue,
      startDate: (hire ? f.cStart : f.start) || undefined, endDate: (hire ? f.cEnd : f.end || f.start) || undefined,
      amount: f.amount === '' ? undefined : Number(f.amount),
      proposalStatus: f.proposalType !== 'NONE' ? f.proposalStatus : undefined, atcStatus: f.withAtc ? f.atcStatus : undefined,
      dtsNo: f.dtsNo, logbookNo: f.logbookNo, remarks: f.remarks, repeatType: f.repeatType ?? undefined,
      repeatOfId: f.repeatType && f.repeatType !== 'DIFFERENT' ? f.repeatOfId ?? undefined : undefined, repeatNote: f.repeatNote,
    };
    try {
      const query = { year: m.year };
      const res = f.id == null
        ? await unwrap(api.POST('/api/procurement/records', { params: { query }, body }))
        : await unwrap(api.PUT('/api/procurement/records/{id}', { params: { path: { id: f.id }, query }, body }));
      if (!res.record) {
        // someone saved a look-alike record after this page was loaded
        setFromServer(res.similar);
        setNotice({ kind: 'warn', text: 'May bagong kahawig na record. Sagutin muna kung repeat ba ito.' });
        repeatCard.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      applyRecord(res.record, res.budgets);
      toast((f.id == null ? 'Saved ' : 'Updated ') + res.record.code);
      setF(empty(m.today)); setFromServer(null); setTypedTitle('');
      viewRecord(res.record.id);
    } catch (e) {
      setNotice({ kind: 'bad', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const statusSelect = (id: string, value: DocStatus, onChange: (v: DocStatus) => void, disabled = false) => (
    <select id={id} className="docst" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as DocStatus)}>
      {DOC_STATUSES.map((s) => <option key={s} value={s}>{DOC_LABEL[s]}</option>)}
    </select>
  );

  return (
    <>
      <h3 className="first">{f.id == null ? 'New Procurement' : 'Edit ' + (editing?.code ?? '')}</h3>
      <div className="card">
        <h3><span className="step">1</span> Proposal</h3>
        <div className="grid">
          <div><label className="f" htmlFor="fReceived">Date received *</label><input id="fReceived" type="date" value={f.dateReceived} onChange={(e) => set({ dateReceived: e.target.value })} /></div>
          <div><label className="f" htmlFor="fOffice">Office *</label>
            <select id="fOffice" value={f.officeId ?? ''} onChange={(e) => { set({ officeId: e.target.value ? Number(e.target.value) : null }); setFromServer(null); }}>
              <option value="">— select —</option>
              {m.data.offices.filter((o) => o.active || o.id === f.officeId).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select></div>
          <div><label className="f" htmlFor="fBy">Prepared by {!f.imported && '*'}</label><input id="fBy" list="personOpts" autoComplete="off" maxLength={150} value={f.preparedBy} onChange={(e) => set({ preparedBy: e.target.value })} /></div>
          <div><label className="f" htmlFor="fDts">DTS No. {!f.imported && '*'}</label><input id="fDts" maxLength={100} value={f.dtsNo} onChange={(e) => set({ dtsNo: e.target.value })} /></div>
          <div><label className="f" htmlFor="fLog">Logbook No. (G#) {!f.imported && '*'}</label><input id="fLog" maxLength={100} placeholder="e.g. G#224-024" value={f.logbookNo} onChange={(e) => set({ logbookNo: e.target.value })} /></div>
        </div>

        <div className="question">Anong klaseng procurement?</div>
        <div className="choices" role="radiogroup">
          {PROC_TYPES.map((t) => <label key={t} className="choice"><input type="radio" name="fType" checked={f.procType === t} onChange={() => set({ procType: t })} /> {PROC_LABEL[t]}</label>)}
        </div>

        <div className="question">Proposal</div>
        <div className="choices" role="radiogroup">
          {(['ACTIVITY_PROPOSAL', 'PROJECT_PROPOSAL', 'NONE'] as ProposalType[]).map((t) => (
            <label key={t} className="choice"><input type="radio" name="fPType" checked={f.proposalType === t} onChange={() => set({ proposalType: t })} /> {PROPOSAL_LABEL[t]}</label>
          ))}
        </div>
        {f.proposalType !== 'NONE' && <div className="doc"><label className="muted small" htmlFor="fPStatus">Status ng {PROPOSAL_LABEL[f.proposalType]} *</label>
          {statusSelect('fPStatus', f.proposalStatus, (v) => set({ proposalStatus: v }))}</div>}
        <div className="doc">
          <label className="chk flat"><input type="checkbox" checked={f.withAtc} onChange={(e) => set({ withAtc: e.target.checked })} />May Authority to Conduct (ATC)</label>
          {statusSelect('fAtcStatus', f.atcStatus, (v) => set({ atcStatus: v }), !f.withAtc)}
        </div>

        <label className="f" htmlFor="fTitle">Title ng activity / procurement *</label>
        <input id="fTitle" maxLength={500} autoComplete="off" placeholder="e.g. BFAR Risk Management Enhancement Training" value={f.title}
          onChange={(e) => { set({ title: e.target.value }); setFromServer(null); }} />
        {mine.length > 0 && <div className="alert warn gap">
          <b>⚠ May {mine.length} kahawig na activity na ang {office}</b>
          {mine.some((s) => s.status === 'CANCELLED') && ` (${mine.filter((s) => s.status === 'CANCELLED').length} dito ay cancelled)`}
          <div className="small">Kung PR lang ang idadagdag sa activity na naipasa na, buksan ang record at pindutin ang <b>+ Add PR</b>.</div>
          <ul className="sim">{mine.map((s) => <SimilarItem key={s.id} s={s} mine />)}</ul>
        </div>}
        {other.length > 0 && <details className="small gap"><summary>{other.length} kahawig sa ibang office{f.officeId == null && ' (pumili ng office sa itaas)'}</summary>
          <ul className="sim">{other.map((s) => <SimilarItem key={s.id} s={s} mine={false} />)}</ul></details>}

        {f.procType === 'EVENT' && <div className="sub"><div className="grid">
          <div className="wide"><label className="f" htmlFor="fVenue">Venue *</label><input id="fVenue" maxLength={500} placeholder="e.g. BFAR-CAR, Baguio City" value={f.venue} onChange={(e) => set({ venue: e.target.value })} /></div>
          <div><label className="f" htmlFor="fStart">Date of event (start) *</label><input id="fStart" type="date" value={f.start} onChange={(e) => set({ start: e.target.value, end: !f.end || f.end < e.target.value ? e.target.value : f.end })} /></div>
          <div><label className="f" htmlFor="fEnd">Date of event (end)</label><input id="fEnd" type="date" min={f.start} value={f.end} onChange={(e) => set({ end: e.target.value })} /></div>
        </div></div>}
        {item && <div className="sub">
          <label className="f" htmlFor="fItem">{item[0]} {item[2] && '*'}</label>
          <textarea id="fItem" rows={2} maxLength={2000} placeholder={item[1]} value={f.details} onChange={(e) => set({ details: e.target.value })} />
        </div>}
        {f.procType === 'HIRING' && <div className="sub"><div className="grid">
          <div><label className="f" htmlFor="fCStart">Contract start *</label><input id="fCStart" type="date" value={f.cStart} onChange={(e) => set({ cStart: e.target.value })} /></div>
          <div><label className="f" htmlFor="fCEnd">Contract end *</label><input id="fCEnd" type="date" min={f.cStart} value={f.cEnd} onChange={(e) => set({ cEnd: e.target.value })} /></div>
          <div className="muted small self-end">{contractLength(f.cStart, f.cEnd)}</div>
        </div></div>}
        <div className="grid">
          <div><label className="f" htmlFor="fAmount">Amount {(f.proposalType !== 'NONE' || f.withAtc) && '*'}</label>
            <input id="fAmount" type="number" min="0" step="0.01" placeholder="0.00" value={f.amount} onChange={(e) => set({ amount: e.target.value })} /></div>
        </div>
      </div>

      {(mustAnswer || f.repeatType) && <div className="card gap-card" ref={repeatCard}>
        <h3><span className="step">!</span> Repeat ba ito?</h3>
        <p className="muted first">May kahawig na activity ang office na ito. Piliin kung ano ito bago i-save.</p>
        <div className="stack-choices" role="radiogroup">
          {REPEAT_TYPES.map((t) => (
            <label key={t} className="choice block"><input type="radio" name="fRep" checked={f.repeatType === t} onChange={() => set({ repeatType: t })} />
              <span><b>{REPEAT_LABEL[t][0]}</b> – {REPEAT_LABEL[t][1]}</span></label>
          ))}
        </div>
        {f.repeatType && f.repeatType !== 'DIFFERENT' && <div className="grid">
          <div><label className="f" htmlFor="fRepeatOf">Alin sa mga ito? *</label>
            <select id="fRepeatOf" value={f.repeatOfId ?? ''} onChange={(e) => set({ repeatOfId: e.target.value ? Number(e.target.value) : null })}>
              {repeatChoices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select></div>
          <div><label className="f" htmlFor="fRepeatNote">Note</label><input id="fRepeatNote" maxLength={500} placeholder="e.g. 2nd batch / ibinalik ng FPED / bagong petsa" value={f.repeatNote} onChange={(e) => set({ repeatNote: e.target.value })} /></div>
        </div>}
      </div>}

      <div className="card gap-card">
        <label className="f first" htmlFor="fRemarks">Remarks</label>
        <input id="fRemarks" maxLength={1000} value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} />
        <div className="gap"><NoticeBox notice={notice} /></div>
        <div className="form-actions">
          <button type="button" className="btn primary" disabled={busy || !!hint} onClick={() => void save()}>Save</button>
          <button type="button" className="btn" onClick={() => { setF(empty(m.today)); setFromServer(null); setNotice(null); }}>Clear</button>
          {hint && <span className="small red">{hint}</span>}
          {editing && <button type="button" className="btn danger push" onClick={() => askStatus({ kind: 'record', record: editing, cancel: true })}>Cancel this procurement</button>}
        </div>
      </div>
    </>
  );
}
