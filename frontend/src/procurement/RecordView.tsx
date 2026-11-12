import type { ReactNode } from 'react';
import { api, errorMessage, unwrap } from '../api/client';
import { Modal } from '../components/Modal';
import { DocPill, RecLink, RepeatPill, SimilarItem, StateLabel, TypeTag } from './bits';
import { useProc } from './context';
import {
  contractLength, fmt, fmtDT, findSimilar, hasProposal, isRepeat, money, PROC_LABEL, PROPOSAL_LABEL, prMissing, prTotal, range,
  REPEAT_LABEL, ROUTE_LABEL, type FullRecord, type Pr,
} from './model';

function Kv({ k, children }: { k: string; children: ReactNode }) {
  if (children === '' || children == null || children === false) return null;
  return <><dt>{k}</dt><dd>{children}</dd></>;
}

function CancelInfo({ c }: { c: FullRecord['cancel'] }) {
  return c ? <div className="alert bad small"><b>Cancelled {fmtDT(c.at)}</b> · sinabi ni <b>{c.requestedBy}</b> · {c.reason} <span className="muted">(encoded by {c.by})</span></div> : null;
}

/** Step 3 of a PR: the SPPMP items, or the button to add them. Not needed when the PR has a PPMP. */
function SppmpPart({ p, r, edit }: { p: Pr; r: FullRecord; edit: boolean }) {
  const { openSppmp } = useProc();
  const head = (button: ReactNode) => <h4 className="row tight-row"><span className="step">3</span> SPPMP{button}</h4>;
  if (!p.items.length) {
    if (p.plan === 'PPMP') return <>{head(null)}<p className="muted small first">May PPMP — hindi kailangan ng SPPMP. (Kung SPPMP pala, i-Edit PR at piliin ang SPPMP.)</p></>;
    return <>{head(edit && <button className="btn small primary push" onClick={() => openSppmp(r, p)}>+ Ilagay ang SPPMP</button>)}
      <p className="muted small first">Wala pang SPPMP. Ilagay ito pagbalik ng papel galing sa {r.office}.</p></>;
  }
  const total = p.items.reduce((s, i) => s + i.amount, 0);
  return (
    <>
      {head(edit && <button className="btn small push" onClick={() => openSppmp(r, p)}>Edit SPPMP</button>)}
      <div className="card flush"><table>
        <thead><tr><th>#</th><th>Activity / Item / Description</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {p.items.map((i, n) => <tr key={n}><td>{n + 1}</td><td>{i.description}</td><td className="num">{money(i.amount)}</td></tr>)}
          <tr className="total"><td /><td>Total</td><td className="num">{money(total)}</td></tr>
        </tbody>
      </table></div>
    </>
  );
}

