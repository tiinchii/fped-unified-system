import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage, unwrap } from '../api/client';
import { DocPills, NoticeBox, RecLink, TypeTag } from './bits';
import { useProc } from './context';
import {
  activePrs, DOC_LABEL, DOC_STATUSES, fmt, money, peso, prMissing, whenWhere,
  type DocStatus, type Facility, type FullRecord, type Plan,
} from './model';

interface Form {
  dtsNo: string; dateReceived: string; prDate: string; requisitioner: string; title: string; venue: string; start: string; end: string;
  amount: string; prStatus: DocStatus; plan: Plan | null; justification: string; facility: Facility | null; facilityJustification: string;
  replacesId: number | null; remarks: string;
}

/** Steps 2: find the record a PR is for, then the PR with its attachments. The SPPMP items come later (step 3). */
export function PrForm() {
  const { m, prRequest, full, applyRecord, viewRecord, toast, openBudget, editRecord, setTab } = useProc();
  const [record, setRecord] = useState<FullRecord | null>(null);
  const [prId, setPrId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState<Form | null>(null);
  const [notice, setNotice] = useState<{ kind: 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Form>) => { setF((x) => (x ? { ...x, ...patch } : x)); setNotice(null); };

  async function open(recordId: number, editId: number | null) {
    const r = await full(recordId);
    if (!r) return;
    if (r.status === 'CANCELLED') { toast(r.code + ' is cancelled. Restore it first.'); return; }
    const p = editId != null ? r.prs.find((x) => x.id === editId) ?? null : null;
    setRecord(r); setPrId(p?.id ?? null); setNotice(null);
    // a new PR starts with the details of the proposal; a cancelled PR of this record is picked as the one it replaces
    const cancelledHere = r.prs.filter((x) => x.status === 'CANCELLED');
    setF(p ? {
      dtsNo: p.dtsNo, dateReceived: p.dateReceived ?? m.today, prDate: p.prDate ?? '', requisitioner: p.requisitioner, title: p.title,
      venue: p.venue, start: p.startDate ?? '', end: p.endDate ?? '', amount: String(p.amount), prStatus: p.prStatus ?? 'FOR_REVIEW',
      plan: p.plan, justification: p.justification, facility: p.facility, facilityJustification: p.facilityJustification,
      replacesId: p.replacesId, remarks: p.remarks,
    } : {
      dtsNo: '', dateReceived: m.today, prDate: '', requisitioner: r.preparedBy, title: r.title, venue: r.venue, start: r.startDate ?? '',
      end: r.endDate ?? '', amount: activePrs(r).length || r.amount == null ? '' : String(r.amount), prStatus: 'FOR_REVIEW', plan: null,
      justification: '', facility: null, facilityJustification: '',
      replacesId: !activePrs(r).length && cancelledHere.length ? cancelledHere[cancelledHere.length - 1]!.id : null, remarks: '',
    });
  }

  useEffect(() => {
    if (prRequest.n === 0) return;
    if (prRequest.recordId == null) { setRecord(null); setF(null); setQ(''); return; }
    void open(prRequest.recordId, prRequest.prId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prRequest]);

  // the record of this form changed somewhere else (e.g. a PR was cancelled): show the newest version
  useEffect(() => {
    if (!record) return;
    const now = m.recById.get(record.id)?.full;
    if (now && now !== record) setRecord(now);
  }, [m, record]);

  /** Search for the record (all years): DTS of the proposal or a PR, title, office, ID. */
  const hits = useMemo(() => {
    const text = q.trim().toUpperCase();
    if (text.length < 2) return [];
    const words = text.split(/\s+/);
    return m.all.filter((r) => {
      const hay = [r.code, r.title, r.full?.details, r.office, r.dtsNo, r.full?.logbookNo, ...r.prs.map((p) => p.dtsNo + ' ' + p.title)].join(' ').toUpperCase();
      return words.every((w) => hay.includes(w));
    }).sort((a, b) => Number(a.status === 'CANCELLED') - Number(b.status === 'CANCELLED') || (b.dateReceived ?? '').localeCompare(a.dateReceived ?? '')).slice(0, 15);
  }, [m, q]);

  if (!record || !f) {
    return (
      <>
        <h3 className="first">New Purchase Request</h3>
        <div className="card">
          <h3>Para saang procurement?</h3>
          <input type="search" autoFocus placeholder="Hanapin ang DTS ng proposal, title, office o ID…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="muted small gap">Kasama ang lahat ng taon. Wala pa sa listahan?{' '}
            <button type="button" className="link" onClick={() => { editRecord(null); setTab('form'); }}>+ New procurement</button> muna.</div>
          <ul className="sim">
            {q.trim().length >= 2 && !hits.length && <li className="muted">Walang nahanap.</li>}
            {hits.map((r) => (
              <li key={r.id} className="pick" role="button" tabIndex={0} onClick={() => void open(r.id, null)} onKeyDown={(e) => { if (e.key === 'Enter') void open(r.id, null); }}>
                <b>{r.code}</b> · {r.title}<TypeTag type={r.procType} />
                <div className="small muted">{r.office} · received {fmt(r.dateReceived)}{r.dtsNo && ' · DTS ' + r.dtsNo}{whenWhere(r) && ' · ' + whenWhere(r)}</div>
                <div>{r.status === 'CANCELLED' && <span className="pill gone">Cancelled</span>}<DocPills r={r} /></div>
              </li>
            ))}
          </ul>
        </div>
      </>
    );
  }

  const r = record;
  const isEvent = r.procType === 'EVENT';
  const editingPr = prId != null ? r.prs.find((p) => p.id === prId) : undefined;
  const missing = prMissing({ source: editingPr?.source ?? '', status: 'ACTIVE', plan: f.plan, justification: f.justification, facility: isEvent ? f.facility : null,
    facilityJustification: f.facilityJustification }, r.procType);

  // cancelled PRs this one can replace: this record first, then the same office
  const candidates = m.all.flatMap((x) => x.prs.filter((c) => c.status === 'CANCELLED' && c.id !== prId && (x.id === r.id || x.officeId === r.officeId))
    .map((c) => ({ c, x }))).sort((a, b) => Number(b.x.id === r.id) - Number(a.x.id === r.id) || b.c.code.localeCompare(a.c.code));

  // the same PR DTS used twice is most likely a typing mistake
  const dts = f.dtsNo.trim().toUpperCase();
  const dup = dts ? m.all.flatMap((x) => x.prs.map((p) => ({ p, x }))).find(({ p }) => p.id !== prId && p.status !== 'CANCELLED' && p.dtsNo.toUpperCase() === dts) : undefined;

  // budget of the office for the year of the PR
  const prYear = Number((f.dateReceived || m.today).slice(0, 4)), amt = Number(f.amount) || 0;
  const b = m.budgetOf.get(r.officeId);
  const oldAmount = editingPr && editingPr.status !== 'CANCELLED' && (editingPr.dateReceived ?? '').startsWith(String(m.year)) ? editingPr.amount : 0;

  async function save() {
    if (!f) return;
    if (!f.dateReceived) { setNotice({ kind: 'bad', text: 'Date received of the PR is required.' }); return; }
    if (!f.title.trim()) { setNotice({ kind: 'bad', text: 'Enter the title.' }); return; }
    if (!(Number(f.amount) > 0)) { setNotice({ kind: 'bad', text: 'Amount of the PR is required.' }); return; }
    if (isEvent && (!f.venue.trim() || !f.start)) { setNotice({ kind: 'bad', text: 'Venue and date of the event are required.' }); return; }
    if (f.start && f.end && f.end < f.start) { setNotice({ kind: 'bad', text: 'The end date is earlier than the start.' }); return; }
    setBusy(true); setNotice(null);
    const body = {
      dtsNo: f.dtsNo, dateReceived: f.dateReceived, prDate: f.prDate || undefined, requisitioner: f.requisitioner, title: f.title,
      venue: f.venue, startDate: f.start || undefined, endDate: (f.end || f.start) || undefined, amount: Number(f.amount), prStatus: f.prStatus,
      plan: f.plan ?? undefined, justification: f.justification, facility: isEvent ? f.facility ?? undefined : undefined,
      facilityJustification: f.facilityJustification, replacesId: f.replacesId ?? undefined, remarks: f.remarks,
    };
    try {
      const query = { year: m.year };
      const res = prId == null
        ? await unwrap(api.POST('/api/procurement/records/{id}/prs', { params: { path: { id: r.id }, query }, body }))
        : await unwrap(api.PUT('/api/procurement/records/{id}/prs/{prId}', { params: { path: { id: r.id, prId }, query }, body }));
      applyRecord(res.record, res.budgets);
      const line = res.budgets.find((x) => x.officeId === r.officeId);
      const left = prYear === m.year && line?.budget != null ? ` · ${r.office} ${m.year} natitira: ${peso(line.budget - line.used)}${line.used > line.budget ? ' (LAMPAS!)' : ''}` : '';
      toast((prId == null ? 'PR saved' : 'PR updated') + left);
      setRecord(null); setF(null); setQ('');
      viewRecord(r.id);
    } catch (e) {
      setNotice({ kind: 'bad', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h3 className="first">{editingPr ? 'Edit PR ' + (editingPr.dtsNo || editingPr.code) : 'New Purchase Request'}</h3>
      <div className="card">
        <div className="row spread top">
          <div>
            <div className="muted small">PARA SA</div>
            <b><RecLink id={r.id} code={r.code} /></b> · {r.title}<TypeTag type={r.procType} />
            <div className="small muted">{r.office} · received {fmt(r.dateReceived)}{r.dtsNo && ' · DTS ' + r.dtsNo}
              {whenWhere(m.recById.get(r.id)!) && ' · ' + whenWhere(m.recById.get(r.id)!)}{r.amount ? ' · ₱' + money(r.amount) : ''}</div>
            <div><DocPills r={m.recById.get(r.id)!} /></div>
          </div>
          {!editingPr && <button type="button" className="btn small" onClick={() => { setRecord(null); setF(null); }}>Palitan</button>}
        </div>
      </div>

      <div className="card gap-card">
        <h3><span className="step">2</span> Purchase Request (PR)</h3>
        <div className="grid">
          <div><label className="f" htmlFor="pDts">DTS No. ng PR</label><input id="pDts" maxLength={100} placeholder="e.g. PR27010132LIB" value={f.dtsNo} onChange={(e) => set({ dtsNo: e.target.value })} /></div>
          <div><label className="f" htmlFor="pReceived">Date received *</label><input id="pReceived" type="date" value={f.dateReceived} onChange={(e) => set({ dateReceived: e.target.value })} /></div>
          <div><label className="f" htmlFor="pDate">PR date</label><input id="pDate" type="date" value={f.prDate} onChange={(e) => set({ prDate: e.target.value })} /></div>
          <div><label className="f" htmlFor="pReq">Requisitioner</label><input id="pReq" list="personOpts" autoComplete="off" maxLength={150} value={f.requisitioner} onChange={(e) => set({ requisitioner: e.target.value })} /></div>
          <div className="wide"><label className="f" htmlFor="pTitle">Title ng activity *</label><input id="pTitle" maxLength={500} value={f.title} onChange={(e) => set({ title: e.target.value })} /></div>
        </div>
        {dup && <div className="alert warn small gap">Ginamit na ang DTS na ito sa PR ng <RecLink id={dup.x.id} code={dup.x.code} /> ({dup.p.title}).</div>}
        {isEvent && <div className="grid">
          <div className="wide"><label className="f" htmlFor="pVenue">Venue *</label><input id="pVenue" maxLength={500} value={f.venue} onChange={(e) => set({ venue: e.target.value })} /></div>
          <div><label className="f" htmlFor="pStart">Date (start) *</label><input id="pStart" type="date" value={f.start} onChange={(e) => set({ start: e.target.value, end: !f.end || f.end < e.target.value ? e.target.value : f.end })} /></div>
          <div><label className="f" htmlFor="pEnd">Date (end)</label><input id="pEnd" type="date" min={f.start} value={f.end} onChange={(e) => set({ end: e.target.value })} /></div>
        </div>}
        <div className="grid">
          <div><label className="f" htmlFor="pAmount">Amount *</label><input id="pAmount" type="number" min="0" step="0.01" placeholder="0.00" value={f.amount} onChange={(e) => set({ amount: e.target.value })} /></div>
          <div><label className="f" htmlFor="pStatus">PR status *</label>
            <select id="pStatus" className="docst" value={f.prStatus} onChange={(e) => set({ prStatus: e.target.value as DocStatus })}>
              {DOC_STATUSES.map((s) => <option key={s} value={s}>{DOC_LABEL[s]}</option>)}
            </select></div>
          <div className="wide"><label className="f" htmlFor="pReplaces">Kapalit ng na-cancel na PR?</label>
            <select id="pReplaces" value={f.replacesId ?? ''} onChange={(e) => set({ replacesId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">— wala, bagong PR —</option>
              {candidates.map(({ c, x }) => <option key={c.id} value={c.id}>{(c.dtsNo ? 'DTS ' + c.dtsNo : c.code) + ' · ' + c.title.slice(0, 60) + (x.id === r.id ? ' (this record)' : ' · ' + x.code)}</option>)}
            </select>
            <div className="muted small gap-s">Kung bagong PR ito ng parehong activity (hal. binago ang petsa), piliin ang DTS ng dating PR na na-cancel.</div></div>
        </div>
        {prYear !== m.year
          ? <div className="budgetbox">Budget ng {r.office} {prYear}: makikita pagka-save (piliin ang {prYear} sa itaas para makita ngayon).</div>
          : !b || b.budget == null
            ? <div className="budgetbox">Wala pang budget ang {r.office} para sa {prYear}. <button type="button" className="link" onClick={() => openBudget(r.officeId)}>Ilagay ang budget</button></div>
            : (() => {
              const usedOthers = b.used - oldAmount, after = b.budget - usedOthers - amt;
              return <div className={'budgetbox' + (after < 0 ? ' over' : '')}>
                Budget ng <b>{r.office}</b> {prYear}: ₱{money(b.budget)} · Nagamit (ibang PR): {peso(usedOthers)} · Natitira: {peso(b.budget - usedOthers)}
                <br /><b>Matitira pagkatapos ng PR na ito: {peso(after)}</b>{after < 0 && ' — ⚠ LAMPAS SA BUDGET (puwede pa ring i-save)'}
              </div>;
            })()}
      </div>

      <div className="card gap-card">
        <h3>Attachments</h3>
        <div className="question">PPMP o SPPMP?</div>
        <div className="choices" role="radiogroup">
          <label className="choice"><input type="radio" name="pPlan" checked={f.plan === 'PPMP'} onChange={() => set({ plan: 'PPMP' })} /> May PPMP</label>
          <label className="choice"><input type="radio" name="pPlan" checked={f.plan === 'SPPMP'} onChange={() => set({ plan: 'SPPMP' })} /> Walang PPMP – may SPPMP</label>
          <label className="choice"><input type="radio" name="pPlan" checked={f.plan === null} onChange={() => set({ plan: null })} /> Wala pareho</label>
        </div>
        {f.plan === 'SPPMP' && <div className="sub">
          <label className="f" htmlFor="pJust">Justification re SPPMP</label>
          <textarea id="pJust" maxLength={2000} placeholder="Bakit SPPMP (hindi kasama sa PPMP)?" value={f.justification} onChange={(e) => set({ justification: e.target.value })} />
          <div className="muted small gap-s">Ang mismong SPPMP (items at amount) ay ilalagay sa <b>Step 3</b> sa record, pagbalik ng papel galing sa office.</div>
        </div>}
        {isEvent && <>
          <div className="question">Venue: Government o Non-Government facility?</div>
          <div className="choices" role="radiogroup">
            <label className="choice"><input type="radio" name="pFac" checked={f.facility === 'GOVERNMENT'} onChange={() => set({ facility: 'GOVERNMENT' })} /> Government facility</label>
            <label className="choice"><input type="radio" name="pFac" checked={f.facility === 'NON_GOVERNMENT'} onChange={() => set({ facility: 'NON_GOVERNMENT' })} /> Non-Government</label>
          </div>
          {f.facility === 'NON_GOVERNMENT' && <div className="sub">
            <label className="f" htmlFor="pFacJust">Justification kung bakit hindi sa government facility</label>
            <textarea id="pFacJust" maxLength={2000} value={f.facilityJustification} onChange={(e) => set({ facilityJustification: e.target.value })} />
          </div>}
        </>}
        <div className="gap">
          {missing.length
            ? <div className="alert bad"><b>Kulang ang attachments – ibalik sa {r.office}</b><ul>{missing.map((x) => <li key={x}>{x}</li>)}</ul>
              <div className="small">Puwede pa ring i-save; lalabas ito bilang <b>Incomplete – return to office</b>. Pagkabalik sa office, i-record sa Routing: <b>Returned to office</b>.</div></div>
            : <div className="alert ok">✔ Kumpleto ang attachments.</div>}
        </div>
      </div>

      <div className="card gap-card">
        <label className="f first" htmlFor="pRemarks">Remarks</label>
        <input id="pRemarks" maxLength={1000} value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} />
        <div className="gap"><NoticeBox notice={notice} /></div>
        <div className="form-actions">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>Save PR</button>
          <button type="button" className="btn" onClick={() => viewRecord(r.id)}>Back</button>
        </div>
      </div>
    </>
  );
}
