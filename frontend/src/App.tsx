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
import { UsersPage } from './pages/UsersPage';

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
        <Route path="travel-orders" element={<ComingSoonPage title="Travel Orders" phase="Phase 2" items={[
          'Encode a travel order with its travelers, dates, DTS No. and TO No.',
          'Warn when a traveler already has travel on the same dates (overlap check)',
          'Catch the same person typed two ways (duplicate names)',
          'Reschedule, cancel and restore, with the history kept',
        ]} />} />
        <Route path="procurement" element={<ComingSoonPage title="Procurement" phase="Phase 3" items={[
          'Step 1 Proposal, Step 2 Purchase Request, Step 3 SPPMP, Step 4 Routing',
          'Flag a PR with missing attachments: "Incomplete – return to office"',
          'Budget per office per year, reduced by each PR',
          'Warn when an activity looks like an earlier one (repeat check)',
        ]} />} />
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
        <Route path="admin/links" element={<Only roles={['ADMIN']}><LinksPage /></Only>} />
        <Route path="admin/audit" element={<Only roles={['ADMIN']}><AuditPage /></Only>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
