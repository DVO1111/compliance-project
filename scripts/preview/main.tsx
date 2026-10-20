import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/styles/tokens.css';
import MainLayout from '../../src/components/Layout/MainLayout';
import FirstRunDashboard from '../../src/components/Dashboard/FirstRunDashboard';
import ProductsPage from '../../src/components/Products/ProductsPage';
import RecordBanner from '../../src/components/Common/RecordBanner';
import LifecycleTrack from '../../src/components/Common/LifecycleTrack';
import LockedSectionsCard from '../../src/components/Access/LockedSectionsCard';
import RequestAccessDialog from '../../src/components/Access/RequestAccessDialog';
import AccessRequestsInbox from '../../src/components/Access/AccessRequestsInbox';
import ReviewRequestDrawer from '../../src/components/Access/ReviewRequestDrawer';

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

//  W2-0. The four access screens on one page, with the design's own
//  people and words, so they can be put beside the Figma frames.
//  Fixed "today" so the dates in the dialog do not drift and a
//  screenshot taken next month still matches one taken now.
const TODAY = new Date('2026-10-08T09:00:00Z');

const access = (
  <div style={{ background: 'var(--nv-light-ground)', padding: 24, borderRadius: 16,
                display: 'flex', flexDirection: 'column', gap: 28 }}>
    <LockedSectionsCard
      adminName="Kemi Adewale"
      onRequest={() => {}}
      sections={[
        { section: 'qc_testing',     wouldAllow: 'View results for lots you received', pending: true },
        { section: 'deviation_capa', wouldAllow: 'View deviations linked to your lots' },
        { section: 'audit_trail',    wouldAllow: 'View the history of your records' },
        { section: 'batch_release',  wouldAllow: '' },
      ]}
    />

    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <RequestAccessDialog
        section="qc_testing"
        role="storekeeper"
        roleLabel="Storekeeper"
        scopeOptions={['Lots I received', 'All lots at Ikeja plant']}
        adminName="Kemi Adewale"
        today={TODAY}
        onCancel={() => {}}
        onSend={() => {}}
      />
    </div>

    <AccessRequestsInbox
      oldest="2 hours"
      onReview={() => {}}
      onOpenDecided={() => {}}
      waiting={[
        {
          id: 'r1',
          person: { name: 'Tunde Bello', initials: 'TB', standing: 'Storekeeper · Ikeja plant', role: 'storekeeper' },
          askedAgo: '2 hours ago',
          section: 'qc_testing', level: 'view',
          scope: 'Lots they received', duration: 'Until 31 Oct 2026',
          reason: 'I need to see when sampling is finished so I can plan put-away for the sucrose and maltodextrin lots.',
        },
        {
          id: 'r2',
          person: { name: 'Ifeoma Nwosu', initials: 'IN', standing: 'QC Analyst · Ikeja plant', role: 'qc_analyst' },
          askedAgo: '1 hour ago',
          section: 'qa_disposition', level: 'act',
          scope: 'All lots at Ikeja plant', duration: 'No end date',
          reason: 'Cover for QA while Adaeze is on leave next week.',
        },
        {
          id: 'r3',
          person: { name: 'Musa Danjuma', initials: 'MD', standing: 'Production supervisor · Ikeja', role: 'production_supervisor' },
          askedAgo: '35 min ago',
          section: 'audit_trail', level: 'view',
          scope: 'Batches at Ikeja plant', duration: 'No end date',
          reason: 'I need to check who changed the line-clearance record on IBU-2610-022.',
        },
      ]}
      decided={[
        {
          id: 'd1',
          person: { name: 'Bisi Afolabi', initials: 'BA', standing: 'Procurement' },
          section: 'deviation_capa', level: 'view',
          decision: { kind: 'grant_with_limits', level: 'view',
                      scope: 'Supplier-related deviations only', until: '2026-12-31',
                      note: 'Supplier-related deviations only, until the end of the year.' },
          by: 'K. Adewale · 7 Oct',
        },
        {
          id: 'd2',
          person: { name: 'Femi Ojo', initials: 'FO', standing: 'Production operator' },
          section: 'material_lots', level: 'act',
          decision: { kind: 'decline',
                      reason: 'Issuing material is a Storekeeper task. Ask Tunde to issue lots.' },
          by: 'K. Adewale · 6 Oct',
        },
      ]}
    />

    {/*  Two drawers side by side: the design's clean request, and the
        conflicting one, which is the case the screenshot does not show
        and the one the rule exists for. */}
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      {([
        ['Clean request · narrowing offered', {
          reference: 'REQ-0193', askedAgo: 'Requested 2 hours ago',
          person: { name: 'Tunde Bello', initials: 'TB',
                    standing: 'Storekeeper · Ikeja plant · since March 2024',
                    role: 'storekeeper' as const, roleLabel: 'Storekeeper' },
          request: { section: 'qc_testing' as const, level: 'view' as const,
                     scope: 'Lots they received', until: '2026-10-31',
                     reason: 'I need to see when sampling is finished so I can plan put-away for the sucrose and maltodextrin lots.' },
          scopeOptions: ['Lots they received', 'All lots'] as [string, string],
          context: { site: 'Ikeja plant', sectionEnabledAtSite: true, existingGrant: null },
        }],
        ['Duties conflict · Act refused', {
          reference: 'REQ-0194', askedAgo: 'Requested 1 hour ago',
          person: { name: 'Ifeoma Nwosu', initials: 'IN',
                    standing: 'QC Analyst · Ikeja plant · since July 2023',
                    role: 'qc_analyst' as const, roleLabel: 'QC Analyst' },
          request: { section: 'qa_disposition' as const, level: 'act' as const,
                     scope: 'All lots at Ikeja plant', until: null,
                     reason: 'Cover for QA while Adaeze is on leave next week.' },
          scopeOptions: ['Lots they tested', 'All lots at Ikeja plant'] as [string, string],
          context: { site: 'Ikeja plant', sectionEnabledAtSite: true, existingGrant: null },
        }],
      ] as const).map(([caption, pending]) => (
        <div key={caption} style={{ flex: 1, minWidth: 360 }}>
          <p style={{ fontFamily: 'var(--nv-font-mono)', fontSize: 11, letterSpacing: '0.06em',
                      textTransform: 'uppercase', color: 'var(--nv-light-text-tertiary)' }}>
            {caption}
          </p>
          <div style={{ height: 760, border: '1px solid var(--nv-light-border)', borderRadius: 12,
                        overflow: 'hidden', display: 'flex' }}>
            <ReviewRequestDrawer
              pending={pending}
              today={TODAY}
              onClose={() => {}}
              onDecide={() => {}}
            />
          </div>
        </div>
      ))}
    </div>
  </div>
);

const page = screen === 'access' ? access
  : screen === 'tracks' ? tracks : screen === 'banners' ? banners
  : screen === 'products'
    ? <ProductsPage companyId="c1" userId="u1" onOpenRegistrations={() => {}} onImportSpreadsheet={() => {}} />
    : <FirstRunDashboard companyId="c1" userId="u1" onAddProduct={() => {}} onImportSpreadsheet={() => {}} onOpenRow={() => {}} />;

createRoot(document.getElementById('root')!).render(
  <MainLayout currentPage={((screen === 'banners' || screen === 'tracks') ? 'dashboard' : screen) as any} onNavigate={() => {}}>{page}</MainLayout>,
);
