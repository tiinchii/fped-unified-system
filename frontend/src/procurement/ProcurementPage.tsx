import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage, unwrap } from '../api/client';
import { useAuth, useMe } from '../auth/AuthContext';
import { START_FILTER, ProcContext, type ListFilter, type ProcCtx, type StatusAsk, type Tab } from './context';
import { BudgetDialog, PersonOptions, RoutingDialog, SppmpDialog, StatusDialog } from './dialogs';
import { BudgetTab, Dashboard, RecordList, RepeatsTab } from './Lists';
import { buildModel, type Data, type FullRecord, type Pr, type RouteAction } from './model';
import { PrForm } from './PrForm';
import { RecordForm } from './RecordForm';
import { RecordView } from './RecordView';

/**
 * Procurement. The selected year is loaded in full and the other years in a short form (for the repeat check
 * and finding a record by DTS); the screens work on it in the browser and every save is checked again on the
 * server. The forms stay mounted while another tab is shown, so a half-filled form is not lost.
 */
export function ProcurementPage() {
  const me = useMe();
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'ENCODER');
  const [data, setData] = useState<Data | null>(null);
  const [fetched, setFetched] = useState<Map<number, FullRecord>>(new Map());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTabState] = useState<Tab>('dashboard');
  const [filter, setFilterState] = useState<ListFilter>(START_FILTER);
  const [viewing, setViewing] = useState<number | null>(null);
  const [editRequest, setEditRequest] = useState({ id: null as number | null, n: 0 });
  const [prRequest, setPrRequest] = useState({ recordId: null as number | null, prId: null as number | null, n: 0 });
  const [statusAsk, setStatusAsk] = useState<StatusAsk | null>(null);
  const [routing, setRouting] = useState<{ record: FullRecord; prId: number | null; action?: RouteAction } | null>(null);
  const [sppmp, setSppmp] = useState<{ record: FullRecord; pr: Pr } | null>(null);
  const [budgetOffice, setBudgetOffice] = useState<number | null>(null);
  const [toastText, setToastText] = useState('');
  const loadedYear = useRef<number | undefined>(undefined);
  const page = useRef<HTMLDivElement>(null);

  const reload = useCallback(async (year?: number) => {
    const y = year ?? loadedYear.current;
    setLoading(true);
    try {
      const d = await unwrap(api.GET('/api/procurement/data', { params: { query: y ? { year: y } : {} } }));
      loadedYear.current = d.year;
      setData(d);
      setFetched(new Map());
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!toastText) return;
    const t = setTimeout(() => setToastText(''), 4500);
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
        if (heads[i] && !td.hasAttribute('data-label') && (td as HTMLTableCellElement).colSpan === 1 && !td.classList.contains('actions')) td.setAttribute('data-label', heads[i]);
      }));
    });
    label();
    const observer = new MutationObserver(label);
    observer.observe(document.body, { childList: true, subtree: true }); // windows are outside the page
    return () => observer.disconnect();
  }, [data === null]);

  const m = useMemo(() => (data ? buildModel(data, fetched) : null), [data, fetched]);

  const ctx = useMemo<ProcCtx | null>(() => {
    if (!m) return null;
    const setTab = (t: Tab) => { setTabState(t); window.scrollTo(0, 0); };
    return {
      m, canEdit, isAdmin: me.role === 'ADMIN', username: me.username, tab, setTab,
      toast: setToastText,
      reload,
      applyRecord: (record, budgets) => {
        setData((d) => {
          if (!d) return d;
          const inYear = d.records.some((r) => r.id === record.id) || (record.dateReceived ?? record.code.split('-')[1] ?? '').startsWith(String(d.year));
          if (!inYear) {
            // a record of another year: keep it in full beside the short forms
            setFetched((f) => new Map(f).set(record.id, record));
            return { ...d, budgets: budgets ?? d.budgets, otherYears: d.otherYears.some((l) => l.id === record.id) ? d.otherYears : [...d.otherYears, { ...record, prs: [] }] };
          }
          const records = d.records.some((r) => r.id === record.id) ? d.records.map((r) => (r.id === record.id ? record : r)) : [...d.records, record];
          return { ...d, records, otherYears: d.otherYears.filter((l) => l.id !== record.id), budgets: budgets ?? d.budgets };
        });
      },
      applyBudgets: (budgets) => setData((d) => d && { ...d, budgets }),
      full: async (id) => {
        const r = m.recById.get(id);
        if (r?.full) return r.full;
        try {
          const rec = await unwrap(api.GET('/api/procurement/records/{id}', { params: { path: { id } } }));
          setFetched((f) => new Map(f).set(id, rec));
          return rec;
        } catch (e) {
          setToastText(errorMessage(e));
          return null;
        }
      },
      viewRecord: (id) => {
        const r = m.recById.get(id);
        if (r && !r.full) {
          void unwrap(api.GET('/api/procurement/records/{id}', { params: { path: { id } } }))
            .then((rec) => { setFetched((f) => new Map(f).set(id, rec)); setViewing(id); })
            .catch((e) => setToastText(errorMessage(e)));
          return;
        }
        setViewing(id);
      },
      editRecord: (id) => { setViewing(null); setEditRequest((x) => ({ id, n: x.n + 1 })); setTab('form'); },
      editRequest,
      openPr: (recordId, prId = null) => { setViewing(null); setPrRequest((x) => ({ recordId, prId, n: x.n + 1 })); setTab('pr'); },
      prRequest,
      showList: (change) => { setFilterState({ ...START_FILTER, ...change }); setTab('list'); },
      filter,
      setFilter: (change) => setFilterState((f) => ({ ...f, ...change })),
      askStatus: setStatusAsk,
      openRouting: (record, prId, action) => setRouting({ record, prId, action }),
      openSppmp: (record, pr) => setSppmp({ record, pr }),
      openBudget: setBudgetOffice,
    };
  }, [m, canEdit, me, tab, reload, editRequest, prRequest, filter]);

  if (!ctx || !m) {
    return (
      <>
        <h2>Procurement</h2>
        {error ? <div className="alert bad">{error} <button className="link" onClick={() => void reload()}>Try again</button></div> : <p className="sub">Loading…</p>}
      </>
    );
  }

  const tabButton = (t: Tab, label: string, onOpen?: () => void) => (
    <button type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => { onOpen?.(); ctx.setTab(t); }}>{label}</button>
  );
  const viewed = viewing != null ? m.recById.get(viewing)?.full : null;

  return (
    <ProcContext.Provider value={ctx}>
      <div ref={page}>
        <div className="row head">
          <h2>Procurement</h2>
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
          {canEdit && tabButton('form', '+ New Procurement', () => { if (editRequest.id != null) ctx.editRecord(null); })}
          {canEdit && tabButton('pr', '+ PR')}
          {tabButton('list', 'Records')}
          {tabButton('budget', 'Budget')}
          {tabButton('repeats', 'Repeated')}
        </div>

        {tab === 'dashboard' && <Dashboard />}
        {canEdit && <div hidden={tab !== 'form'}><RecordForm /></div>}
        {canEdit && <div hidden={tab !== 'pr'}><PrForm /></div>}
        {tab === 'list' && <RecordList />}
        {tab === 'budget' && <BudgetTab />}
        {tab === 'repeats' && <RepeatsTab />}

        {viewed && <RecordView r={viewed} onClose={() => setViewing(null)} />}
        {statusAsk && <StatusDialog ask={statusAsk} onClose={() => setStatusAsk(null)} />}
        {routing && <RoutingDialog record={routing.record} prId={routing.prId} action={routing.action} onClose={() => setRouting(null)} />}
        {sppmp && <SppmpDialog record={sppmp.record} pr={sppmp.pr} onClose={() => setSppmp(null)} />}
        {budgetOffice != null && <BudgetDialog officeId={budgetOffice} onClose={() => setBudgetOffice(null)} />}
        <PersonOptions id="personOpts" />
        {toastText && <div className="toast" role="status">{toastText}</div>}
      </div>
    </ProcContext.Provider>
  );
}
