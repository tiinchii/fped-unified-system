import { Link, useOutletContext } from 'react-router-dom';
import { useAuth, useMe } from '../auth/AuthContext';
import type { ShellContext } from '../components/Shell';
import { useEffect, useState } from 'react';
import { api, unwrap, type Schemas } from '../api/client';
import { manilaHour, todayLong } from '../format';

interface Module { to: string; name: string; text: string; color: string; phase?: string }

const MODULES: Module[] = [
  { to: '/travel-orders', name: 'Travel Orders', text: 'Check TOs before signing: overlaps, duplicates, reschedules', color: '#1f4e79' },
  { to: '/procurement', name: 'Procurement', text: 'Proposals, PRs, SPPMP, routing and budgets', color: '#7d3c98', phase: 'Phase 3' },
];
const GOOGLE: Module[] = [
  { to: '/email', name: 'Email', text: 'Office inbox: read, label and print', color: '#c0392b', phase: 'Phase 4' },
  { to: '/calendar', name: 'Calendar', text: 'Office calendar: add, edit and delete events', color: '#1e8449', phase: 'Phase 4' },
];

export function HomePage() {
  const me = useMe();
  const { hasRole } = useAuth();
  const { links } = useOutletContext<ShellContext>();
  const hour = manilaHour();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const [travel, setTravel] = useState<Schemas['Summary'] | null>(null);
  useEffect(() => { unwrap(api.GET('/api/travel/summary')).then(setTravel).catch(() => setTravel(null)); }, []);
  const modules = hasRole('ADMIN', 'ENCODER') ? [...MODULES, ...GOOGLE] : MODULES;

  return (
    <>
      <h2>{greeting}, {(me.fullName || me.username).split(' ')[0]}</h2>
      <p className="sub">{todayLong()}</p>

      <div className="alert">
        The portal is being built in phases. Travel Orders is ready to try; the other modules open as each phase is
        finished. Until the data is moved (go-live), keep using the current Travel Order and Procurement apps for real records.
      </div>

      {travel && <>
        <h3>Travel today</h3>
        <div className="stats">
          <Link to="/travel-orders" className="stat"><b>{travel.onTravelToday}</b><span>On travel today</span></Link>
          <Link to="/travel-orders" className="stat"><b>{travel.startingIn7Days}</b><span>Travel orders starting in the next 7 days</span></Link>
          <Link to="/travel-orders" className={'stat' + (travel.withoutToNo ? ' amber' : '')}><b>{travel.withoutToNo}</b><span>Travel orders without a TO No.</span></Link>
        </div>
      </>}

      <h3>Systems</h3>
      <div className="tiles">
        {modules.map((m) => (
          <Link key={m.to} to={m.to} className="tile" style={{ ['--c' as string]: m.color }}>
            <b>{m.name}</b><span>{m.text}</span>{m.phase && <em className="pill warn">{m.phase}</em>}
          </Link>
        ))}
        {links.map((l) => l.url
          ? <a key={l.id} className="tile" style={{ ['--c' as string]: l.color }} href={l.url} target="_blank" rel="noopener noreferrer">
              <b>{l.name} ↗</b><span>{l.description || 'Opens in a new tab'}</span>
            </a>
          : <div key={l.id} className="tile off" style={{ ['--c' as string]: l.color }}>
              <b>{l.name}</b><span>{l.description || ''}</span><em className="pill warn">address not set</em>
            </div>)}
      </div>
    </>
  );
}
