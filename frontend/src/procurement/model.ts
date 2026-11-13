import type { Schemas } from '../api/client';
import { similarity, tokens, weights, type Weights } from './similarity';

export type Data = Schemas['ProcurementData'];
export type FullRecord = Schemas['RecordView'];
export type Pr = Schemas['PrView'];
export type Route = Schemas['RouteView'];
export type BudgetLine = Schemas['BudgetLine'];
export type Office = Schemas['OfficeView'];
export type Similar = Schemas['Similar'];
export type DocStatus = NonNullable<FullRecord['proposalStatus']>;
export type ProcType = FullRecord['procType'];
export type ProposalType = FullRecord['proposalType'];
export type RepeatType = NonNullable<FullRecord['repeatType']>;
export type RouteAction = Route['action'];
export type Plan = NonNullable<Pr['plan']>;
export type Facility = NonNullable<Pr['facility']>;

/** A record of any year: full details for the selected year, a short form for the others (full is then empty). */
export interface Rec {
  id: number; code: string; dateReceived: string | null; fiscalYear: number; early: boolean; officeId: number; office: string; title: string;
  status: FullRecord['status']; repeatType: RepeatType | null; repeatOfId: number | null; startDate: string | null;
  endDate: string | null; procType: ProcType; dtsNo: string;
  prs: { id: number; code: string; dtsNo: string; status: Pr['status']; title: string }[];
  full: FullRecord | null;
}

export const DOC_STATUSES: DocStatus[] = ['FOR_REVIEW', 'SIGNED_WITHOUT_REVIEW', 'SIGNED_WITH_REVIEW'];
export const DOC_LABEL: Record<DocStatus, string> = {
  FOR_REVIEW: 'For Review FPED', SIGNED_WITHOUT_REVIEW: 'Signed w/o FPED Review', SIGNED_WITH_REVIEW: 'Signed w/ FPED Review',
};
const DOC_SHORT: Record<DocStatus, string> = { FOR_REVIEW: 'for review', SIGNED_WITHOUT_REVIEW: 'signed w/o review', SIGNED_WITH_REVIEW: 'signed' };
export const DOC_CLASS: Record<DocStatus, string> = { FOR_REVIEW: 'review', SIGNED_WITHOUT_REVIEW: 'nofped', SIGNED_WITH_REVIEW: 'signed' };
export const PROC_TYPES: ProcType[] = ['EVENT', 'EQUIPMENT', 'REPAIR', 'HIRING', 'OTHERS'];
export const PROC_LABEL: Record<ProcType, string> = { EVENT: 'Event', EQUIPMENT: 'Equipment', REPAIR: 'Repair', HIRING: 'Hiring of Personnel', OTHERS: 'Others' };
export const PROPOSAL_LABEL: Record<ProposalType, string> = { ACTIVITY_PROPOSAL: 'Activity Proposal', PROJECT_PROPOSAL: 'Project Proposal', NONE: 'Wala (PR lang)' };
/** Kinds with item details: [label, example, required]. Same as ProcType.hasDetails on the server. */
export const ITEM_LABEL: Partial<Record<ProcType, [string, string, boolean]>> = {
  EQUIPMENT: ['Anong equipment?', 'e.g. 2 units laptop, 1 unit printer', true],
  REPAIR: ['Ano ang ire-repair?', 'e.g. aircon ng Conference Room, 2nd floor', true],
  OTHERS: ['Ano ito? (optional)', 'e.g. supplies para sa opisina', false],
};
export const REPEAT_TYPES: RepeatType[] = ['REPEAT', 'RESUBMISSION', 'SAME_ACTIVITY', 'DIFFERENT'];
export const REPEAT_LABEL: Record<RepeatType, [string, string]> = {
  REPEAT: ['Repeat', 'inuulit ang activity (hal. bagong batch, taun-taon)'],
  RESUBMISSION: ['Re-submission', 'ipinasa ulit (dating na-cancel, binago ang petsa, o ibinalik)'],
  SAME_ACTIVITY: ['Kaparehong activity', 'dagdag na dokumento ng activity na naipasa na'],
  DIFFERENT: ['Hindi pareho', 'magkahawig lang ang pangalan'],
};
export const ROUTE_ACTIONS: RouteAction[] = ['FORWARDED', 'REVIEWED', 'SIGNED', 'RETURNED', 'RECEIVED_BACK', 'OTHER'];
export const ROUTE_LABEL: Record<RouteAction, string> = {
  FORWARDED: 'Forwarded for review', REVIEWED: 'Reviewed', SIGNED: 'Signed', RETURNED: 'Returned to office', RECEIVED_BACK: 'Received back', OTHER: 'Other',
};

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function toDate(iso: string): Date { const p = iso.split('-'); return new Date(+p[0]!, +p[1]! - 1, +p[2]!); }
export function fmt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = toDate(iso);
  return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}
