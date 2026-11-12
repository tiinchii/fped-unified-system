/**
 * The repeat check: how alike two titles are. Same rules as TitleSimilarity.java on the server (and the old
 * Procurement System), so the warning shown while typing matches the check done when saving. Keep both in sync.
 */
const STOP = new Set(('THE AND FOR WITH FROM INTO ONTO THRU VIA ITS OUR ALL ETC PER ' +
  'ACTIVITY ACTIVITIES PROPOSAL REQUEST AUTHORITY CONDUCT CONDUCTING PURCHASE PROCUREMENT SUPPLY DELIVERY ' +
  'BFAR BUREAU FISHERIES AQUATIC RESOURCES CENTRAL OFFICE BATCH ' +
  'JAN JANUARY FEB FEBRUARY MAR MARCH APR APRIL MAY JUN JUNE JUL JULY AUG AUGUST SEP SEPT SEPTEMBER ' +
  'OCT OCTOBER NOV NOVEMBER DEC DECEMBER').split(' '));
export const SIM_MIN = 0.6;

export interface Weights { known: Map<string, number>; unknown: number }

/** "Training on Risk Management for CY 2026 (Batch 2)" -> ["TRAINING", "RISK", "MANAGEMENT"] */
export function tokens(text: string): string[] {
  const out: string[] = [];
  for (let w of String(text || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').split(' ')) {
    if (w.length < 3 || /\d/.test(w) || STOP.has(w)) continue;
    if (w.length > 4 && /[^S]S$/.test(w)) w = w.slice(0, -1); // WORKSHOPS -> WORKSHOP
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

/** Words found in many records count little; rare words count a lot. docs = the words of each record. */
export function weights(docs: string[][]): Weights {
  const df = new Map<string, number>();
  docs.forEach((d) => new Set(d).forEach((w) => df.set(w, (df.get(w) ?? 0) + 1)));
  const n = docs.length + 1;
  const known = new Map<string, number>();
  df.forEach((c, w) => known.set(w, Math.log(n / c)));
  return { known, unknown: Math.log(n) };
}

/** 0..1, how alike two word lists are; 0 when they are not alike enough to mention. */
export function similarity(a: string[], b: string[], w: Weights): number {
  if (!a.length || !b.length) return 0;
  const wt = (t: string) => Math.max(w.known.get(t) ?? w.unknown, 0.05);
  const setB = new Set(b);
  const common = a.filter((t) => setB.has(t));
  if (!common.length) return 0;
  const sum = (l: string[]) => l.reduce((s, t) => s + wt(t), 0);
  const wa = sum(a), wb = sum(b), wc = sum(common);
  const dice = 2 * wc / (wa + wb);
  if (dice >= SIM_MIN) return dice;
  // a short title found inside a longer one
  const inside = wc / Math.min(wa, wb);
  if (common.length >= 2 && inside >= 0.85) return Math.max(SIM_MIN, inside * 0.8);
  return 0;
}