function PrCard({ p, r }: { p: Pr; r: FullRecord }) {
  const { m, canEdit, openPr, openRouting, askStatus } = useProc();
  const missing = prMissing(p, r.procType), cancelled = p.status === 'CANCELLED', edit = canEdit && r.status !== 'CANCELLED';
  const allPrs = m.all.flatMap((x) => x.prs.map((c) => ({ c, x })));
  const prev = p.replacesId != null ? allPrs.find((y) => y.c.id === p.replacesId) : undefined;
  const replacedBy = allPrs.filter((y) => y.x.full?.prs.find((z) => z.id === y.c.id)?.replacesId === p.id);
  const otherRec = (x: { id: number; code: string }) => (x.id === r.id ? null : <> · <RecLink id={x.id} code={x.code} /></>);
  const details = (
    <dl className="kv">
      <Kv k="Title"><b>{p.title}</b></Kv>
      <Kv k="DTS No.">{p.dtsNo}</Kv>
      <Kv k="Date received">{fmt(p.dateReceived)}</Kv>
      <Kv k="PR date">{fmt(p.prDate)}</Kv>
      <Kv k="Requisitioner">{p.requisitioner}</Kv>
      <Kv k="Venue">{p.venue}</Kv>
      <Kv k="Date">{range(p.startDate, p.endDate)}</Kv>
      <Kv k="Amount"><b>₱{money(p.amount)}</b></Kv>
      <Kv k="PPMP / SPPMP">{p.plan ? <>{p.plan}{p.plan === 'SPPMP' && <div className="small">Justification: {p.justification || <span className="red">wala</span>}</div>}</>
        : p.source ? '' : <span className="red">wala</span>}</Kv>
      <Kv k="Facility">{p.facility && <>{p.facility === 'GOVERNMENT' ? 'Government' : 'Non-Government'}
        {p.facility === 'NON_GOVERNMENT' && <div className="small">Justification: {p.facilityJustification || <span className="red">wala</span>}</div>}</>}</Kv>
      <Kv k="Kapalit ng">{prev && <>{prev.c.title} <span className="small muted">(cancelled)</span>{otherRec(prev.x)}</>}</Kv>
      <Kv k="Pinalitan ng">{replacedBy.length > 0 && replacedBy.map((y) => <div key={y.c.id}>{y.c.title}{y.c.dtsNo && <span className="small muted"> DTS {y.c.dtsNo}</span>}{otherRec(y.x)}</div>)}</Kv>
      <Kv k="Remarks">{p.remarks}</Kv>
      <Kv k="Encoded">{p.encodedBy} · {fmt(p.encodedAt.slice(0, 10))}{p.updatedBy !== p.encodedBy && ' · last edit by ' + p.updatedBy}{p.source && ' · ' + p.source} <span className="small muted">({p.code})</span></Kv>
    </dl>
  );

  // a cancelled PR shows only its title; the rest is under "Details"
  if (cancelled) {
    return (
      <div className="prcard cancelled">
        <h4><s>{p.title}</s> <span className="pill gone">Cancelled</span></h4>
        <details className="small"><summary>Details</summary>
          <CancelInfo c={p.cancel} />{details}{p.items.length > 0 && <SppmpPart p={p} r={r} edit={false} />}
          {edit && <div className="btns"><button className="btn small" onClick={() => askStatus({ kind: 'pr', record: r, pr: p, cancel: false })}>Restore PR</button></div>}
        </details>
      </div>
    );
  }
  return (
    <div className={'prcard' + (missing.length ? ' bad' : '')}>
      <h4>PR{p.dtsNo && ' · DTS ' + p.dtsNo} <span className="small muted">{p.code}</span> <DocPill name="PR" status={p.prStatus} />
        {p.plan === 'SPPMP' && <span className="pill sppmp">SPPMP</span>}<StateLabel p={p} r={r} /></h4>
      {missing.length > 0 && <div className="alert bad small"><b>Kulang:</b> {missing.join(', ')}</div>}
      {details}
      {edit && <div className="btns">
        <button className="btn small" onClick={() => openPr(r.id, p.id)}>Edit PR</button>
        {missing.length > 0 && <button className="btn small" onClick={() => openRouting(r, p.id, 'RETURNED')}>Returned to office</button>}
        <button className="btn small" onClick={() => openRouting(r, p.id)}>+ Routing</button>
        <button className="btn small" onClick={() => askStatus({ kind: 'pr', record: r, pr: p, cancel: true })}>Cancel PR</button>
      </div>}
      <SppmpPart p={p} r={r} edit={edit} />
    </div>
  );
}

