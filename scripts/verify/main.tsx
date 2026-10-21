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
import AccessPage from '../../src/components/Access/AccessPage';
import MaterialsPage from '../../src/components/Materials/MaterialsPage';
import InprocessPage from '../../src/components/Inprocess/InprocessPage';
import InstrumentsPage from '../../src/components/Floor/InstrumentsPage';
import '../../src/index.css';

const PAGES: Record<string, () => JSX.Element> = {
  'access-control': () => <AccessPage companyId="c1" canDecide />,
  'materials': () => <MaterialsPage companyId="c1" />,
  'in-process': () => <InprocessPage companyId="c1" userId="u1" canDecide />,
  'instruments': () => <InstrumentsPage companyId="c1" />,
};

function Harness() {
  const initial = new URLSearchParams(location.search).get('page') ?? 'materials';
  const [page, setPage] = useState<any>(initial);
  const render = PAGES[page as string];
  return (
    <MainLayout currentPage={page} onNavigate={(p) => setPage(p)}>
      {render ? render() : (
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
