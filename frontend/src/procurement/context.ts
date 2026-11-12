import { createContext, useContext } from 'react';
import type { FullRecord, Model, Pr } from './model';

export type Tab = 'dashboard' | 'form' | 'pr' | 'list' | 'budget' | 'repeats';

export interface ListFilter { q: string; officeId: number | null; kind: string; doc: string; status: 'ACTIVE' | 'CANCELLED' | ''; rep: boolean }
export const START_FILTER: ListFilter = { q: '', officeId: null, kind: '', doc: '', status: 'ACTIVE', rep: false };

export type StatusAsk = { kind: 'record'; record: FullRecord; cancel: boolean } | { kind: 'pr'; record: FullRecord; pr: Pr; cancel: boolean };

export interface ProcCtx {
  m: Model;
  canEdit: boolean;
  isAdmin: boolean;
  username: string;
  tab: Tab;
  setTab(tab: Tab): void;
  toast(text: string): void;
  reload(year?: number): Promise<void>;
  /** Puts a changed record (and the new budget summary) into the loaded data instead of loading everything. */
  applyRecord(record: FullRecord, budgets?: Model['data']['budgets']): void;
  applyBudgets(budgets: Model['data']['budgets']): void;
  /** Full details of a record; fetched from the server when only the short form is loaded. */
  full(id: number): Promise<FullRecord | null>;
  viewRecord(id: number): void;
  /** Step 1 form: a new record (id null) or the edit form of a record. */
  editRecord(id: number | null): void;
  editRequest: { id: number | null; n: number };
  /** PR form: a new PR of a record, an existing PR, or (recordId null) the search for the record. */
  openPr(recordId: number | null, prId?: number | null): void;
  prRequest: { recordId: number | null; prId: number | null; n: number };
  showList(filter: Partial<ListFilter>): void;
  filter: ListFilter;
  setFilter(change: Partial<ListFilter>): void;
  askStatus(ask: StatusAsk): void;
  openRouting(record: FullRecord, prId: number | null, action?: FullRecord['routing'][number]['action']): void;
  openSppmp(record: FullRecord, pr: Pr): void;
  openBudget(officeId: number): void;
}

export const ProcContext = createContext<ProcCtx | null>(null);

export function useProc(): ProcCtx {
  const ctx = useContext(ProcContext);
  if (!ctx) throw new Error('useProc must be used inside ProcurementPage');
  return ctx;
}
