import { useEffect, useState } from 'react';
import { EmpTag, OfficeFilter, PersonLink } from './bits';
import { useTravel } from './context';
import { days, MON, monthsOfYear, norm, type Employment, type Trip } from './model';

const PAGE = 300;

interface Tally { key: string; tos: Set<number>; pids: Set<number>; days: number; perMonth: Set<number>[] }

/** Days of the travel s–e that fall inside the period ps–pe. */
function clipDays(s: string, e: string, ps: string, pe: string): number {
  const a = s > ps ? s : ps, b = e < pe ? e : pe;
  return a <= b ? days(a, b) : 0;
}

/** Who and which office travelled the most, for the whole year or one month. Cancelled travel is not counted. */
export function Reports() {
  const { m, showList } = useTravel();
  const [period, setPeriod] = useState('');
  const [office, setOffice] = useState('');
  const [emp, setEmp] = useState<Employment | ''>('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [period, office, emp, q]);
  useEffect(() => setPeriod(''), [m.year]);

  const allMonths = monthsOfYear(m.year);
  const months = period ? allMonths.filter((mo) => mo.key === period) : allMonths;
  const ps = months[0]!.start, pe = months[months.length - 1]!.end;
  const label = period ? MON[Number(period.slice(5)) - 1] + ' ' + m.year : String(m.year);
  const nq = norm(q);

  const byPerson = new Map<string, Tally>(), byOffice = new Map<string, Tally>();
  const tally = (map: Map<string, Tally>, key: string, t: Trip) => {
    let r = map.get(key);
    if (!r) { r = { key, tos: new Set(), pids: new Set(), days: 0, perMonth: allMonths.map(() => new Set<number>()) }; map.set(key, r); }
    r.tos.add(t.to); r.pids.add(t.pid); r.days += clipDays(t.start, t.end, ps, pe);
    allMonths.forEach((mo, i) => { if (t.start <= mo.end && t.end >= mo.start) r.perMonth[i]!.add(t.to); });
  };
  for (const t of m.trips) {
    if (!(t.start <= pe && t.end >= ps)) continue;
    const p = m.personById.get(t.pid);
    const toOffice = m.orderById.get(t.to)?.office || '(no office)';
    if (emp && p?.employment !== emp) continue;
    if ((!office || p?.office === office) && (!nq || norm(p?.name).includes(nq))) tally(byPerson, String(t.pid), t);
    if (!office || toOffice === office) tally(byOffice, toOffice, t);
  }
  const sorted = (map: Map<string, Tally>, name: (r: Tally) => string) =>
    [...map.values()].sort((a, b) => b.tos.size - a.tos.size || b.days - a.days || name(a).localeCompare(name(b)));
  const people = sorted(byPerson, (r) => m.personById.get(Number(r.key))?.name ?? r.key);
  const offices = sorted(byOffice, (r) => r.key);
  const allTos = new Set<number>();
  people.forEach((r) => r.tos.forEach((id) => allTos.add(id)));

  // whole year: one column per month (one short line on phones); one month: totals only
  const monthHead = period ? null : <>{MON.map((mo) => <th key={mo} className="c rep-m">{mo}</th>)}<th className="rep-mtext">Per month</th></>;
  const monthCells = (r: Tally) => period ? null : <>
    {r.perMonth.map((s, i) => <td key={i} className={'c rep-m' + (s.size ? '' : ' zero')}>{s.size || '·'}</td>)}
    <td className="rep-mtext small">{r.perMonth.map((s, i) => s.size ? MON[i] + ' ' + s.size : '').filter(Boolean).join(' · ') || '—'}</td>
  </>;

  return (
    <>
      <div className="row toolbar">
        <select value={period} aria-label="Period" onChange={(e) => setPeriod(e.target.value)}>
          <option value="">Whole year {m.year}</option>
          {allMonths.map((mo, i) => <option key={mo.key} value={mo.key}>{MON[i]} {m.year}</option>)}
        </select>
        <OfficeFilter value={office} onChange={setOffice} />
        <select value={emp} aria-label="Employment" onChange={(e) => setEmp(e.target.value as Employment | '')}>
          <option value="">COS &amp; Permanent</option>
          <option value="PERMANENT">Permanent</option>
          <option value="COS">COS</option>
        </select>
        <input type="search" className="grow" placeholder="Search name…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="stats">
        <div className="stat"><b>{allTos.size}</b><span>Travel orders · {label}</span></div>
        <div className="stat"><b>{people.length}</b><span>Persons who travelled · {label}</span></div>
        <div className="stat"><b>{people.reduce((s, r) => s + r.days, 0)}</b><span>Person-days of travel · {label}</span></div>
        <div className="stat"><b title={offices[0] ? offices[0].tos.size + ' travel order(s)' : ''}>{offices[0]?.key ?? '—'}</b><span>Office with most travel orders</span></div>
      </div>

      <h3>Travel orders per person — {label} ({people.length})</h3>
      <div className="card flush"><table className="stack">
        <thead><tr><th>#</th><th>Name</th><th>Office</th><th>Employment</th>{monthHead}<th className="c">Total TO</th><th className="c">Days</th></tr></thead>
        <tbody>
          {people.length === 0 && <tr><td colSpan={20} className="muted">No travel in {label}.</td></tr>}
          {people.slice(0, limit).map((r, i) => {
            const p = m.personById.get(Number(r.key));
            return (
              <tr key={r.key}>
                <td className="muted small">{i + 1}</td><td><PersonLink person={p} /></td><td>{p?.office}</td>
                <td>{p?.employment ? <EmpTag person={p} /> : <span className="muted">—</span>}</td>
                {monthCells(r)}
                <td className="c"><b>{r.tos.size}</b></td><td className="c">{r.days}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      {people.length > limit && <div className="row pager"><button className="btn" onClick={() => setLimit(limit + PAGE)}>Show more</button></div>}

      <h3>Offices that travelled the most — {label}</h3>
      <div className="card flush"><table className="stack">
        <thead><tr><th>#</th><th>Office</th>{monthHead}<th className="c">Total TO</th><th className="c">Persons</th><th className="c">Person-days</th></tr></thead>
        <tbody>
          {offices.length === 0 && <tr><td colSpan={20} className="muted">No travel in {label}.</td></tr>}
          {offices.map((r, i) => (
            <tr key={r.key}>
              <td className="muted small">{i + 1}</td>
              <td><button type="button" className="link" title="Show these travel orders" onClick={() => showList({ office: r.key, month: period, status: 'notcancelled' })}><b>{r.key}</b></button></td>
              {monthCells(r)}
              <td className="c"><b>{r.tos.size}</b></td><td className="c">{r.pids.size}</td><td className="c">{r.days}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="muted small">Cancelled travel orders are not counted. A travel that crosses into the next month is counted in both months.
        The office of a person is the office in Personnel; the office of a travel order is the office written on the TO.</p>
    </>
  );
}
