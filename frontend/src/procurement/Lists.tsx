import { useEffect, useMemo, useState } from 'react';
import { DocPills, EarlyPill, RecLink, RepeatPill, TypeTag } from './bits';
import { useProc, type ListFilter } from './context';
import {
  activePrs, clusters, fmt, hasIncomplete, hasReview, isRepeat, money, PROC_LABEL, PROC_TYPES, prMissing, prState, whenWhere,
  type FullRecord, type Pr, type Rec,
} from './model';

function OfficeSelect({ value, onChange }: { value: number | null; onChange(id: number | null): void }) {
  const { m } = useProc();
  return (
    <select value={value ?? ''} aria-label="Office" onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">All offices</option>
      {m.data.offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

/** "DTS … · PR DTS …" line of a record ("—" when there is no DTS yet). */
function DtsLine({ r }: { r: FullRecord }) {
  const prDts = activePrs(r).map((p) => p.dtsNo).filter(Boolean);
  return <div className="small muted">DTS {r.dtsNo || '—'}{prDts.length > 0 && ' · PR DTS ' + prDts.join(', ')}</div>;
}

export function Dashboard() {
  const { m, showList, setTab, reload } = useProc();
  // early procurements already received for next year are in next year's list
  const nextYear = m.year + 1;
  const early = m.year === Number(m.today.slice(0, 4)) ? m.all.filter((r) => r.fiscalYear === nextYear && r.status !== 'CANCELLED').length : 0;
  const recs = m.records, active = recs.filter((r) => r.status !== 'CANCELLED');
  const review = active.filter(hasReview);
  const inc: { p: Pr; r: FullRecord }[] = [];
  active.forEach((r) => activePrs(r).forEach((p) => { if (prState(p, r) !== 'Complete') inc.push({ p, r }); }));
  inc.sort((a, b) => (b.p.dateReceived ?? '').localeCompare(a.p.dateReceived ?? ''));
  const latest = [...review].sort((a, b) => (b.dateReceived ?? '').localeCompare(a.dateReceived ?? '') || b.code.localeCompare(a.code)).slice(0, 12);
  const over = m.data.budgets.filter((b) => b.budget != null && b.used > b.budget).length;

  const stat = (n: number, label: string, onClick: () => void, cls = '') => (
    <button type="button" className={'stat ' + cls} onClick={onClick}><b>{n}</b><span>{label}</span></button>
  );
  return (
    <>
      <div className="stats">
        {stat(active.length, 'Procurements ' + m.year, () => showList({}))}
        {stat(review.length, 'For review FPED', () => showList({ doc: 'review' }), 'amber')}
        {stat(inc.length, 'PR incomplete / returned', () => showList({ doc: 'incomplete' }), 'red')}
        {stat(active.filter((r) => !activePrs(r).length).length, 'No PR yet', () => showList({ doc: 'noPR' }))}
        {stat(over, 'Offices over budget', () => setTab('budget'), 'red')}
        {stat(recs.length - active.length, 'Cancelled', () => showList({ status: 'CANCELLED' }))}
      </div>
      {early > 0 && <div className="alert info">May <b>{early}</b> early procurement para sa {nextYear}. Nasa listahan at budget ng {nextYear} ang mga ito.{' '}
        <button type="button" className="link" onClick={() => void reload(nextYear)}>Tingnan ang {nextYear}</button></div>}
      <div className="two">
        <div>
          <h3>PR – incomplete / return to office</h3>
          <div className="card flush"><table className="stack"><tbody>
            {inc.length === 0 && <tr><td className="muted">None</td></tr>}
            {inc.slice(0, 15).map(({ p, r }) => (
              <tr key={p.id}>
                <td><RecLink id={r.id} code={r.code} /><div className="small muted">{r.office}</div><div className="small muted">DTS {r.dtsNo || '—'}</div></td>
                <td><b>{p.code}</b> · {p.title}
                  <div className="small">PR DTS: {p.dtsNo ? <b>{p.dtsNo}</b> : <span className="muted">—</span>}</div>
                  <div className="small red">Kulang: {prMissing(p, r.procType).join(', ')}</div>
                  {prState(p, r) === 'Returned' && <span className="pill bad">Returned to office</span>}</td>
              </tr>
            ))}
          </tbody></table></div>
        </div>
        <div>
          <h3>For review FPED (latest)</h3>
          <div className="card flush"><table className="stack"><tbody>
            {latest.length === 0 && <tr><td className="muted">None</td></tr>}
            {latest.map((r) => (
              <tr key={r.id}>
                <td><RecLink id={r.id} code={r.code} /><div className="small muted">{fmt(r.dateReceived)}</div><EarlyPill r={r} /></td>
                <td>{r.office}</td>
                <td>{r.title}<TypeTag type={r.procType} /> <RepeatPill r={r} /><DtsLine r={r} /></td>
                <td><DocPills r={m.recById.get(r.id)!} /></td>
              </tr>
            ))}
          </tbody></table></div>
        </div>
      </div>
    </>
  );
}

function matchesDoc(r: FullRecord, doc: string): boolean {
  switch (doc) {
    case 'review': return hasReview(r);
    case 'noPR': return !activePrs(r).length;
    case 'withPR': return activePrs(r).length > 0;
    case 'incomplete': return hasIncomplete(r);
    case 'sppmp': return activePrs(r).some((p) => p.plan === 'SPPMP');
    case 'nongov': return activePrs(r).some((p) => p.facility === 'NON_GOVERNMENT');
    case 'cancelledPR': return r.prs.some((p) => p.status === 'CANCELLED');
    default: return true;
  }
}

const PAGE = 200;

export function RecordList() {
  const { m, canEdit, filter, setFilter, viewRecord, openPr, askStatus } = useProc();
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [filter]);
  const q = filter.q.trim().toUpperCase();
  const rows = m.records.filter((r) => (filter.officeId == null || r.officeId === filter.officeId) && (!filter.kind || r.procType === filter.kind)
    && matchesDoc(r, filter.doc) && (!filter.status || r.status === filter.status) && (!filter.rep || isRepeat(r))
    && (!q || [r.code, r.title, r.details, r.office, r.preparedBy, r.dtsNo, r.logbookNo, r.venue, ...r.prs.map((p) => [p.code, p.dtsNo, p.title, p.requisitioner].join(' '))]
      .join(' ').toUpperCase().includes(q)))
    .sort((a, b) => (b.dateReceived ?? '').localeCompare(a.dateReceived ?? '') || b.code.localeCompare(a.code));

  return (
    <>
      <div className="row toolbar">
        <input type="search" className="grow" placeholder="Search title, office, DTS (proposal or PR), G#, ID…" value={filter.q} onChange={(e) => setFilter({ q: e.target.value })} />
        <OfficeSelect value={filter.officeId} onChange={(officeId) => setFilter({ officeId })} />
        <select value={filter.kind} aria-label="Kind" onChange={(e) => setFilter({ kind: e.target.value })}>
          <option value="">All kinds</option>
          {PROC_TYPES.map((t) => <option key={t} value={t}>{PROC_LABEL[t]}</option>)}
        </select>
        <select value={filter.doc} aria-label="Documents" onChange={(e) => setFilter({ doc: e.target.value })}>
          <option value="">All</option>
          <option value="review">Has a document for review FPED</option>
          <option value="noPR">No PR yet</option>
          <option value="withPR">With PR</option>
          <option value="incomplete">PR incomplete / returned</option>
          <option value="sppmp">PR with SPPMP</option>
          <option value="nongov">Non-Government facility</option>
          <option value="cancelledPR">Has a cancelled PR</option>
        </select>
        <select value={filter.status} aria-label="Status" onChange={(e) => setFilter({ status: e.target.value as ListFilter['status'] })}>
          <option value="ACTIVE">Not cancelled</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="">All</option>
        </select>
        <label className="chk flat"><input type="checkbox" checked={filter.rep} onChange={(e) => setFilter({ rep: e.target.checked })} />Repeats only</label>
        <span className="muted small">{rows.length} record(s) in {m.year}</span>
      </div>
      <div className="card flush"><table className="stack">
        <thead><tr><th>ID / Received</th><th>Office</th><th>Title</th><th>Documents</th><th className="num">Amount</th><th>DTS / G#</th><th /></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} className="muted">No records found.</td></tr>}
          {rows.slice(0, limit).map((r) => {
            const rec = m.recById.get(r.id)!;
            const pr = activePrs(r).reduce((s, p) => s + p.amount, 0);
            return (
              <tr key={r.id} className={r.status === 'CANCELLED' ? 'cancelled' : ''}>
                <td className="nowrap"><RecLink id={r.id} code={r.code} /><div className="small muted">{fmt(r.dateReceived)}</div><EarlyPill r={r} /></td>
                <td>{r.office}<div className="small muted">{r.preparedBy}</div></td>
                <td><span className="ttl">{r.title}</span><TypeTag type={r.procType} />
                  {whenWhere(rec) && <div className="small muted">{whenWhere(rec)}</div>}
                  <div>{r.status === 'CANCELLED' && <span className="pill gone">Cancelled</span>}<RepeatPill r={r} /></div></td>
                <td><DocPills r={rec} /></td>
                <td className="num">{r.amount ? money(r.amount) : ''}{pr > 0 && <div className="small muted">PR {money(pr)}</div>}</td>
                <td className="small">{r.dtsNo}
                  {r.prs.some((p) => p.dtsNo) && <div>PR: {r.prs.filter((p) => p.dtsNo).map((p, i) => <span key={p.id}>{i > 0 && ', '}{p.status === 'CANCELLED' ? <s>{p.dtsNo}</s> : p.dtsNo}</span>)}</div>}
                  {r.logbookNo && <div className="muted">{r.logbookNo}</div>}</td>
                <td className="actions">
                  <button className="btn small" onClick={() => viewRecord(r.id)}>View</button>{' '}
                  {canEdit && (r.status === 'CANCELLED'
                    ? <button className="btn small" onClick={() => askStatus({ kind: 'record', record: r, cancel: false })}>Restore</button>
                    : <button className="btn small" onClick={() => openPr(r.id)}>+ PR</button>)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      {rows.length > limit && <div className="row pager"><button className="btn" onClick={() => setLimit(limit + PAGE)}>Show more</button></div>}
    </>
  );
}

/** Budget per office for the selected year; the PRs received that year are deducted. */
export function BudgetTab() {
  const { m, canEdit, openBudget, showList } = useProc();
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const text = q.trim().toUpperCase();
  const ids = new Set([...m.data.offices.filter((o) => o.active).map((o) => o.id), ...m.data.budgets.map((b) => b.officeId)]);
  const rows = [...ids].map((id) => m.budgetOf.get(id) ?? { officeId: id, office: m.officeById.get(id)?.name ?? '', budget: null, used: 0, prs: 0 })
    .filter((b) => (all || b.budget != null || b.prs > 0) && (!text || b.office.toUpperCase().includes(text)))
    .sort((a, b) => Number(b.budget != null) - Number(a.budget != null) || a.office.localeCompare(b.office));
  const totalBudget = rows.reduce((s, b) => s + (b.budget ?? 0), 0), totalUsed = rows.reduce((s, b) => s + b.used, 0);

  return (
    <>
      <div className="row toolbar">
        <h3 className="first inline">Budget {m.year}</h3>
        <input type="search" placeholder="Search office…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="chk flat"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />Show offices without budget</label>
      </div>
      <p className="muted small first">Kusang ibinabawas ang amount ng bawat PR na natanggap sa taong ito. Hindi kasama ang cancelled na PR (o PR ng cancelled na procurement).
        I-click ang office para makita ang mga PR nito.</p>
      <div className="card flush"><table className="stack">
        <thead><tr><th>Office</th><th className="num">Budget</th><th className="num">Used (PRs)</th><th className="num">Remaining</th><th>% used</th><th className="num">PRs</th><th /></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} className="muted">Wala pang budget. I-check ang "Show offices without budget" para maglagay.</td></tr>}
          {rows.map((b) => {
            const has = b.budget != null, left = has ? b.budget! - b.used : 0;
            const pct = has && b.budget! > 0 ? (b.used / b.budget!) * 100 : has && b.used ? 999 : 0;
            return (
              <tr key={b.officeId} className={has && left < 0 ? 'over' : ''}>
                <td><button type="button" className="link" onClick={() => showList({ officeId: b.officeId, doc: 'withPR' })}><b>{b.office}</b></button></td>
                <td className="num">{has ? money(b.budget) : <span className="muted">not set</span>}</td>
                <td className="num">{money(b.used)}</td>
                <td className="num">{has && <b className={left < 0 ? 'red' : ''}>{money(left)}</b>}</td>
                <td>{has && <><div className="bar"><i className={pct > 100 ? 'over' : pct > 85 ? 'warn' : ''} style={{ width: Math.min(pct, 100) + '%' }} /></div>
                  <span className="small muted">{pct >= 999 ? 'no budget' : Math.round(pct) + '%'}</span></>}</td>
                <td className="num">{b.prs}</td>
                <td className="actions">{canEdit && <button className="btn small" onClick={() => openBudget(b.officeId)}>{has ? 'Edit' : 'Set budget'}</button>}</td>
              </tr>
            );
          })}
          {rows.length > 0 && <tr className="total"><td>Total</td><td className="num">{money(totalBudget)}</td><td className="num">{money(totalUsed)}</td>
            <td className="num">{money(totalBudget - totalUsed)}</td><td /><td /><td /></tr>}
        </tbody>
      </table></div>
    </>
  );
}

/** Look-alike activities, grouped (all years); groups with a record in the selected year. */
export function RepeatsTab() {
  const { m } = useProc();
  const [q, setQ] = useState('');
  const [officeId, setOfficeId] = useState<number | null>(null);
  const [cross, setCross] = useState(false);
  const groups = useMemo(() => clusters(m, cross), [m, cross]);
  const text = q.trim().toUpperCase();
  const shown = groups.filter((g) => g.some((r) => r.fiscalYear === m.year) && (officeId == null || g.some((r) => r.officeId === officeId))
    && (!text || g.some((r) => (m.textsOf.get(r.id) ?? []).join(' ').toUpperCase().includes(text))))
    .sort((a, b) => b.length - a.length);

  return (
    <>
      <div className="row toolbar">
        <input type="search" className="grow" placeholder="Search title…" value={q} onChange={(e) => setQ(e.target.value)} />
        <OfficeSelect value={officeId} onChange={setOfficeId} />
        <label className="chk flat"><input type="checkbox" checked={cross} onChange={(e) => setCross(e.target.checked)} />Include other offices</label>
        <span className="muted small">{shown.length} group(s)</span>
      </div>
      <p className="muted small first">Mga activity na kahawig ng isa't isa (lahat ng taon), naka-grupo. Kasama ang may record sa taong napili sa itaas.</p>
      {shown.length === 0 && <p className="muted">Walang kahawig na records.</p>}
      {shown.slice(0, 150).map((g) => <Cluster key={g[0]!.id} g={g} />)}
    </>
  );
}

function Cluster({ g }: { g: Rec[] }) {
  const latest = g[g.length - 1]!;
  const offices = [...new Set(g.map((r) => r.office))];
  const cancelled = g.filter((r) => r.status === 'CANCELLED').length;
  return (
    <div className="card flush cluster">
      <h4>{latest.title} <span className="pill rep">{g.length} records</span>{cancelled > 0 && <span className="pill gone">{cancelled} cancelled</span>}
        <span className="small muted"> {offices.join(', ')}</span></h4>
      <table className="stack"><tbody>
        {g.map((r) => (
          <tr key={r.id} className={r.status === 'CANCELLED' ? 'cancelled' : ''}>
            <td className="nowrap"><RecLink id={r.id} code={r.code} /><div className="small muted">{fmt(r.dateReceived)}</div><EarlyPill r={r} /></td>
            <td>{r.office}</td>
            <td><span className="ttl">{r.title}</span><TypeTag type={r.procType} />{whenWhere(r) && <div className="small muted">{whenWhere(r)}</div>}
              <div>{r.status === 'CANCELLED' && <span className="pill gone">Cancelled</span>}<RepeatPill r={r} /></div></td>
            <td><DocPills r={r} /></td>
          </tr>
        ))}
      </tbody></table>
    </div>
  );
}
