import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/styles/tokens.css';
import MainLayout from '../../src/components/Layout/MainLayout';
import FirstRunDashboard from '../../src/components/Dashboard/FirstRunDashboard';
import ProductsPage from '../../src/components/Products/ProductsPage';
import RecordBanner from '../../src/components/Common/RecordBanner';
import LifecycleTrack from '../../src/components/Common/LifecycleTrack';

//  RA-02's own track: a NAPAMS application paused by a compliance
//  directive raised at Division review.
const SUBMISSION = [
  { key: 'draft',             label: 'Draft' },
  { key: 'submitted',         label: 'Submitted' },
  { key: 'division_review',   label: 'Division review' },
  { key: 'directive',         label: 'Compliance directive', branch: 'paused' as const, raisedAt: 'division_review' },
  { key: 'lab_testing',       label: 'Lab testing' },
  { key: 'fdrc',              label: 'FDRC committee' },
  { key: 'approved',          label: 'Approved' },
];

const tracks = (
  <div style={{ background: 'var(--nv-light-ground)', padding: 24, borderRadius: 16,
                display: 'flex', flexDirection: 'column', gap: 28 }}>
    <div>
      <p style={{ fontFamily: 'var(--nv-font-mono)', fontSize: 11, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'var(--nv-light-text-tertiary)' }}>
        Paused by a compliance directive
      </p>
      <LifecycleTrack states={SUBMISSION} currentKey="directive" />
    </div>
    <div>
      <p style={{ fontFamily: 'var(--nv-font-mono)', fontSize: 11, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'var(--nv-light-text-tertiary)' }}>
        Mid-review, nothing to collapse
      </p>
      <LifecycleTrack states={SUBMISSION.filter(s => !s.branch)} currentKey="division_review" />
    </div>
    <div>
      <p style={{ fontFamily: 'var(--nv-font-mono)', fontSize: 11, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'var(--nv-light-text-tertiary)' }}>
        Deep in a long lifecycle, both shoulders collapsed
      </p>
      <LifecycleTrack
        states={[...SUBMISSION.filter(s => !s.branch),
                 { key: 'licence_issued', label: 'Licence issued' },
                 { key: 'listed',         label: 'Listed' }]}
        currentKey="fdrc" />
    </div>
    <div>
      <p style={{ fontFamily: 'var(--nv-font-mono)', fontSize: 11, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'var(--nv-light-text-tertiary)' }}>
        Returned for revision (branch)
      </p>
      <LifecycleTrack
        states={[...SUBMISSION.filter(s => !s.branch),
                 { key: 'returned', label: 'Returned', branch: 'returned' as const, raisedAt: 'submitted' }]}
        currentKey="returned" />
    </div>
  </div>
);

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

const page = screen === 'tracks' ? tracks : screen === 'banners' ? banners
  : screen === 'products'
    ? <ProductsPage companyId="c1" userId="u1" onOpenRegistrations={() => {}} onImportSpreadsheet={() => {}} />
    : <FirstRunDashboard companyId="c1" userId="u1" onAddProduct={() => {}} onImportSpreadsheet={() => {}} onOpenRow={() => {}} />;

createRoot(document.getElementById('root')!).render(
  <MainLayout currentPage={((screen === 'banners' || screen === 'tracks') ? 'dashboard' : screen) as any} onNavigate={() => {}}>{page}</MainLayout>,
);
