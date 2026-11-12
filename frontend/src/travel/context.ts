import { createContext, useContext } from 'react';
import type { Model, Order, Person, ShownStatus } from './model';

export type Tab = 'dashboard' | 'form' | 'list' | 'calendar' | 'people' | 'reports';

/** The New / Edit form. Kept above the tabs so a half-filled form is not lost when looking something up. */
export interface FormState {
  id: number | null;
  pids: number[];
  start: string; end: string; filed: string;
  officeId: number | null;
  dest: string; purpose: string; dts: string; toNo: string; remarks: string; reason: string;
}

export interface ListFilter {
  q: string;
  office: string;
  month: string;
  status: 'notcancelled' | ShownStatus | '';
  onlyConf: boolean;
}
export const NO_FILTER: ListFilter = { q: '', office: '', month: '', status: '', onlyConf: false };

export interface Notice { kind: 'ok' | 'bad' | 'warn'; text: string }

export interface PersonDialogOptions {
  person?: Person;
  presetName?: string;
  presetOfficeId?: number | null;
  /** Set when the dialog was opened from the travel order form: the person is put on the form. */
  onPicked?(person: Person): void;
}

export interface TravelCtx {
  m: Model;
  canEdit: boolean;
  tab: Tab;
  setTab(tab: Tab): void;
  form: FormState;
  setForm(change: Partial<FormState>): void;
  formNotice: Notice | null;
  setFormNotice(n: Notice | null): void;
  /** Empties the form for a new travel order. */
  newForm(notice?: Notice): void;
  filter: ListFilter;
  setFilter(change: Partial<ListFilter>): void;
  calMonth: string;
  setCalMonth(month: string): void;
  personId: number | null;
  toast(text: string): void;
  reload(year?: number): Promise<void>;
  /** Puts a saved record into the loaded data instead of loading everything again. */
  applyOrder(order: Order): void;
  applyPerson(person: Person): void;
  /** Edit form for an active travel order (Admin, Encoder); otherwise the list, filtered to it. */
  openOrder(id: number): void;
  showPerson(id: number | null): void;
  /** Travel Orders list with only this search text / only this office and month. */
  showList(filter: Partial<ListFilter>): void;
  askCancel(order: Order): void;
  askRestore(order: Order): void;
  askReschedule(order: Order): void;
  openPersonDialog(options: PersonDialogOptions): void;
}

export const TravelContext = createContext<TravelCtx | null>(null);

export function useTravel(): TravelCtx {
  const ctx = useContext(TravelContext);
  if (!ctx) throw new Error('useTravel must be used inside TravelPage');
  return ctx;
}
