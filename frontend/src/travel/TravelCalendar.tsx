import { useEffect, useRef, useState } from 'react';
import { OfficeFilter, OrderLink, PersonLink } from './bits';
import { useTravel } from './context';
import { fmt, isoOf, range, toDate, type Trip } from './model';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Who is on travel each day of a month. A name in red has two travels that day. */
export function TravelCalendar() {
  const { m, calMonth, setCalMonth, reload } = useTravel();
  const [office, setOffice] = useState('');
  const [day, setDay] = useState('');
  const detail = useRef<HTMLDivElement>(null);
  useEffect(() => setDay(''), [calMonth, office]);
  useEffect(() => { if (day) detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [day]);

  /** Moving into another year loads that year's data. */
  function goTo(month: string) {
    if (!month) return;
    setCalMonth(month);
    const y = Number(month.slice(0, 4));
    if (y !== m.year) void reload(y);
  }
  function shift(n: number) {
    const d = toDate(calMonth + '-01');
    d.setMonth(d.getMonth() + n);
    goTo(isoOf(d).slice(0, 7));
  }

  const first = toDate(calMonth + '-01');
  const gridStart = new Date(first);
  gridStart.setDate(1 - first.getDay());
  const mine = (t: Trip) => !office || m.personById.get(t.pid)?.office === office || m.orderById.get(t.to)?.office === office;
  const pool = m.trips.filter(mine);
  const name = (pid: number) => m.personById.get(pid)?.name ?? '#' + pid;

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    if (i === 35 && d.getMonth() !== first.getMonth()) break; // a sixth week only when the month needs it
    const iso = isoOf(d);
    const count = new Map<number, number>();
    pool.forEach((t) => { if (t.start <= iso && t.end >= iso) count.set(t.pid, (count.get(t.pid) ?? 0) + 1); });
    const pids = [...count.keys()].sort((a, b) => Number(count.get(b)! > 1) - Number(count.get(a)! > 1) || name(a).localeCompare(name(b)));
    const bad = pids.some((pid) => count.get(pid)! > 1);
    cells.push(
      <button type="button" key={iso} onClick={() => setDay(iso)}
        className={'day' + (d.getMonth() !== first.getMonth() ? ' out' : '') + (iso === m.today ? ' today' : '') + (bad ? ' bad-day' : '') + (iso === day ? ' sel' : '')}>
        <span><span className="num">{d.getDate()}</span>{pids.length > 0 && <span className="cnt">{pids.length}</span>}</span>
        {pids.slice(0, 4).map((pid) => <span key={pid} className={'who' + (count.get(pid)! > 1 ? ' bad' : '')}>{name(pid)}</span>)}
        {pids.length > 4 && <span className="more">+{pids.length - 4} more</span>}
      </button>,
    );
  }

  const on = day ? pool.filter((t) => t.start <= day && t.end >= day).sort((a, b) => name(a.pid).localeCompare(name(b.pid))) : [];
  const perPerson = new Map<number, number>();
  on.forEach((t) => perPerson.set(t.pid, (perPerson.get(t.pid) ?? 0) + 1));

  return (
    <>
      <div className="row toolbar">
        <button className="btn" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
        <input type="month" aria-label="Month" value={calMonth} onChange={(e) => goTo(e.target.value)} />
        <button className="btn" aria-label="Next month" onClick={() => shift(1)}>›</button>
        <OfficeFilter value={office} onChange={setOffice} />
        <span className="muted small">Red names = overlapping travel that day</span>
      </div>
      <div className="cal">
        {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
        {cells}
      </div>
      <div ref={detail} className="cal-detail">
        {day && <>
          <div className="row head">
            <h3>On travel — {fmt(day)} ({perPerson.size} person/s)</h3>
            <button className="btn small" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑ Back to calendar</button>
          </div>
          <div className="card flush"><table className="stack">
            <thead><tr><th>Name</th><th>Office</th><th>Destination</th><th>Dates</th><th>TO</th></tr></thead>
            <tbody>
              {on.length === 0 && <tr><td colSpan={5} className="muted">Nobody on travel.</td></tr>}
              {on.map((t) => {
                const p = m.personById.get(t.pid), o = m.orderById.get(t.to)!;
                return (
                  <tr key={t.pid + '-' + t.to} className={perPerson.get(t.pid)! > 1 ? 'conflict' : ''}>
                    <td><PersonLink person={p} bold={false} /></td><td>{p?.office}</td><td>{o.destination}</td>
                    <td>{range(o.startDate, o.endDate)}</td><td><OrderLink id={o.id} code={o.code} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </>}
      </div>
    </>
  );
}
