import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api, unwrap, type Schemas } from '../api/client';
import { useAuth, useMe } from '../auth/AuthContext';
import { ROLE_LABEL } from '../format';
import { ChangePasswordModal } from './ChangePasswordModal';

export type PortalLink = Schemas['LinkView'];
/** What the frame hands to the page inside it (useOutletContext). */
export interface ShellContext { links: PortalLink[]; reloadLinks(): void }

/** The frame around every page: blue bar on top, menu on the left. On a phone the menu opens with ☰. */
export function Shell() {
  const me = useMe();
  const { logout, hasRole } = useAuth();
  const location = useLocation();
  const [links, setLinks] = useState<PortalLink[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [toast, setToast] = useState('');

  const reloadLinks = useCallback(() => {
    unwrap(api.GET('/api/links')).then(setLinks).catch(() => setLinks([]));
  }, []);
  useEffect(reloadLinks, [reloadLinks]);

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const item = (to: string, label: string, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => 'nav' + (isActive ? ' active' : '')}>{label}</NavLink>
  );

  return (
    <>
      <header className="top">
        <button className="menu-btn" aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}>☰</button>
        <h1>FPED <small>Unified System</small></h1>
        <div className="user-box">
          <span className="uname">{me.fullName || me.username} ({ROLE_LABEL[me.role]})</span>
          <button onClick={() => setChangingPassword(true)}>Password</button>
          <button onClick={() => void logout()}>Log out</button>
        </div>
      </header>

      <aside className={menuOpen ? 'open' : ''}>
        {item('/', 'Home', true)}
        <div className="grp">Systems</div>
        {item('/travel-orders', 'Travel Orders')}
        {item('/procurement', 'Procurement')}
        {links.map((l) => l.url
          ? <a key={l.id} className="nav" href={l.url} target="_blank" rel="noopener noreferrer" title={l.description ?? ''}>
              <span className="dot" style={{ background: l.color }} />{l.name}<span className="ext">↗</span>
            </a>
          : <span key={l.id} className="nav disabled" title="An Admin can set the address in Menu links">
              <span className="dot" style={{ background: l.color }} />{l.name}<span className="ext">not set</span>
            </span>)}
        {hasRole('ADMIN', 'ENCODER') && <>
          <div className="grp">Google</div>
          {item('/email', 'Email')}
          {item('/calendar', 'Calendar')}
        </>}
        {hasRole('ADMIN') && <>
          <div className="grp">Admin</div>
          {item('/admin/users', 'Users')}
          {item('/admin/offices', 'Offices')}
          {item('/admin/to-checklist', 'TO checklist')}
          {item('/admin/links', 'Menu links')}
          {item('/admin/audit', 'Audit log')}
        </>}
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <main>
        <Outlet context={{ links, reloadLinks } satisfies ShellContext} />
      </main>

      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)}
        onDone={() => { setChangingPassword(false); setToast('Password changed.'); }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
