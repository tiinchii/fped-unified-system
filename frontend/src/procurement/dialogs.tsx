import { useState, type FormEvent } from 'react';
import { api, errorMessage, unwrap } from '../api/client';
import { Modal } from '../components/Modal';
import { useProc } from './context';
import { activePrs, money, nowTime, ROUTE_ACTIONS, ROUTE_LABEL, type FullRecord, type Pr, type RouteAction } from './model';

/** Names typed before (prepared by, requisitioners, routing, who asked to cancel), for the suggestion lists. */
export function PersonOptions({ id }: { id: string }) {
  const { m } = useProc();
  const names = new Map<string, string>();
  for (const r of m.records) {
    [r.preparedBy, r.cancel?.requestedBy, ...r.routing.map((x) => x.person), ...r.prs.flatMap((p) => [p.requisitioner, p.cancel?.requestedBy])]
      .forEach((n) => { if (n) names.set(n.toUpperCase(), n); });
  }
  return <datalist id={id}>{[...names.values()].sort().map((n) => <option key={n} value={n} />)}</datalist>;
}

/** Cancel (with when and who asked for it) or restore a record or one PR. */
export function StatusDialog({ ask, onClose }: { ask: import('./context').StatusAsk; onClose(): void }) {
  const { m, applyRecord, toast } = useProc();
  const { record, cancel } = ask;
  const [date, setDate] = useState(m.today);
  const [time, setTime] = useState(nowTime());
  const [requestedBy, setRequestedBy] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const what = ask.kind === 'pr' ? 'PR ' + (ask.pr.dtsNo || ask.pr.code) : record.code;
  const n = activePrs(record).length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (cancel && !requestedBy.trim()) { setError('Ilagay kung sino ang nagsabi na i-cancel.'); return; }
    if (cancel && !date) { setError('Ilagay ang date at time.'); return; }
    if (cancel && !reason.trim()) { setError('Please enter the reason.'); return; }
    setBusy(true); setError('');
    try {
      const query = { year: m.year };
      const body = { date, time: time || undefined, requestedBy, reason };
      const res = ask.kind === 'pr'
        ? cancel ? await unwrap(api.POST('/api/procurement/prs/{prId}/cancel', { params: { path: { prId: ask.pr.id }, query }, body }))
          : await unwrap(api.POST('/api/procurement/prs/{prId}/restore', { params: { path: { prId: ask.pr.id }, query }, body: { reason } }))
        : cancel ? await unwrap(api.POST('/api/procurement/records/{id}/cancel', { params: { path: { id: record.id }, query }, body }))
          : await unwrap(api.POST('/api/procurement/records/{id}/restore', { params: { path: { id: record.id }, query }, body: { reason } }));
      applyRecord(res.record, res.budgets);
      toast(what + (cancel ? ' cancelled' : ' restored'));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={(cancel ? 'Cancel ' : 'Restore ') + what + '?'} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">
          {ask.kind === 'pr' ? ask.pr.title : record.title} — {record.office}
          {cancel && ask.kind === 'record' && n > 0 && ` · Hindi na rin bibilangin sa budget ang ${n} PR nito.`}
          {cancel && ask.kind === 'pr' && ` · Ibabalik sa budget ang ₱${money(ask.pr.amount)}. Kung may bagong PR para dito, i-link ito sa PR na ito.`}
        </p>
        {cancel && <div className="grid two-col">
          <div><label className="f" htmlFor="smDate">Date ng cancel *</label><input id="smDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label className="f" htmlFor="smTime">Time *</label><input id="smTime" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          <div className="wide"><label className="f" htmlFor="smBy">Sino ang nagsabi na i-cancel? *</label>
            <input id="smBy" list="personOpts" autoComplete="off" value={requestedBy} maxLength={150} autoFocus onChange={(e) => setRequestedBy(e.target.value)} /></div>
        </div>}
        <label className="f" htmlFor="smReason">{cancel ? 'Reason *' : 'Reason (optional)'}</label>
        <input id="smReason" value={reason} maxLength={500} autoFocus={!cancel} onChange={(e) => setReason(e.target.value)} />
        {error && <div className="alert bad gap">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Back</button>
          <button type="submit" className={'btn ' + (cancel ? 'danger' : 'primary')} disabled={busy}>
            {cancel ? 'Cancel ' + (ask.kind === 'pr' ? 'PR' : 'procurement') : 'Restore'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Step 4: to whom the papers went / who reviewed them, with date and time. */
export function RoutingDialog({ record, prId, action, onClose }: { record: FullRecord; prId: number | null; action?: RouteAction; onClose(): void }) {
  const { m, applyRecord, toast } = useProc();
  const [forPr, setForPr] = useState<number | null>(prId);
  const [what, setWhat] = useState<RouteAction>(action ?? 'FORWARDED');
  const [person, setPerson] = useState('');
  const [date, setDate] = useState(m.today);
  const [time, setTime] = useState(nowTime());
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const personLabel = what === 'RETURNED' || what === 'RECEIVED_BACK' ? 'Sino ang tumanggap / kausap sa office *'
    : what === 'FORWARDED' ? 'Kanino ipinasa *' : 'Sino *';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!person.trim()) { setError('Enter the name of the person.'); return; }
    if (!date || !time) { setError('Enter the date and time.'); return; }
    setBusy(true); setError('');
    try {
      const res = await unwrap(api.POST('/api/procurement/records/{id}/routing', {
        params: { path: { id: record.id }, query: { year: m.year } },
        body: { prId: forPr ?? undefined, date, time, action: what, person, remarks },
      }));
      applyRecord(res.record, res.budgets);
      toast('Routing saved');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={'Routing — ' + record.code} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="grid two-col">
          <div className="wide"><label className="f" htmlFor="rtFor">Para sa</label>
            <select id="rtFor" value={forPr ?? ''} onChange={(e) => setForPr(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Proposal / buong procurement</option>
              {activePrs(record).map((p) => <option key={p.id} value={p.id}>PR {(p.dtsNo || p.code) + ' · ' + p.title.slice(0, 50)}</option>)}
            </select></div>
          <div className="wide"><label className="f" htmlFor="rtAction">Ano ang nangyari? *</label>
            <select id="rtAction" value={what} onChange={(e) => setWhat(e.target.value as RouteAction)}>
              {ROUTE_ACTIONS.map((a) => <option key={a} value={a}>{ROUTE_LABEL[a]}</option>)}
            </select></div>
          <div className="wide"><label className="f" htmlFor="rtPerson">{personLabel}</label>
            <input id="rtPerson" list="personOpts" autoComplete="off" value={person} maxLength={150} autoFocus onChange={(e) => setPerson(e.target.value)} /></div>
          <div><label className="f" htmlFor="rtDate">Date *</label><input id="rtDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label className="f" htmlFor="rtTime">Time *</label><input id="rtTime" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          <div className="wide"><label className="f" htmlFor="rtRemarks">Remarks</label><input id="rtRemarks" value={remarks} maxLength={1000} onChange={(e) => setRemarks(e.target.value)} /></div>
        </div>
        {error && <div className="alert bad gap">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Back</button>
          <button type="submit" className="btn primary" disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

interface ItemRow { key: number; description: string; amount: string }
let nextKey = 1;

/** Step 3: the SPPMP items of a PR, encoded when the papers come back from the office. */
export function SppmpDialog({ record, pr, onClose }: { record: FullRecord; pr: Pr; onClose(): void }) {
  const { m, applyRecord, toast } = useProc();
  const [items, setItems] = useState<ItemRow[]>(pr.items.length
    ? pr.items.map((i) => ({ key: nextKey++, description: i.description, amount: String(i.amount) }))
    : [{ key: nextKey++, description: '', amount: '' }]);
  const [justification, setJustification] = useState(pr.justification);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const total = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const change = (key: number, patch: Partial<ItemRow>) => setItems(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const filled = items.filter((i) => i.description.trim() || i.amount);
    const bad = filled.findIndex((i) => !i.description.trim() || !(Number(i.amount) > 0));
    if (!filled.length) { setError('Add at least one SPPMP item.'); return; }
    if (bad >= 0) { setError(`SPPMP item ${bad + 1}: description and amount are both required.`); return; }
    setBusy(true); setError('');
    try {
      const res = await unwrap(api.PUT('/api/procurement/prs/{prId}/sppmp', {
        params: { path: { prId: pr.id }, query: { year: m.year } },
        body: { justification, items: filled.map((i) => ({ description: i.description, amount: Number(i.amount) })) },
      }));
      applyRecord(res.record, res.budgets);
      toast('SPPMP saved');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={'SPPMP — PR ' + (pr.dtsNo || pr.code)} onClose={onClose} wide>
      <form onSubmit={submit}>
        <p className="muted small">{pr.title} · {record.office} · PR amount ₱{money(pr.amount)}</p>
        <div className="card flush"><table className="items">
          <thead><tr><th>Activity / Item / Description *</th><th className="num">Amount *</th><th /></tr></thead>
          <tbody>
            {items.map((i, n) => (
              <tr key={i.key}>
                <td><input value={i.description} maxLength={1000} placeholder="e.g. Meals for 40 participants" aria-label={'Item ' + (n + 1)}
                  autoFocus={n === items.length - 1 && !i.description} onChange={(e) => change(i.key, { description: e.target.value })} /></td>
                <td className="num"><input type="number" min="0" step="0.01" value={i.amount} aria-label={'Amount ' + (n + 1)} onChange={(e) => change(i.key, { amount: e.target.value })} /></td>
                <td className="actions"><button type="button" className="btn small" title="Remove item" onClick={() => setItems(items.filter((x) => x.key !== i.key))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <div className="row spread gap">
          <button type="button" className="btn small" onClick={() => setItems([...items, { key: nextKey++, description: '', amount: '' }])}>+ Add item</button>
          <span>SPPMP total: <b>{money(total)}</b> {total > 0 && Math.abs(total - pr.amount) > 0.005 && <span className="small muted">(PR amount: {money(pr.amount)})</span>}</span>
        </div>
        <label className="f" htmlFor="spJust">Justification re SPPMP</label>
        <textarea id="spJust" value={justification} maxLength={2000} placeholder="Bakit SPPMP (hindi kasama sa PPMP)?" onChange={(e) => setJustification(e.target.value)} />
        {error && <div className="alert bad gap">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Back</button>
          <button type="submit" className="btn primary" disabled={busy}>Save SPPMP</button>
        </div>
      </form>
    </Modal>
  );
}

/** The budget of an office for the selected year; removing it keeps the PRs. */
export function BudgetDialog({ officeId, onClose }: { officeId: number; onClose(): void }) {
  const { m, applyBudgets, toast } = useProc();
  const b = m.budgetOf.get(officeId);
  const office = m.officeById.get(officeId)?.name ?? b?.office ?? '';
  const [amount, setAmount] = useState(b?.budget != null ? String(b.budget) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(value: number | undefined) {
    setBusy(true); setError('');
    try {
      applyBudgets(await unwrap(api.PUT('/api/procurement/budgets', { body: { year: m.year, officeId, amount: value } })));
      toast('Budget of ' + office + ' saved');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (amount === '' || !(Number(amount) >= 0)) { setError('Enter the budget amount.'); return; }
    void save(Number(amount));
  }

  return (
    <Modal title={'Budget — ' + office + ' ' + m.year} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="f" htmlFor="bmAmount">Budget ng buong office *</label>
        <input id="bmAmount" type="number" min="0" step="0.01" value={amount} autoFocus onChange={(e) => setAmount(e.target.value)} />
        <p className="muted small">{b && b.prs ? `Nagamit na (PR ${m.year}): ₱${money(b.used)} sa ${b.prs} PR.` : `Wala pang PR ngayong ${m.year}.`}</p>
        {error && <div className="alert bad">{error}</div>}
        <div className="modal-actions">
          {b?.budget != null && <button type="button" className="btn push-left" disabled={busy}
            onClick={() => { if (confirm(`Tanggalin ang budget ng ${office} ${m.year}?`)) void save(undefined); }}>Remove budget</button>}
          <button type="button" className="btn" onClick={onClose}>Back</button>
          <button type="submit" className="btn primary" disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
