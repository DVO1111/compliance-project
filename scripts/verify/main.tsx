/**
 * LOCAL VERIFICATION ONLY — never published, never in pages.yml.
 *
 * Renders the REAL MainLayout with the REAL page components against an
 * empty database, so each screen can be photographed in the state a
 * customer's first morning actually produces. Its whole purpose is to
 * answer "does this render, and what does it say when there is nothing
 * to show" without needing the network.
 *
 * ?page=<PageId> picks the screen.
 */
import { createRoot } from 'react-dom/client';
import { StrictMode, useState } from 'react';
import MainLayout from '../../src/components/Layout/MainLayout';
import AccessDenied from '../../src/components/Common/AccessDenied';
import { pageRefused } from '../../src/lib/access/roleAccess';
import { useAuth } from '../../src/contexts/AuthContext';
import AccessPage from '../../src/components/Access/AccessPage';
import MaterialsPage from '../../src/components/Materials/MaterialsPage';
import InprocessPage from '../../src/components/Inprocess/InprocessPage';
import InstrumentsPage from '../../src/components/Floor/InstrumentsPage';
import QaDispositionPage from '../../src/components/Materials/QaDispositionPage';
import GoodsReceiptPage from '../../src/components/Materials/GoodsReceiptPage';
import QcTestingPage from '../../src/components/Materials/QcTestingPage';
import TraceabilityPage from '../../src/components/Materials/TraceabilityPage';
import BatchExecutionPage from '../../src/components/Batch/BatchExecutionPage';
import MyTasksPage from '../../src/components/Tasks/MyTasksPage';
import DispatchPage from '../../src/components/Distribution/DispatchPage';
import QaManagerDashboard from '../../src/components/Dashboard/QaManagerDashboard';
import StorekeeperDashboard from '../../src/components/Dashboard/StorekeeperDashboard';
import DerivedRoleDashboard from '../../src/components/Dashboard/DerivedRoleDashboard';
import { resolveWorkRole } from '../../src/lib/access/roleAccess';
import '../../src/index.css';

const PAGES: Record<string, () => JSX.Element> = {
  'access-control': () => <AccessPage companyId="c1" canDecide />,
  'materials': () => <MaterialsPage companyId="c1" />,
  'in-process': () => <InprocessPage companyId="c1" userId="u1" canDecide />,
  'instruments': () => <InstrumentsPage companyId="c1" />,
};

/** Pages whose behaviour depends on the viewer's role. */
const ROLE_PAGES: Record<string, (role: any) => JSX.Element> = {
  'qa-disposition': (role) => <QaDispositionPage companyId="c1" role={role} />,
  'goods-receipt': (role) => <GoodsReceiptPage companyId="c1" role={role} />,
  'qc-testing': (role) => <QcTestingPage companyId="c1" role={role} />,
  'traceability': () => <TraceabilityPage companyId="c1" />,
  'batch-execution': (role) => <BatchExecutionPage companyId="c1" userId="u1" role={role} />,
  'my-tasks': (role) => <MyTasksPage companyId="c1" role={role} />,
  'dispatch': (role) => <DispatchPage companyId="c1" userId="u1" role={role} />,
};

/** The same role-to-dashboard choice App.tsx makes. */
function DashboardFor({ profile }: { profile: any }) {
  const role = resolveWorkRole(profile);
  const common = { companyId: 'c1', personName: 'Adaeze Okafor', siteName: 'Ikeja plant' };
  if (role === 'qa_manager') return <QaManagerDashboard {...common} role={role} />;
  if (role === 'storekeeper') {
    return <StorekeeperDashboard {...common} role={role} userId="u1" personName="Tunde Bello" />;
  }
  if (role) {
    return <DerivedRoleDashboard {...common} role={role} userId="u1" personName="A. Person" />;
  }
  return <p style={{ fontSize: 15, color: '#5b6472' }}>
    No work role resolves, so the first-run dashboard is shown in the application.
  </p>;
}

function Harness() {
  const initial = new URLSearchParams(location.search).get('page') ?? 'materials';
  const [page, setPage] = useState<any>(initial);
  const render = PAGES[page as string];
  //  THE SAME GUARD App.tsx USES, not a copy of it. Rendering the page
  //  components directly was how this harness reported a Storekeeper
  //  reaching QA disposition as a pass: it never ran the route check,
  //  so it was testing itself rather than the application.
  const { profile } = useAuth();
  const refused = pageRefused(profile, String(page));
  return (
    <MainLayout currentPage={page} onNavigate={(p) => setPage(p)}>
      {refused ? <AccessDenied />
        : page === 'dashboard' ? <DashboardFor profile={profile} />
        : ROLE_PAGES[String(page)] ? ROLE_PAGES[String(page)]!(resolveWorkRole(profile))
        : render ? render() : (
        <p style={{ font: '15px/1.5 system-ui', color: '#5b6472' }}>
          No verification fixture wired for “{String(page)}”. The sidebar is the
          subject here: this pane only renders the four pages built from the
          design file.
        </p>
      )}
    </MainLayout>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><Harness /></StrictMode>,
);
