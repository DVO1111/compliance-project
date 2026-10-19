import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/styles/tokens.css';
import MainLayout from '../../src/components/Layout/MainLayout';
import FirstRunDashboard from '../../src/components/Dashboard/FirstRunDashboard';
import ProductsPage from '../../src/components/Products/ProductsPage';
import RecordBanner from '../../src/components/Common/RecordBanner';

const screen = new URLSearchParams(location.search).get('screen') ?? 'dashboard';

//  The five record/banner states, on the light ground they sit on, so
//  they can be compared against the component in Figma side by side.
const banners = (
  <div style={{
    background: 'var(--nv-light-ground)', padding: 24, borderRadius: 16,
    display: 'flex', flexDirection: 'column', gap: 16,
  }}>
    <RecordBanner
      state="compliance_directive"
      title="Compliance directive · review paused, waiting for your response"
      facts={[
        { label: 'Raised at', value: 'Division review' },
        { label: 'Received', value: '02 Oct 2026' },
        { label: 'Response due', value: '16 Oct 2026 · 7 days left' },
        { label: 'Review clock', value: 'Paused 7 days · active 59 days' },
      ]}
      quote={'“Provide long-term stability data covering at least 12 months, and revised label artwork showing the NAFDAC registration number on the principal display panel.”'}
      note="This is not a rejection. When you respond, review resumes at Division review, not from the start."
    />
    <RecordBanner
      state="locked"
      title="Locked · this record was signed and can no longer be changed"
      facts={[
        { label: 'Signed by', value: 'Ada Okafor · Head of Quality' },
        { label: 'Signed at', value: '18 Oct 2026 · 14:22' },
        { label: 'Meaning', value: 'Approved' },
      ]}
      note="Corrections are made by raising a new record that references this one."
    />
    <RecordBanner
      state="returned"
      title="Returned for revision · review resumes where it stopped"
      facts={[
        { label: 'Returned by', value: 'Tunde Bello · QA Reviewer' },
        { label: 'Returned at', value: '17 Oct 2026' },
      ]}
      quote={'“Section 3.2 cites the old specification. Update it and resubmit — the rest is accepted.”'}
    />
    <RecordBanner
      state="changed_after_signing"
      title="Changed after signing · the signature no longer covers this record"
      facts={[
        { label: 'Signed at', value: '18 Oct 2026 · 14:22' },
        { label: 'Changed at', value: '18 Oct 2026 · 16:05' },
      ]}
      note="The record must be signed again before it can move. The earlier signature is kept and marked as superseded."
    />
    <RecordBanner
      state="licence_expired"
      title="Licence expired · this product cannot start a batch"
      facts={[
        { label: 'Licence', value: 'NAFDAC site manufacturing licence' },
        { label: 'Expired', value: '30 Sep 2026' },
        { label: 'Renewal', value: 'Not started' },
      ]}
    />
  </div>
);

const page = screen === 'banners' ? banners
  : screen === 'products'
    ? <ProductsPage companyId="c1" userId="u1" onOpenRegistrations={() => {}} onImportSpreadsheet={() => {}} />
    : <FirstRunDashboard companyId="c1" userId="u1" onAddProduct={() => {}} onImportSpreadsheet={() => {}} onOpenRow={() => {}} />;

createRoot(document.getElementById('root')!).render(
  <MainLayout currentPage={(screen === 'banners' ? 'dashboard' : screen) as any} onNavigate={() => {}}>{page}</MainLayout>,
);