/** All 4 steps of one record in a window. */
export function RecordView({ r, onClose }: { r: FullRecord; onClose(): void }) {
  const { m, canEdit, isAdmin, username, editRecord, openPr, openRouting, askStatus, applyRecord, toast } = useProc();
  const edit = canEdit && r.status !== 'CANCELLED';
  const related = findSimilar(m, r.title, r.id, r.officeId);
  const here = related.filter((s) => s.officeId === r.officeId).length;
  const linked = m.all.filter((x) => x.repeatOfId === r.id && isRepeat(x));
  const repeatOf = r.repeatOfId != null ? m.recById.get(r.repeatOfId) : undefined;
  const prs = [...r.prs].sort((a, b) => Number(a.status === 'CANCELLED') - Number(b.status === 'CANCELLED') || a.code.localeCompare(b.code));
  const prName = (id: number | null) => { const p = r.prs.find((x) => x.id === id); return p ? 'PR ' + (p.dtsNo || p.code) : 'Proposal'; };

  async function removeRoute(id: number) {
    if (!confirm('Tanggalin ang routing entry na ito?')) return;
    try {
      const res = await unwrap(api.DELETE('/api/procurement/routing/{entryId}', { params: { path: { entryId: id }, query: { year: m.year } } }));
      applyRecord(res.record, res.budgets);
      toast('Routing entry removed');
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <Modal title={r.code} onClose={onClose} wide footer={<>
      {canEdit && (r.status === 'CANCELLED'
        ? <button className="btn" onClick={() => askStatus({ kind: 'record', record: r, cancel: false })}>Restore procurement</button>
        : <button className="btn" onClick={() => askStatus({ kind: 'record', record: r, cancel: true })}>Cancel procurement</button>)}
      <button className="btn primary" onClick={onClose}>Close</button>
    </>}>
      <div className="vhead"><TypeTag type={r.procType} />{r.status === 'CANCELLED' && <span className="pill gone">Cancelled</span>}</div>
      <CancelInfo c={r.cancel} />

      <div className="vstep">
        <h3><span className="step">1</span> Proposal{edit && <button className="btn small push" onClick={() => { onClose(); editRecord(r.id); }}>Edit</button>}</h3>
        <dl className="kv">
          <Kv k="Title"><b>{r.title}</b></Kv>
          <Kv k="Klase">{PROC_LABEL[r.procType]}</Kv>
          <Kv k={r.procType === 'REPAIR' ? 'Ire-repair' : r.procType === 'EQUIPMENT' ? 'Equipment' : 'Details'}>{r.details && <span className="pre">{r.details}</span>}</Kv>
          <Kv k="Office">{r.office}</Kv>
          <Kv k="Prepared by">{r.preparedBy}</Kv>
          <Kv k="Date received">{fmt(r.dateReceived)}</Kv>
          <Kv k="Documents">
            <div>{hasProposal(r) ? <DocPill name={PROPOSAL_LABEL[r.proposalType]} status={r.proposalStatus} /> : <span className="muted">Walang proposal (PR lang)</span>}</div>
            {r.withAtc && <div><DocPill name="Authority to Conduct" status={r.atcStatus} /></div>}
          </Kv>
          {r.procType === 'EVENT' && <><Kv k="Venue">{r.venue}</Kv><Kv k="Date of event">{range(r.startDate, r.endDate)}</Kv></>}
          {r.procType === 'HIRING' && <Kv k="Contract">{r.startDate && <>{range(r.startDate, r.endDate)} <span className="muted">({contractLength(r.startDate, r.endDate)})</span></>}</Kv>}
          <Kv k="Amount">{r.amount ? '₱' + money(r.amount) : ''}</Kv>
          <Kv k="DTS No.">{r.dtsNo}</Kv>
          <Kv k="Logbook No.">{r.logbookNo}</Kv>
          <Kv k="Repeat">{r.repeatType && <>{REPEAT_LABEL[r.repeatType][0]}{repeatOf && <> of <RecLink id={repeatOf.id} code={repeatOf.code} /></>}{r.repeatNote && ' — ' + r.repeatNote}</>}</Kv>
          <Kv k="Remarks">{r.remarks}</Kv>
          <Kv k="Encoded">{r.encodedBy} · {fmt(r.encodedAt.slice(0, 10))}{r.updatedBy !== r.encodedBy && ' · last edit by ' + r.updatedBy}{r.source && ' · ' + r.source}</Kv>
        </dl>
      </div>

      <div className="vstep">
        <h3><span className="step">2</span> Purchase Request{prs.length > 1 && 's (' + prs.length + ')'}
          {edit && <button className="btn small primary push" onClick={() => { onClose(); openPr(r.id); }}>+ Add PR</button>}</h3>
        {prs.length === 0 && <p className="muted first">Wala pang PR.</p>}
        {prTotal(r) > 0 && <div className="small muted">Total ng PR (hindi kasama ang cancelled): <b>₱{money(prTotal(r))}</b></div>}
        {prs.map((p) => <PrCard key={p.id} p={p} r={r} />)}
      </div>

      <div className="vstep">
        <h3><span className="step">4</span> Routing{edit && <button className="btn small push" onClick={() => openRouting(r, null)}>+ Add entry</button>}</h3>
        {r.routing.length === 0
          ? <p className="muted first">Wala pang routing. Ilagay kung kanino ipinasa o sino ang nag-review, kasama ang petsa at oras.</p>
          : <div className="card flush"><table className="stack">
            <thead><tr><th>Date &amp; time</th><th>Para sa</th><th>Nangyari</th><th>Kanino / sino</th><th>Remarks</th><th /></tr></thead>
            <tbody>
              {r.routing.map((x) => (
                <tr key={x.id}>
                  <td className="nowrap">{fmtDT(x.happenedAt)}</td><td>{prName(x.prId)}</td>
                  <td>{x.action === 'RETURNED' ? <b className="red">{ROUTE_LABEL[x.action]}</b> : ROUTE_LABEL[x.action]}</td>
                  <td><b>{x.person}</b></td>
                  <td>{x.remarks} <span className="small muted">({x.encodedBy})</span></td>
                  <td className="actions">{canEdit && (isAdmin || x.encodedBy === username) &&
                    <button className="btn small" title="Remove (encoded by mistake)" onClick={() => void removeRoute(x.id)}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>}
      </div>

      {linked.length > 0 && <>
        <h3>Inulit / ipinasa ulit bilang</h3>
        <ul className="sim">{linked.map((x) => <li key={x.id}><RecLink id={x.id} code={x.code} /> · {x.title} <span className="small muted">{fmt(x.dateReceived)}</span> <RepeatPill r={x} /></li>)}</ul>
      </>}
      {related.length > 0 && <>
        <h3>Kahawig na records ({here} sa {r.office}, {related.length - here} sa ibang office)</h3>
        <ul className="sim">{related.map((s) => <SimilarItem key={s.id} s={s} mine={s.officeId === r.officeId} />)}</ul>
      </>}
    </Modal>
  );
}
