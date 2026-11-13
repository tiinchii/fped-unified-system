import { useEffect, useState } from 'react';
import { EmpTag, OfficeFilter, OrderLink, PersonLink, StatusPill } from './bits';
import { useTravel, type ListFilter } from './context';
import { askedDocs, days, fmt, isoOf, norm, originalDates, originalPlace, range, statusOf, toDate, travelerNames, missingDocs, type Order, type Person } from './model';

const PAGE = 200;

export function OrderList() {
  const { m, canEdit, filter, setFilter, openOrder, showList, askCancel, askRestore, askReschedule, askChecklist } = useTravel();
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [filter]);

  const q = norm(filter.q);
  let from = m.yearStart, to = m.yearEnd;
  if (filter.month) {
    from = filter.month + '-01';
    const d = toDate(from);
    to = isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }
  const list = m.data.orders.filter((o) => {
    if (!(o.startDate <= to && o.endDate >= from)) return false;
    if (filter.status === 'notcancelled' ? o.status === 'CANCELLED' : filter.status && statusOf(o, m.today) !== filter.status) return false;
    if (filter.office && o.office !== filter.office) return false;
    if (filter.onlyConf && !m.conflictTos.has(o.id)) return false;
    if (filter.onlyMissing && (o.status !== 'ACTIVE' || !missingDocs(m, o).length)) return false;
    if (q) {
      const hay = norm([o.code, o.destination, o.purpose, o.dtsNo, o.toNo, o.office, travelerNames(m, o).join(' ')].join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => b.startDate.localeCompare(a.startDate) || b.code.localeCompare(a.code));

  return (
    <>
      <div className="row toolbar">
        <input type="search" className="grow" placeholder="Search name, destination, DTS, TO ID…" value={filter.q} onChange={(e) => setFilter({ q: e.target.value })} />
        <OfficeFilter value={filter.office} onChange={(office) => setFilter({ office })} />
        <input type="month" title="Month of travel" aria-label="Month of travel" value={filter.month} min={m.year + '-01'} max={m.year + '-12'}
          onChange={(e) => setFilter({ month: e.target.value })} />
        <select value={filter.status} aria-label="Status" onChange={(e) => setFilter({ status: e.target.value as ListFilter['status'] })}>
          <option value="notcancelled">All except cancelled</option>
          <option value="Upcoming">Upcoming</option>
          <option value="Ongoing">On travel now</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
          <option value="">All status</option>
        </select>
        <label className="chk flat"><input type="checkbox" checked={filter.onlyConf} onChange={(e) => setFilter({ onlyConf: e.target.checked })} />Overlaps only</label>
        {askedDocs(m).length > 0 && <label className="chk flat"><input type="checkbox" checked={filter.onlyMissing} onChange={(e) => setFilter({ onlyMissing: e.target.checked })} />Kulang ang checklist</label>}
        <span className="muted small">{list.length} travel order(s) in {filter.month || m.year}</span>
      </div>

      <DtsGroups q={q} />

      <div className="card flush"><table className="stack">
        <thead><tr><th>TO ID</th><th>Travel dates</th><th>Travelers</th><th>Office</th><th>Destination</th><th>DTS / TO / Page #</th><th>Status</th><th /></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={8} className="muted">No travel orders found.</td></tr>}
          {list.slice(0, limit).map((o) => {
            const names = travelerNames(m, o), orig = originalDates(o), origPlace = originalPlace(o);
            const overlap = m.conflictTos.has(o.id) && o.status === 'ACTIVE';
            return (
              <tr key={o.id} className={o.status === 'CANCELLED' ? 'cancelled' : overlap ? 'conflict' : ''}>
                <td><b>{o.code}</b><div className="muted small">Received {fmt(o.dateFiled)}</div></td>
                <td className="nowrap"><b>{range(o.startDate, o.endDate)}</b><div className="muted small">{days(o.startDate, o.endDate)} day(s)</div>
                  {orig && <div className="small muted">was <s>{range(orig.start, orig.end)}</s></div>}</td>
                <td>{names.slice(0, 4).map((n, i) => <div key={i}>{n}</div>)}{names.length > 4 && <div className="muted small">+{names.length - 4} more</div>}</td>
                <td>{o.office}</td>
                <td>{o.destination}{origPlace && <div className="small muted">was <s>{origPlace}</s></div>}
                  <div className="muted small" title={o.purpose}>{o.purpose.length > 90 ? o.purpose.slice(0, 90) + '…' : o.purpose}</div></td>
                <td className="small">
                  {o.dtsNo && <button type="button" className="link" title="Show everyone on this DTS" onClick={() => showList({ q: o.dtsNo })}>{o.dtsNo}</button>}
                  {o.toNo && <div>{o.toNo}</div>}
                </td>
                <td><StatusPill order={o} />
                  {orig && <div><span className="pill warn">Rescheduled</span></div>}
                  {origPlace && <div><span className="pill warn">Place changed</span></div>}
                  {overlap && <div><span className="pill bad">Overlap</span></div>}
                  {o.status === 'ACTIVE' && askedDocs(m).length > 0 && (missingDocs(m, o).length
                    ? <div><span className="pill warn" title={'Kulang: ' + missingDocs(m, o).map((d) => d.name).join(', ')}>Kulang: {missingDocs(m, o).length} doc</span></div>
                    : <div><span className="pill ok">Checklist ✔</span></div>)}</td>
                <td className="actions">
                  {canEdit && o.status === 'ACTIVE' && <>
                    <button className="btn small" onClick={() => openOrder(o.id)}>Edit</button>{' '}
                    <button className="btn small" onClick={() => askReschedule(o)}>Change date / place</button>{' '}
                    {askedDocs(m).length > 0 && <><button className="btn small" onClick={() => askChecklist(o)}>Checklist</button>{' '}</>}
                    <button className="btn small" onClick={() => askCancel(o)}>Cancel</button>
                  </>}
                  {canEdit && o.status === 'CANCELLED' && <button className="btn small" onClick={() => askRestore(o)}>Restore</button>}
                  {o.status === 'CANCELLED' && o.remarks && <div className="small muted remark">{o.remarks}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      {list.length > limit && <div className="row pager"><button className="btn" onClick={() => setLimit(limit + PAGE)}>Show more</button></div>}
    </>
  );
}

/**
 * When the search matches a DTS number, everyone on that DTS is listed together: all travel orders with that
 * DTS in the loaded year, whatever the other filters are.
 */
function DtsGroups({ q }: { q: string }) {
  const { m } = useTravel();
  // DTS numbers have digits; this keeps a name search from showing DTS groups
  if (q.replace(/\s/g, '').length < 3 || !/\d/.test(q)) return null;
  const groups = new Map<string, Order[]>();
  for (const o of m.data.orders) {
    const key = norm(o.dtsNo);
    if (!key || !key.includes(q)) continue;
    const g = groups.get(key);
    if (g) g.push(o); else groups.set(key, [o]);
  }
  const keys = [...groups.keys()].sort();
  if (!keys.length) return null;
  return (
    <>
      {keys.slice(0, 5).map((k) => {
        const orders = groups.get(k)!;
        const rows: { o: Order; p: Person | undefined; pid: number }[] = [];
        orders.forEach((o) => o.travelerIds.forEach((pid) => rows.push({ o, p: m.personById.get(pid), pid })));
        rows.sort((a, b) => a.o.startDate.localeCompare(b.o.startDate) || a.o.code.localeCompare(b.o.code) || (a.p?.name ?? '').localeCompare(b.p?.name ?? ''));
        const people = new Set(rows.filter((r) => r.o.status !== 'CANCELLED').map((r) => r.pid)).size;
        return (
          <div key={k} className="card dts-group">
            <h3>DTS {orders[0]!.dtsNo} — {people} person(s) together{orders.length > 1 && ' in ' + orders.length + ' travel orders'}</h3>
            <table className="stack">
              <thead><tr><th>Name</th><th>Office</th><th>Employment</th><th>TO ID</th><th>Dates</th><th>Destination</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.o.id + '-' + r.pid} className={r.o.status === 'CANCELLED' ? 'cancelled' : ''}>
                    <td><PersonLink person={r.p} /></td>
                    <td>{r.p?.office}</td>
                    <td>{r.p?.employment ? <EmpTag person={r.p} /> : <span className="muted">—</span>}</td>
                    <td><OrderLink id={r.o.id} code={r.o.code} /></td>
                    <td>{range(r.o.startDate, r.o.endDate)}</td>
                    <td>{r.o.destination}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {keys.length > 5 && <p className="muted small">{keys.length - 5} more DTS numbers match — type more of the number.</p>}
    </>
  );
}
