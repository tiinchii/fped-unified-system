import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Role } from './api/client';
import { useAuth } from './auth/AuthContext';
import { Shell } from './components/Shell';
import { AuditPage } from './pages/AuditPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { HomePage } from './pages/HomePage';
import { LinksPage } from './pages/LinksPage';
import { LoginPage } from './pages/LoginPage';
import { OfficesPage } from './pages/OfficesPage';
import { UsersPage } from './pages/UsersPage';
import { ProcurementPage } from './procurement/ProcurementPage';
import { TravelPage } from './travel/TravelPage';

/** Hides a page from roles that may not use it. The server checks the role again on every request. */
function Only({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { hasRole } = useAuth();
  return hasRole(...roles) ? <>{children}</> : <Navigate to="/" replace />;
}

export function App() {
  const { me } = useAuth();
  if (me === undefined) return <div className="loading">Loading…</div>;
  if (me === null) return <LoginPage />;

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="travel-orders" element={<TravelPage />} />
        <Route path="procurement" element={<ProcurementPage />} />
        <Route path="email" element={<Only roles={['ADMIN', 'ENCODER']}><ComingSoonPage title="Email" phase="Phase 4" items={[
          'Read the office inbox, with attachments',
          'Add and remove labels, filter by label',
          'Print an email',
          'Make a calendar event from an email ("Gawing event")',
        ]} /></Only>} />
        <Route path="calendar" element={<Only roles={['ADMIN', 'ENCODER']}><ComingSoonPage title="Calendar" phase="Phase 4" items={[
          'Month and week view of the office calendar',
          'Add, edit and delete events; they show in Google Calendar too',
        ]} /></Only>} />
        <Route path="admin/users" element={<Only roles={['ADMIN']}><UsersPage /></Only>} />
        <Route path="admin/offices" element={<Only roles={['ADMIN']}><OfficesPage /></Only>} />
        <Route path="admin/links" element={<Only roles={['ADMIN']}><LinksPage /></Only>} />
        <Route path="admin/audit" element={<Only roles={['ADMIN']}><AuditPage /></Only>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
