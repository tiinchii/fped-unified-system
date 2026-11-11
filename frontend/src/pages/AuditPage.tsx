import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage, unwrap, type Schemas } from '../api/client';
import { formatDateTime } from '../format';

type AuditPageData = Schemas['AuditPage'];
const SIZE = 50;

export function AuditPage() {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<AuditPageData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    unwrap(api.GET('/api/admin/audit', { params: { query: { q: query, page, size: SIZE } } }))
      .then((d) => { if (current) { setData(d); setError(''); } })
      .catch((e) => { if (current) setError(errorMessage(e)); });
    return () => { current = false; };
  }, [query, page]);

  function search(e: FormEvent) {
    e.preventDefault();
    setPage(0);
    setQuery(text.trim());
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / SIZE)) : 1;

  return (
    <>
      <h2>Audit log</h2>
      <p className="sub">Who did what, and when. Newest first.</p>
      <form className="row" onSubmit={search}>
        <input className="grow" placeholder="Search username, action, record or details" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn primary">Search</button>
      </form>
      {error && <div className="alert bad">{error}</div>}
      <div className="card flush">
        <table>
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
          <tbody>
            {data === null && !error && <tr><td colSpan={5} className="muted">Loading…</td></tr>}
            {data?.items.length === 0 && <tr><td colSpan={5} className="muted">Nothing found.</td></tr>}
            {data?.items.map((a) => (
              <tr key={a.id}>
                <td className="small nowrap">{formatDateTime(a.loggedAt)}</td>
                <td>{a.username}</td>
                <td><span className="pill">{a.action}</span></td>
                <td className="small">{a.recordId}</td>
                <td className="small break">{a.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.total > SIZE && <div className="row pager">
        <button className="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>← Newer</button>
        <span className="small muted">Page {page + 1} of {pages} · {data.total} entries</span>
        <button className="btn small" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Older →</button>
      </div>}
    </>
  );
}
