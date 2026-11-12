import type { Schemas } from '../api/client';

export type TravelData = Schemas['TravelData'];
export type Order = Schemas['OrderView'];
export type Person = Schemas['PersonView'];
export type Office = Schemas['OfficeView'];
export type Conflict = Schemas['Conflict'];
export type Change = Schemas['ChangeView'];
export type Employment = NonNullable<Person['employment']>;

/** One person on one active travel order. */
export interface Trip { pid: number; to: number; start: string; end: string }
export interface ConflictPair { pid: number; a: Trip; b: Trip }

/** The data of one year plus everything worked out from it once, so the screens stay fast. */
export interface Model {
  data: TravelData;
  today: string;
  year: number;
  yearStart: string;
  yearEnd: string;
  orderById: Map<number, Order>;
  personById: Map<number, Person>;
  trips: Trip[];
  tripsByPid: Map<number, Trip[]>;
  /** Overlapping pairs among the active travel orders of the selected year. */
  conflictPairs: ConflictPair[];
  conflictTos: Set<number>;
}

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const EMPLOYMENT_LABEL: Record<Employment, string> = { PERMANENT: 'Permanent', COS: 'COS' };
export const EMPLOYMENTS: Employment[] = ['PERMANENT', 'COS'];

/* Dates travel as "2027-03-01" text, which also sorts and compares correctly as text. */
export function toDate(iso: string): Date { const p = iso.split('-'); return new Date(+p[0]!, +p[1]! - 1, +p[2]!); }
export function isoOf(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function addDays(iso: string, n: number): string { const d = toDate(iso); d.setDate(d.getDate() + n); return isoOf(d); }
export function fmt(iso: string): string {
  if (!iso) return '';
  const d = toDate(iso);
  return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}
/** "Mar 1–3, 2027", "Mar 30 – Apr 2, 2027", "Dec 30, 2026 – Jan 2, 2027" */
export function range(s: string, e: string): string {
  if (!s) return '';
  if (s === e) return fmt(s);
  const a = toDate(s), b = toDate(e);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return MON[a.getMonth()] + ' ' + a.getDate() + '–' + b.getDate() + ', ' + a.getFullYear();
  if (a.getFullYear() === b.getFullYear()) return MON[a.getMonth()] + ' ' + a.getDate() + ' – ' + MON[b.getMonth()] + ' ' + b.getDate() + ', ' + a.getFullYear();
  return fmt(s) + ' – ' + fmt(e);
}
export function days(s: string, e: string): number { return Math.round((toDate(e).getTime() - toDate(s).getTime()) / 864e5) + 1; }
/** For searching and comparing names: capitals, no dots or commas, single spaces. */
export function norm(text: string | null | undefined): string {
  return String(text ?? '').toUpperCase().replace(/[.,`'"]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildModel(data: TravelData): Model {
  const orderById = new Map(data.orders.map((o) => [o.id, o]));
  const personById = new Map(data.people.map((p) => [p.id, p]));
  const trips: Trip[] = [];
  const tripsByPid = new Map<number, Trip[]>();
  for (const o of data.orders) {
    if (o.status !== 'ACTIVE') continue;
    for (const pid of o.travelerIds) {
      const trip = { pid, to: o.id, start: o.startDate, end: o.endDate };
      trips.push(trip);
      const list = tripsByPid.get(pid);
      if (list) list.push(trip); else tripsByPid.set(pid, [trip]);
    }
  }
  const yearStart = data.year + '-01-01', yearEnd = data.year + '-12-31';
  const conflictPairs: ConflictPair[] = [];
  const conflictTos = new Set<number>();
  tripsByPid.forEach((list, pid) => {
    list.sort((a, b) => a.start.localeCompare(b.start) || a.to - b.to);
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      // sorted by start, so once one starts after a ends, the rest do too
      for (let j = i + 1; j < list.length && list[j]!.start <= a.end; j++) {
        const b = list[j]!;
        if (!(b.start <= yearEnd && a.end >= yearStart)) continue;
        conflictPairs.push({ pid, a, b });
        conflictTos.add(a.to); conflictTos.add(b.to);
      }
    }
  });
  return { data, today: data.today, year: data.year, yearStart, yearEnd, orderById, personById, trips, tripsByPid, conflictPairs, conflictTos };
}

/** Other active travels of these people with at least one day inside start–end. */
export function conflictsFor(m: Model, pids: number[], start: string, end: string, excludeId: number | null): Trip[] {
  const out: Trip[] = [];
  for (const pid of pids) {
    for (const t of m.tripsByPid.get(pid) ?? []) {
      if (t.to !== excludeId && t.start <= end && t.end >= start) out.push(t);
    }
  }
  return out;
}

/** Is this date range inside the data that is loaded in the browser? Outside it, only the server can check. */
export function inWindow(m: Model, start: string, end: string): boolean {
  return start >= m.data.window.from && end <= m.data.window.to;
}

export type ShownStatus = 'Upcoming' | 'Ongoing' | 'Completed' | 'Cancelled';
export const STATUS_LABEL: Record<ShownStatus, string> = { Upcoming: 'Upcoming', Ongoing: 'On travel', Completed: 'Completed', Cancelled: 'Cancelled' };

/** Cancelled is saved; the others follow from the travel dates. */
export function statusOf(o: Order, today: string): ShownStatus {
  if (o.status === 'CANCELLED') return 'Cancelled';
  if (o.endDate < today) return 'Completed';
  if (o.startDate > today) return 'Upcoming';
  return 'Ongoing';
}

/** The first dates of a travel order that was moved (null when the dates are still the first ones). */
export function originalDates(o: Order): { start: string; end: string } | null {
  const c = o.changes[0];
  return c && (c.oldStartDate !== o.startDate || c.oldEndDate !== o.endDate) ? { start: c.oldStartDate, end: c.oldEndDate } : null;
}

/** The first place of a travel order whose place was changed (null when it is still the first one). */
export function originalPlace(o: Order): string | null {
  const c = o.changes.find((x) => x.oldDestination !== x.newDestination);
  return c && c.oldDestination !== o.destination ? c.oldDestination : null;
}

export function travelerNames(m: Model, o: Order): string[] {
  return o.travelerIds.map((pid) => m.personById.get(pid)?.name ?? '#' + pid);
}

/** "NAME — OFFICE · Permanent (P0001)": what the traveler box lists, and what it reads back. */
export function personOption(p: Person): string {
  return p.name + ' — ' + (p.office || 'no office') + (p.employment ? ' · ' + EMPLOYMENT_LABEL[p.employment] : '') + ' (' + p.code + ')';
}

/** The 12 months of the selected year. */
export function monthsOfYear(year: number): { key: string; start: string; end: string }[] {
  return MON.map((_, i) => {
    const key = year + '-' + String(i + 1).padStart(2, '0');
    return { key, start: key + '-01', end: isoOf(new Date(year, i + 1, 0)) };
  });
}

/** Offices that can be chosen in a form: the active ones, plus the one already on the record. */
export function officeChoices(m: Model, currentId: number | null | undefined): Office[] {
  return m.data.offices.filter((o) => o.active || o.id === currentId);
}

/** Office names for a filter: every office that appears in the data. */
export function officeNames(m: Model): string[] {
  return m.data.offices.map((o) => o.name);
}
