import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage, unwrap } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { NO_FILTER, TravelContext, type FormState, type ListFilter, type Notice, type PersonDialogOptions, type Tab, type TravelCtx } from './context';
import { Dashboard } from './Dashboard';
import { PersonDialog, RescheduleDialog, StatusDialog } from './dialogs';
import { buildModel, type Order, type Person, type TravelData } from './model';
import { OrderForm } from './OrderForm';
import { OrderList } from './OrderList';
import { PeopleTab } from './PeopleTab';
import { Reports } from './Reports';
import { TravelCalendar } from './TravelCalendar';

const START_FILTER: ListFilter = { ...NO_FILTER, status: 'notcancelled' };

function emptyForm(today: string): FormState {
  return { id: null, pids: [], start: '', end: '', filed: today, officeId: null, dest: '', purpose: '', dts: '', toNo: '', remarks: '', reason: '' };
}

/**
 * Travel Orders. One year of data is loaded at a time and the screens work on it in the browser, the same way
 * the old Travel Order System did; every save is checked again on the server.
 */
export function TravelPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'ENCODER');
  const [data, setData] = useState<TravelData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [form, setFormState] = useState<FormState>(emptyForm(''));
  const [formNotice, setFormNotice] = useState<Notice | null>(null);
  const [filter, setFilterState] = useState<ListFilter>(START_FILTER);
  const [calMonth, setCalMonth] = useState('');
  const [personId, setPersonId] = useState<number | null>(null);
  const [toastText, setToastText] = useState('');
  const [statusDialog, setStatusDialog] = useState<{ order: Order; mode: 'cancel' | 'restore' } | null>(null);
  const [rescheduling, setRescheduling] = useState<Order | null>(null);
  const [personDialog, setPersonDialog] = useState<PersonDialogOptions | null>(null);
  const loadedYear = useRef<number | undefined>(undefined);
  const page = useRef<HTMLDivElement>(null);

  const reload = useCallback(async (year?: number) => {
    const y = year ?? loadedYear.current;
    setLoading(true);
    try {
      const d = await unwrap(api.GET('/api/travel/data', { params: { query: y ? { year: y } : {} } }));
      const yearChanged = loadedYear.current !== d.year;
      loadedYear.current = d.year;
      setData(d);
      setError('');
      setFormState((f) => f.filed || f.id != null ? f : { ...f, filed: d.today });
      setCalMonth((prev) => prev && Number(prev.slice(0, 4)) === d.year ? prev
        : d.today.startsWith(d.year + '-') ? d.today.slice(0, 7) : d.year + '-01');
      if (yearChanged) setFilterState((f) => ({ ...f, month: '' }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!toastText) return;
    const t = setTimeout(() => setToastText(''), 3500);
    return () => clearTimeout(t);
  }, [toastText]);

  // On a phone each table row becomes a card; the column name is copied in front of each value (data-label).
  useEffect(() => {
    const root = page.current;
    if (!root) return;
    const label = () => root.querySelectorAll('table.stack').forEach((t) => {
      const heads = Array.from(t.querySelectorAll('thead th')).map((th) => th.textContent?.trim() ?? '');
      if (!heads.length) return;
      t.querySelectorAll('tbody tr').forEach((tr) => Array.from(tr.children).forEach((td, i) => {
        if (heads[i] && !td.hasAttribute('data-label') && (td as HTMLTableCellElement).colSpan === 1 && !td.classList.contains('actions')) {
          td.setAttribute('data-label', heads[i]);
        }
      }));
    });
    label();
    const observer = new MutationObserver(label);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [data === null]);

  const m = useMemo(() => (data ? buildModel(data) : null), [data]);

  const ctx = useMemo<TravelCtx | null>(() => {
    if (!m) return null;
    const newForm = (notice?: Notice) => { setFormState(emptyForm(m.today)); setFormNotice(notice ?? null); };
    const showList = (change: Partial<ListFilter>) => { setFilterState({ ...NO_FILTER, ...change }); setTab('list'); window.scrollTo(0, 0); };
    return {
      m, canEdit, tab,
      setTab: (t) => { setTab(t); window.scrollTo(0, 0); },
      form,
      setForm: (change) => { setFormState((f) => ({ ...f, ...change })); setFormNotice(null); }, // an old "saved" note goes when typing starts
      formNotice, setFormNotice, newForm,
      filter,
      setFilter: (change) => setFilterState((f) => ({ ...f, ...change })),
      calMonth, setCalMonth, personId,
      toast: setToastText,
      reload,
      applyOrder: (order) => setData((d) => d && {
        ...d, orders: d.orders.some((o) => o.id === order.id) ? d.orders.map((o) => (o.id === order.id ? order : o)) : [...d.orders, order],
      }),
      applyPerson: (person: Person) => setData((d) => d && {
        ...d, people: d.people.some((p) => p.id === person.id) ? d.people.map((p) => (p.id === person.id ? person : p)) : [...d.people, person],
      }),
      openOrder: (id) => {
        const o = m.orderById.get(id);
        if (!o) return;
        if (o.status !== 'ACTIVE' || !canEdit) { showList({ q: o.code }); return; } // the list is where Restore is
        setFormState({
          id, pids: [...o.travelerIds], start: o.startDate, end: o.endDate, filed: o.dateFiled, officeId: o.officeId, dest: o.destination,
          purpose: o.purpose, dts: o.dtsNo, toNo: o.toNo, remarks: o.remarks, reason: o.overlapReason,
        });
        setFormNotice(null);
        setTab('form');
        window.scrollTo(0, 0);
      },
      showPerson: (id) => { setPersonId(id); if (id != null) setTab('people'); },
      showList,
      askCancel: (order) => setStatusDialog({ order, mode: 'cancel' }),
      askRestore: (order) => setStatusDialog({ order, mode: 'restore' }),
      askReschedule: setRescheduling,
      openPersonDialog: setPersonDialog,
    };
  }, [m, canEdit, tab, form, formNotice, filter, calMonth, personId, reload]);

  if (!ctx || !m) {
    return (
      <>
        <h2>Travel Orders</h2>
        {error ? <div className="alert bad">{error} <button className="link" onClick={() => void reload()}>Try again</button></div> : <p className="sub">Loading…</p>}
      </>
    );
  }

  const tabButton = (t: Tab, label: string) => (
    <button type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''}
      onClick={() => { if (t === 'form' && form.id != null) ctx.newForm(); ctx.setTab(t); }}>{label}</button>
  );

  return (
    <TravelContext.Provider value={ctx}>
      <div ref={page}>
        <div className="row head">
          <h2>Travel Orders</h2>
          <div className="row tight">
            <select value={m.year} aria-label="Year" title="Year" disabled={loading} onChange={(e) => void reload(Number(e.target.value))}>
              {m.data.years.map((y) => <option key={y}>{y}</option>)}
            </select>
            <button className="btn" disabled={loading} title="Load the latest changes made by other users"
              onClick={() => void reload().then(() => setToastText('Updated with the latest data'))}>↻ Refresh</button>
          </div>
        </div>
        {error && <div className="alert bad">{error}</div>}
        <div className="tabs" role="tablist">
          {tabButton('dashboard', 'Dashboard')}
          {canEdit && tabButton('form', '+ New Travel Order')}
          {tabButton('list', 'Travel Orders')}
          {tabButton('calendar', 'Calendar')}
          {tabButton('people', 'Personnel')}
          {tabButton('reports', 'Reports')}
        </div>

        {tab === 'dashboard' && <Dashboard />}
        {tab === 'form' && canEdit && <OrderForm />}
        {tab === 'list' && <OrderList />}
        {tab === 'calendar' && <TravelCalendar />}
        {tab === 'people' && <PeopleTab />}
        {tab === 'reports' && <Reports />}

        {statusDialog && <StatusDialog order={statusDialog.order} mode={statusDialog.mode} onClose={() => setStatusDialog(null)} />}
        {rescheduling && <RescheduleDialog order={rescheduling} onClose={() => setRescheduling(null)} />}
        {personDialog && <PersonDialog options={personDialog} onClose={() => setPersonDialog(null)} />}
        {toastText && <div className="toast" role="status">{toastText}</div>}
      </div>
    </TravelContext.Provider>
  );
}
