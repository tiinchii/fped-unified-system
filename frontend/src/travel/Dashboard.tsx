import { OrderLink, PersonLink } from './bits';
import { useTravel } from './context';
import { addDays, askedDocs, inWindow, missingDocs, range, type Order } from './model';

function ToNo({ order }: { order: Order }) {
  return order.toNo ? <span className="small muted"> · TO / Page # {order.toNo}</span> : null;
}

export function Dashboard() {
  const { m, showList } = useTravel();
  const today = m.today, week = addDays(today, 7);
  const current = inWindow(m, today, week); // false when an old year is selected
  const active = m.data.orders.filter((o) => o.status === 'ACTIVE' && o.startDate <= m.yearEnd && o.endDate >= m.yearStart);
  const nowTrips = current ? m.trips.filter((t) => t.start <= today && t.end >= today) : [];
  const weekPeople = new Set(m.trips.filter((t) => t.start <= week && t.end >= today).map((t) => t.pid));
  const name = (pid: number) => m.personById.get(pid)?.name ?? '';
  nowTrips.sort((a, b) => name(a.pid).localeCompare(name(b.pid)));

  const incomplete = m.data.orders.filter((o) => o.status === 'ACTIVE' && o.endDate >= m.today && missingDocs(m, o).length > 0).length;

  return (
    <>
      <div className="stats">
        <div className="stat"><b>{active.length}</b><span>Active travel orders {m.year}</span></div>
        <div className="stat"><b>{current ? new Set(nowTrips.map((t) => t.pid)).size : '—'}</b><span>On travel today</span></div>
        <div className="stat"><b>{current ? weekPeople.size : '—'}</b><span>Travelling next 7 days</span></div>
        <div className="stat red"><b>{m.conflictPairs.length}</b><span>Overlapping travels</span></div>
        {askedDocs(m).length > 0 && <button type="button" className={'stat' + (incomplete ? ' amber' : '')} onClick={() => showList({ onlyMissing: true, status: 'notcancelled' })}>
          <b>{incomplete}</b><span>Kulang ang checklist (hindi pa tapos)</span></button>}
      </div>
      <div className="two">
        <div>
          <h3>On travel today</h3>
          <div className="card flush"><table className="stack"><tbody>
            {nowTrips.length === 0 && <tr><td className="muted">
              {current ? 'Nobody is on travel today.' : 'Select the current year to see who is on travel today.'}
            </td></tr>}
            {nowTrips.map((t) => {
              const o = m.orderById.get(t.to)!, p = m.personById.get(t.pid);
              return (
                <tr key={t.pid + '-' + t.to}>
                  <td><PersonLink person={p} /><div className="muted small">{p?.office}</div></td>
                  <td>{o.destination}<div className="muted small">{range(o.startDate, o.endDate)} · <OrderLink id={o.id} code={o.code} /><ToNo order={o} /></div></td>
                </tr>
              );
            })}
          </tbody></table></div>
        </div>
        <div>
          <h3>Overlapping travels (saved with reason)</h3>
          <div className="card flush"><table className="stack"><tbody>
            {m.conflictPairs.length === 0 && <tr><td className="muted">No overlapping travels.</td></tr>}
            {m.conflictPairs.map((c) => {
              const a = m.orderById.get(c.a.to)!, b = m.orderById.get(c.b.to)!;
              const reason = b.overlapReason || a.overlapReason;
              return (
                <tr key={c.pid + '-' + a.id + '-' + b.id} className="conflict">
                  <td><PersonLink person={m.personById.get(c.pid)} /></td>
                  <td>
                    <OrderLink id={a.id} code={a.code} /> {range(a.startDate, a.endDate)}<ToNo order={a} /><br />
                    <OrderLink id={b.id} code={b.code} /> {range(b.startDate, b.endDate)}<ToNo order={b} />
                    {reason && <div className="small muted">Reason: {reason}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody></table></div>
        </div>
      </div>
    </>
  );
}
