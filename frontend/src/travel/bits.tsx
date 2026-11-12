import { formatDateTime } from '../format';
import { useTravel } from './context';
import { EMPLOYMENT_LABEL, range, statusOf, STATUS_LABEL, type Conflict, type Model, type Order, type Person, type Trip } from './model';

const STATUS_CLASS = { Upcoming: 'info', Ongoing: 'ok', Completed: '', Cancelled: 'gone' } as const;

export function StatusPill({ order }: { order: Order }) {
  const { m } = useTravel();
  const s = statusOf(order, m.today);
  return <span className={'pill ' + STATUS_CLASS[s]}>{STATUS_LABEL[s]}</span>;
}

export function EmpTag({ person }: { person: Person | undefined }) {
  return person?.employment ? <span className={'tag ' + person.employment}>{EMPLOYMENT_LABEL[person.employment]}</span> : null;
}

/** A TO ID that opens the travel order. */
export function OrderLink({ id, code }: { id: number; code: string }) {
  const { openOrder } = useTravel();
  return <button type="button" className="link" onClick={() => openOrder(id)}>{code}</button>;
}

export function PersonLink({ person, bold = true }: { person: Person | undefined; bold?: boolean }) {
  const { showPerson } = useTravel();
  if (!person) return <span className="muted">(unknown)</span>;
  return <button type="button" className="link" onClick={() => showPerson(person.id)}>{bold ? <b>{person.name}</b> : person.name}</button>;
}

/** One line of the red "Overlapping travel found" box. */
export interface ConflictItem { key: string; personName: string; orderId: number; orderCode: string; start: string; end: string; destination: string; office: string }

export function tripItems(m: Model, trips: Trip[]): ConflictItem[] {
  return trips.map((t) => {
    const o = m.orderById.get(t.to);
    return {
      key: t.pid + '-' + t.to, personName: m.personById.get(t.pid)?.name ?? '', orderId: t.to, orderCode: o?.code ?? '',
      start: t.start, end: t.end, destination: o?.destination ?? '', office: o?.office ?? '',
    };
  });
}

export function serverItems(conflicts: Conflict[]): ConflictItem[] {
  return conflicts.map((c) => ({
    key: c.personId + '-' + c.orderId, personName: c.personName, orderId: c.orderId, orderCode: c.orderCode,
    start: c.startDate, end: c.endDate, destination: c.destination, office: c.office,
  }));
}

export function ConflictBox({ items }: { items: ConflictItem[] }) {
  if (!items.length) return null;
  return (
    <div className="alert bad">
      <b>⚠ Overlapping travel found</b>
      <ul>
        {items.map((c) => (
          <li key={c.key}>
            <b>{c.personName}</b> already has <OrderLink id={c.orderId} code={c.orderCode} /> on {range(c.start, c.end)} — {c.destination} ({c.office})
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Every change of dates or place of a travel order, oldest first. */
export function HistoryBox({ order }: { order: Order }) {
  if (!order.changes.length) return null;
  return (
    <div className="alert warn">
      <b>Changed {order.changes.length}x (date / place)</b>
      <ul>
        {order.changes.map((c) => {
          const dates = c.oldStartDate !== c.newStartDate || c.oldEndDate !== c.newEndDate;
          const place = c.oldDestination !== c.newDestination;
          return (
            <li key={c.id}>
              {dates && <>{range(c.oldStartDate, c.oldEndDate)} → <b>{range(c.newStartDate, c.newEndDate)}</b></>}
              {dates && place && <br />}
              {place && <>Place: {c.oldDestination} → <b>{c.newDestination}</b></>}
              {' '}<span className="small">({formatDateTime(c.changedAt)} by {c.changedBy} · {c.reason})</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function NoticeBox({ notice }: { notice: { kind: 'ok' | 'bad' | 'warn'; text: string } | null }) {
  return notice ? <div className={'alert ' + notice.kind}>{notice.text}</div> : null;
}

/** "All offices" filter. */
export function OfficeFilter({ value, onChange }: { value: string; onChange(office: string): void }) {
  const { m } = useTravel();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Office">
      <option value="">All offices</option>
      {m.data.offices.map((o) => <option key={o.id}>{o.name}</option>)}
    </select>
  );
}
