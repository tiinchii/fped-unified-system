import { useProc } from './context';
import {
  activePrs, DOC_CLASS, DOC_LABEL, docShort, fmt, fmtDT, hasProposal, isRepeat, PROC_LABEL, prState, REPEAT_LABEL, returnedEntry, whenWhere,
  type DocStatus, type FullRecord, type Pr, type ProcType, type Rec, type Similar,
} from './model';

/** A record ID that opens the record. */
export function RecLink({ id, code }: { id: number; code: string }) {
  const { viewRecord } = useProc();
  return <button type="button" className="link" onClick={() => viewRecord(id)}>{code}</button>;
}

export function TypeTag({ type }: { type: ProcType }) {
  return <span className={'tag ' + type}>{PROC_LABEL[type]}</span>;
}

export function DocPill({ name, status }: { name: string; status: DocStatus | null }) {
  return <span className={'pill ' + (status ? DOC_CLASS[status] : '')}>{name} · {status ? DOC_LABEL[status] : '—'}</span>;
}

/** Received before its fiscal year: e.g. received Nov 2026 for 2027. */
export function EarlyPill({ r }: { r: { early: boolean; fiscalYear: number; dateReceived: string | null } }) {
  if (!r.early) return null;
  return <span className="pill early" title={'Natanggap ' + fmt(r.dateReceived) + ', para sa FY ' + r.fiscalYear}>Early · FY {r.fiscalYear}</span>;
}

export function RepeatPill({ r }: { r: Rec | FullRecord }) {
  const { m } = useProc();
  if (!isRepeat(r) || !r.repeatType) return null;
  const of = r.repeatOfId != null ? m.recById.get(r.repeatOfId) : undefined;
  return <span className="pill rep">{REPEAT_LABEL[r.repeatType][0]}{of ? ' of ' + of.code : ''}</span>;
}

/** "Incomplete – return to office" / "Returned to office Mar 5 2:00 PM" */
export function StateLabel({ p, r }: { p: Pr; r: FullRecord }) {
  const s = prState(p, r);
  if (s === 'Incomplete') return <span className="pill bad">Incomplete – return to office</span>;
  if (s === 'Returned') return <span className="pill bad">Returned to office {fmtDT(returnedEntry(p, r)!.happenedAt).replace(/, \d{4}/, '')}</span>;
  return null;
}

/** The documents of a record and their status, in short pills: AP · for review, ATC · signed, PR · …, SPPMP. */
export function DocPills({ r }: { r: Rec }) {
  const f = r.full;
  if (!f) {
    // short form (another year): only the PRs are known
    return <>{r.prs.map((p) => <span key={p.id} className={'pill' + (p.status === 'CANCELLED' ? ' gone' : '')}>PR{p.status === 'CANCELLED' ? ' cancelled' : ''}</span>)}
      {!r.prs.length && <span className="muted small">no PR</span>}</>;
  }
  return (
    <>
      {hasProposal(f) && <span className={'pill ' + (f.proposalStatus ? DOC_CLASS[f.proposalStatus] : '')} title={DOC_LABEL[f.proposalStatus ?? 'FOR_REVIEW']}>
        {f.proposalType === 'PROJECT_PROPOSAL' ? 'PP' : 'AP'}{docShort(f.proposalStatus)}</span>}
      {f.withAtc && <span className={'pill ' + (f.atcStatus ? DOC_CLASS[f.atcStatus] : '')}>ATC{docShort(f.atcStatus)}</span>}
      {f.prs.map((p) => {
        if (p.status === 'CANCELLED') return <span key={p.id} className="pill gone" title={p.title + ' · ' + p.code}>PR cancelled</span>;
        const s = prState(p, f);
        return (
          <span key={p.id} className="nowrap">
            <span className={'pill ' + (p.prStatus ? DOC_CLASS[p.prStatus] : '')} title={p.code + (p.dtsNo ? ' · DTS ' + p.dtsNo : '')}>PR{docShort(p.prStatus)}</span>
            {p.plan === 'SPPMP' && <span className="pill sppmp">SPPMP</span>}
            {s === 'Incomplete' && <span className="pill bad">Incomplete</span>}
            {s === 'Returned' && <span className="pill bad">Returned</span>}
          </span>
        );
      })}
      {!activePrs(f).length && f.status !== 'CANCELLED' && <span className="muted small">no PR yet</span>}
    </>
  );
}

/** One look-alike record in the repeat warning. */
export function SimilarItem({ s, mine }: { s: Similar; mine: boolean }) {
  const { m } = useProc();
  const r = m.recById.get(s.id);
  const where = r ? whenWhere(r) : '';
  return (
    <li className={mine ? '' : 'other'}>
      <RecLink id={s.id} code={s.code} /> · <b>{s.title}</b>{r && <TypeTag type={r.procType} />}
      {s.matched !== s.title && <div className="small">PR: {s.matched}</div>}
      <div className="small muted">{s.office} · received {fmt(s.dateReceived)}{where && ' · ' + where} · {s.score}% alike</div>
      <div>{s.status === 'CANCELLED' && <span className="pill gone">Cancelled</span>}{r && <DocPills r={r} />} {r && <RepeatPill r={r} />}</div>
    </li>
  );
}

export function NoticeBox({ notice }: { notice: { kind: 'ok' | 'bad' | 'warn' | 'info'; text: string } | null }) {
  return notice ? <div className={'alert ' + notice.kind}>{notice.text}</div> : null;
}
