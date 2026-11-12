import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, unwrap } from '../api/client';
import { EmpTag, OfficeFilter, OrderLink, PersonLink, StatusPill } from './bits';
import { useTravel } from './context';
import { days, EMPLOYMENT_LABEL, EMPLOYMENTS, MON, monthsOfYear, norm, range, type Employment, type Person } from './model';

const MAX_ROWS = 500;

export function PeopleTab() {
  const { m, canEdit, personId, openPersonDialog } = useTravel();
  const [q, setQ] = useState('');
  const [office, setOffice] = useState('');
  const [emp, setEmp] = useState<Employment | 'none' | ''>('');
  const [inactive, setInactive] = useState(false);

  const nq = norm(q);
  const list = m.data.people.filter((p) => (inactive || p.active) && (!office || p.office === office)
    && (!emp || (emp === 'none' ? !p.employment : p.employment === emp))
    && (!nq || norm(p.name + ' ' + p.office + ' ' + p.code).includes(nq)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const conflictPids = new Set(m.conflictPairs.map((c) => c.pid));

  return (
    <>
      <div className="row toolbar">
        <input type="search" className="grow" placeholder="Search name or office…" value={q} onChange={(e) => setQ(e.target.value)} />
        <OfficeFilter value={office} onChange={setOffice} />
        <select value={emp} aria-label="Employment" onChange={(e) => setEmp(e.target.value as typeof emp)}>
          <option value="">COS &amp; Permanent</option>
          <option value="PERMANENT">Permanent</option>
          <option value="COS">COS</option>
          <option value="none">Not yet set</option>
        </select>
        <label className="chk flat"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} />Show inactive</label>
        {canEdit && <button className="btn primary" onClick={() => openPersonDialog({})}>+ Add person</button>}
        <span className="muted small">{list.length} person(s)</span>
      </div>

      {personId != null && <PersonDetail key={personId} id={personId} />}

      <div className="card flush"><table className="stack">
        <thead><tr><th>ID</th><th>Name</th><th>Office</th><th>Position</th><th>Employment</th><th>Travels</th><th>Next travel</th><th /></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={8} className="muted">Nobody found.</td></tr>}
          {list.slice(0, MAX_ROWS).map((p) => {
            const trips = m.tripsByPid.get(p.id) ?? [];
            const next = trips.filter((t) => t.end >= m.today).sort((a, b) => a.start.localeCompare(b.start))[0];
            return (
              <tr key={p.id} className={p.active ? '' : 'cancelled'}>
                <td className="small muted">{p.code}</td>
                <td><PersonLink person={p} />{conflictPids.has(p.id) && <> <span className="pill bad">Overlap</span></>}</td>
                <td>{p.office}</td>
                <td>{p.position}</td>
                <td><EmploymentCell person={p} /></td>
                <td>{trips.length}</td>
                <td>{next ? <>{range(next.start, next.end)}<div className="small muted">{m.orderById.get(next.to)?.destination}</div></> : <span className="muted">—</span>}</td>
                <td className="actions">{canEdit && <button className="btn small" onClick={() => openPersonDialog({ person: p })}>Edit</button>}</td>
              </tr>
            );
          })}
          {list.length > MAX_ROWS && <tr><td colSpan={8} className="muted">Showing first {MAX_ROWS} — use search to narrow down.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

/** Encoders get two buttons (one click sets Permanent or COS); viewers see the value only. */
function EmploymentCell({ person }: { person: Person }) {
  const { canEdit, applyPerson, toast } = useTravel();
  const [busy, setBusy] = useState(false);
  if (!canEdit) return person.employment ? <EmpTag person={person} /> : <span className="muted">—</span>;

  async function set(employment: Employment) {
    if (person.employment === employment) return;
    setBusy(true);
    try {
      const saved = await unwrap(api.PUT('/api/travel/personnel/{id}', {
        params: { path: { id: person.id } },
        body: { name: person.name, officeId: person.officeId ?? undefined, position: person.position, active: person.active, employment },
      }));
      applyPerson(saved);
      toast(saved.name + ' — ' + EMPLOYMENT_LABEL[employment]);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="seg">
      {EMPLOYMENTS.map((e) => (
        <button key={e} type="button" disabled={busy} className={person.employment === e ? 'on' : ''} aria-pressed={person.employment === e} onClick={() => void set(e)}>{EMPLOYMENT_LABEL[e]}</button>
      ))}
    </span>
  );
}

/** One person's travel orders in the selected year. */
function PersonDetail({ id }: { id: number }) {
  const { m, showPerson } = useTravel();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, []);
  const p = m.personById.get(id);
  if (!p) return null;
  const list = m.data.orders.filter((o) => o.travelerIds.includes(id) && o.startDate <= m.yearEnd && o.endDate >= m.yearStart)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const active = list.filter((o) => o.status === 'ACTIVE');
  const bad = new Set(m.conflictPairs.filter((c) => c.pid === id).flatMap((c) => [c.a.to, c.b.to]));
  const totalDays = active.reduce((sum, o) => sum + days(o.startDate, o.endDate), 0);
  const perMonth = monthsOfYear(m.year).map((mo, i) => ({ label: MON[i], n: active.filter((o) => o.startDate <= mo.end && o.endDate >= mo.start).length }))
    .filter((x) => x.n).map((x) => x.label + ' ' + x.n).join(' · ');

  return (
    <div className="card person-detail" ref={box}>
      <div className="row head">
        <div>
          <h2>{p.name}<EmpTag person={p} /></h2>
          <div className="muted">{[p.office, p.position, p.code].filter(Boolean).join(' · ')} · {active.length} travel(s), {totalDays} day(s) in {m.year}</div>
          {perMonth && <div className="small">Travel orders per month: {perMonth}</div>}
        </div>
        <button className="btn" onClick={() => showPerson(null)}>Close</button>
      </div>
      <table className="stack">
        <thead><tr><th>TO ID</th><th>Dates</th><th>Destination</th><th>Office</th><th>Status</th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={5} className="muted">No travel orders in {m.year}.</td></tr>}
          {list.map((o) => {
            const overlap = bad.has(o.id) && o.status === 'ACTIVE';
            return (
              <tr key={o.id} className={o.status === 'CANCELLED' ? 'cancelled' : overlap ? 'conflict' : ''}>
                <td><OrderLink id={o.id} code={o.code} /></td>
                <td><b>{range(o.startDate, o.endDate)}</b></td><td>{o.destination}</td><td>{o.office}</td>
                <td><StatusPill order={o} />{overlap && <span className="pill bad">Overlap</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