export function range(s: string | null | undefined, e: string | null | undefined): string {
  if (!s) return '';
  if (!e || s === e) return fmt(s);
  const a = toDate(s), b = toDate(e);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return MON[a.getMonth()] + ' ' + a.getDate() + '–' + b.getDate() + ', ' + a.getFullYear();
  if (a.getFullYear() === b.getFullYear()) return MON[a.getMonth()] + ' ' + a.getDate() + ' – ' + MON[b.getMonth()] + ' ' + b.getDate() + ', ' + a.getFullYear();
  return fmt(s) + ' – ' + fmt(e);
}
const MANILA_PARTS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** An instant as date and clock time in the Philippines: { date: '2027-01-23', time: '15:51' } */
export function manila(instant: string | Date): { date: string; time: string } {
  const p = Object.fromEntries(MANILA_PARTS.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
/** 'Jan 23, 2027 3:51 PM'; midnight = no time recorded, so the date only. */
export function fmtDT(instant: string | null | undefined): string {
  if (!instant) return '';
  const { date, time } = manila(instant);
  if (time === '00:00') return fmt(date);
  const [h, m] = time.split(':').map(Number) as [number, number];
  return fmt(date) + ' ' + ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM');
}
export function nowTime(): string { return manila(new Date()).time; }
/** Jan 1 – Jun 30 -> "6 month(s)" */
export function contractLength(s: string | null, e: string | null): string {
  if (!s || !e || e < s) return '';
  const a = toDate(s), b = toDate(e);
  b.setDate(b.getDate() + 1);
  const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + (b.getDate() - a.getDate()) / 30;
  return months >= 1 ? Math.round(months * 10) / 10 + ' month(s)' : Math.round((b.getTime() - a.getTime()) / 864e5) + ' day(s)';
}
const MONEY = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function money(n: number | null | undefined): string { return MONEY.format(Number(n) || 0); }
export function peso(n: number): string { return (n < 0 ? '-₱' : '₱') + money(Math.abs(n)); }

/**
 * The years a record received on this date can be for: the year itself, next year (early procurement,
 * e.g. received November for next year's funds) and last year (received in January for last year's).
 */
export function fiscalYearChoices(dateReceived: string, today: string): number[] {
  const y = Number((dateReceived || today).slice(0, 4));
  return [y - 1, y, y + 1];
}

export function activePrs(r: FullRecord): Pr[] { return r.prs.filter((p) => p.status !== 'CANCELLED'); }
export function prTotal(r: FullRecord): number { return activePrs(r).reduce((s, p) => s + p.amount, 0); }
export function hasProposal(r: FullRecord): boolean { return r.proposalType !== 'NONE'; }

/** Attachments a PR still lacks (rules of step 2; same as PurchaseRequest.isIncomplete on the server). */
export function prMissing(p: Pick<Pr, 'source' | 'status' | 'plan' | 'justification' | 'facility' | 'facilityJustification'>, procType: ProcType): string[] {
  if (p.source || p.status === 'CANCELLED') return [];
  const out: string[] = [];
  if (!p.plan) out.push('PPMP (o SPPMP kung walang PPMP)');
  if (p.plan === 'SPPMP' && !p.justification.trim()) out.push('Justification re SPPMP');
  if (procType === 'EVENT' && !p.facility) out.push('Government o Non-Government facility');
  if (p.facility === 'NON_GOVERNMENT' && !p.facilityJustification.trim()) out.push('Justification sa Non-Government facility');
  return out;
}
/** The last routing entry of a PR, when it is "Returned to office". */
export function returnedEntry(p: Pr, r: FullRecord): Route | null {
  const mine = r.routing.filter((x) => x.prId === p.id);
  const last = mine[mine.length - 1];
  return last && last.action === 'RETURNED' ? last : null;
}
export type PrState = 'Cancelled' | 'Returned' | 'Incomplete' | 'Complete';
export function prState(p: Pr, r: FullRecord): PrState {
  if (p.status === 'CANCELLED') return 'Cancelled';
  if (!prMissing(p, r.procType).length) return 'Complete';
  return returnedEntry(p, r) ? 'Returned' : 'Incomplete';
}
export function hasReview(r: FullRecord): boolean {
  return (hasProposal(r) && r.proposalStatus === 'FOR_REVIEW') || (r.withAtc && r.atcStatus === 'FOR_REVIEW')
    || activePrs(r).some((p) => p.prStatus === 'FOR_REVIEW');
}
export function hasIncomplete(r: FullRecord): boolean { return r.status !== 'CANCELLED' && activePrs(r).some((p) => prState(p, r) !== 'Complete'); }
export function isRepeat(r: { repeatType: RepeatType | null }): boolean { return !!r.repeatType && r.repeatType !== 'DIFFERENT'; }
export function docShort(s: DocStatus | null): string { return s ? ' · ' + DOC_SHORT[s] : ''; }

/** "Mar 1–3, 2027 · Baguio City", "Contract Jan 1 – Jun 30, 2027", or the item details. */
export function whenWhere(r: Rec): string {
  const f = r.full;
  if (r.procType === 'EVENT') return [range(r.startDate, r.endDate), f?.venue ?? ''].filter(Boolean).join(' · ');
  if (r.procType === 'HIRING' && r.startDate) return 'Contract ' + range(r.startDate, r.endDate);
  if (f?.details) return f.details.length > 90 ? f.details.slice(0, 90).replace(/\n/g, ', ') + '…' : f.details.replace(/\n/g, ', ');
  return '';
}

export function fromFull(f: FullRecord): Rec {
  return { ...f, full: f, prs: f.prs.map((p) => ({ id: p.id, code: p.code, dtsNo: p.dtsNo, status: p.status, title: p.title })) };
}
function fromLite(l: Schemas['LiteRecord']): Rec { return { ...l, full: null }; }

/** The data of one year plus everything worked out from it once. */
export interface Model {
  data: Data;
  year: number;
  today: string;
  /** Selected year in full, the others in short form; records fetched later replace their short form. */
  all: Rec[];
  recById: Map<number, Rec>;
  /** Full records of the selected year. */
  records: FullRecord[];
  budgetOf: Map<number, BudgetLine>;
  officeById: Map<number, Office>;
  textsOf: Map<number, string[]>;
  tokensOf: Map<number, string[][]>;
  w: Weights;
}

export function buildModel(data: Data, fetched: Map<number, FullRecord>): Model {
  const all = [...data.records.map(fromFull), ...data.otherYears.map((l) => (fetched.has(l.id) ? fromFull(fetched.get(l.id)!) : fromLite(l)))];
  const textsOf = new Map<number, string[]>(), tokensOf = new Map<number, string[][]>();
  for (const r of all) {
    const texts = [r.title, ...r.prs.map((p) => p.title).filter((t) => t && t !== r.title)];
    textsOf.set(r.id, texts);
    tokensOf.set(r.id, texts.map(tokens));
  }
  return {
    data, year: data.year, today: data.today, all, recById: new Map(all.map((r) => [r.id, r])), records: data.records,
    budgetOf: new Map(data.budgets.map((b) => [b.officeId, b])), officeById: new Map(data.offices.map((o) => [o.id, o])),
    textsOf, tokensOf, w: weights(all.map((r) => (tokensOf.get(r.id) ?? []).flat())),
  };
}

function bestMatch(m: Model, mine: string[][], id: number): { score: number; k: number } {
  let score = 0, k = -1;
  (m.tokensOf.get(id) ?? []).forEach((tt, i) => mine.forEach((t) => { const s = similarity(t, tt, m.w); if (s > score) { score = s; k = i; } }));
  return { score, k };
}

/** Records whose title or PR titles look like this title; the same office first. */
export function findSimilar(m: Model, title: string, excludeId: number | null, officeId: number | null): Similar[] {
  const mine = [tokens(title)].filter((t) => t.length);
  if (!mine.length) return [];
  const out: Similar[] = [];
  for (const r of m.all) {
    if (r.id === excludeId) continue;
    const b = bestMatch(m, mine, r.id);
    if (b.score) {
      out.push({ id: r.id, code: r.code, score: Math.round(b.score * 100), matched: m.textsOf.get(r.id)?.[b.k] ?? r.title,
        title: r.title, officeId: r.officeId, office: r.office, dateReceived: r.dateReceived, status: r.status });
    }
  }
  return out.sort((a, b) => Number(b.officeId === officeId) - Number(a.officeId === officeId) || b.score - a.score
    || (b.dateReceived ?? '').localeCompare(a.dateReceived ?? '')).slice(0, 20);
}

/**
 * Groups of look-alike records, oldest first: a record joins the group whose FIRST record it looks most like,
 * otherwise it starts a new group (comparing with the first record only stops chains pulling unrelated
 * activities together). A record marked as a repeat of another joins that one's group.
 */
export function clusters(m: Model, crossOffice: boolean): Rec[][] {
  const recs = [...m.all].sort((a, b) => (a.dateReceived ?? '').localeCompare(b.dateReceived ?? '') || a.code.localeCompare(b.code));
  const groups: { lead: number; officeId: number; list: Rec[] }[] = [];
  const groupOf = new Map<number, (typeof groups)[number]>();
  for (const r of recs) {
    let g = isRepeat(r) && r.repeatOfId != null ? groupOf.get(r.repeatOfId) : undefined;
    if (!g) {
      let best = 0;
      for (const x of groups) {
        if (!crossOffice && x.officeId !== r.officeId) continue;
        const s = bestMatch(m, m.tokensOf.get(r.id) ?? [], x.lead).score;
        if (s > best) { best = s; g = x; }
      }
    }
    if (!g) { g = { lead: r.id, officeId: r.officeId, list: [] }; groups.push(g); }
    g.list.push(r);
    groupOf.set(r.id, g);
  }
  return groups.filter((g) => g.list.length > 1).map((g) => g.list);
}
