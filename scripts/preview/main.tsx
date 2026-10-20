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
import RolesMatrix from '../../src/components/Access/RolesMatrix';
import PersonAccessPanel from '../../src/components/Access/PersonAccessPanel';
import ReleaseReadinessCard from '../../src/components/Materials/ReleaseReadinessCard';
import QuarantineBanner from '../../src/components/Materials/QuarantineBanner';
import StateBadge from '../../src/components/Common/StateBadge';
import { summarise } from '../../src/lib/materials/releaseReadiness';

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

//  PM-03 and PM-04, with the design's own roles and people.
const roles = (
  <div style={{ background: 'var(--nv-light-ground)', padding: 24, borderRadius: 16,
                display: 'flex', flexDirection: 'column', gap: 28 }}>
    <RolesMatrix
      onOpenApprovalRules={() => {}}
      sections={['material_lots', 'qc_testing', 'qa_disposition', 'batch_records',
                 'batch_release', 'deviation_capa', 'audit_trail']}
      roles={[
        { role: 'procurement', peopleCount: 4,
          access: { material_lots: 'view', deviation_capa: 'view' } },
        { role: 'storekeeper', peopleCount: 6,
          access: { material_lots: 'act', batch_records: 'view' } },
        { role: 'qc_analyst', peopleCount: 5,
          access: { material_lots: 'view', qc_testing: 'act', deviation_capa: 'act' } },
        { role: 'qa_officer', peopleCount: 3,
          access: { material_lots: 'view', qc_testing: 'view', qa_disposition: 'act',
                    batch_records: 'view', deviation_capa: 'act' } },
        { role: 'qa_manager', peopleCount: 2,
          access: { material_lots: 'view', qc_testing: 'view', qa_disposition: 'act',
                    batch_records: 'view', batch_release: 'act', deviation_capa: 'act',
                    audit_trail: 'view' } },
        { role: 'production_supervisor', peopleCount: 7,
          access: { material_lots: 'view', batch_records: 'act', deviation_capa: 'act' } },
        { role: 'compliance_admin', peopleCount: 1,
          access: { material_lots: 'view', qc_testing: 'view', batch_records: 'view',
                    deviation_capa: 'view', audit_trail: 'view' } },
      ]}
      steps={[
        { step: 'Release a batch',  whoCanDoIt: 'QA Manager (QA release role)', needs: 'signature' },
        { step: 'Material disposition', whoCanDoIt: 'QA Officer, QA Manager',   needs: 'signature' },
        { step: 'Close a deviation', whoCanDoIt: 'QA Officer, QA Manager' },
        { step: 'Approve a supplier', whoCanDoIt: 'QA Manager',                 needs: 'signature' },
        { step: 'Change roles and permissions', whoCanDoIt: 'Compliance admin', needs: 'logged' },
      ]}
    />

    <PersonAccessPanel
      today={TODAY}
      person={{ name: 'Tunde Bello', initials: 'TB', role: 'storekeeper',
                standing: 'Storekeeper · Ikeja plant · joined March 2024', peopleInRole: 6 }}
      roleAccess={[
        { section: 'material_lots',  level: 'act' },
        { section: 'batch_records',  level: 'view' },
        { section: 'deviation_capa', level: 'view', restrictedFrom: 'act' },
        { section: 'qc_testing' },
        { section: 'qa_disposition' },
      ]}
      extraGrants={[{
        id: 'g1', section: 'qc_testing', level: 'view',
        scope: 'Lots they received', until: '2026-10-20',
        provenance: 'Granted with limits by K. Adewale · 8 Oct, 11:02 · REQ-0193',
      }]}
      restrictions={[{
        id: 'x1', section: 'deviation_capa', from: 'act', to: 'view', until: '2026-10-15',
        reason: 'Stock count investigation at store B.',
        setBy: 'Set by K. Adewale · 5 Oct, 16:40',
      }]}
      history={[
        { at: '8 Oct 2026 · 11:02', what: 'Granted QC testing (View), with limits',
          detail: 'Until 20 Oct; asked for 31 Oct · K. Adewale' },
        { at: '8 Oct 2026 · 10:14', what: 'Asked for QC testing (View)',
          detail: '“I need to see when sampling is finished…” · T. Bello' },
        { at: '5 Oct 2026 · 16:40', what: 'Restricted Deviation / CAPA to View',
          detail: 'Until 15 Oct · K. Adewale' },
        { at: '12 Mar 2024 · 09:00', what: 'Role assigned: Storekeeper',
          detail: 'Ikeja plant · K. Adewale' },
      ]}
      onOpenRole={() => {}} onChangeRole={() => {}}
      onRestrict={() => {}} onRevoke={() => {}} onLiftRestriction={() => {}}
    />
  </div>
);

//  W4·15. MT-06's release readiness in both states, the quarantine
//  banner, and the new badge beside the one it must not be mistaken
//  for. The conditions are the design's own worked example.
const MT06 = [
  { key: 'certificate_verified', met: false, blocking: true, sortOrder: 10,
    title: 'Supplier certificate not verified',
    detail: '2 discrepancies: 4-aminophenol stated 62 ppm against ≤ 50 ppm (our result 38 ppm), '
      + 'and particle size not on the certificate. You review and verify it (D2.6).',
    waitingOn: 'WAITING ON YOU' },
  { key: 'tests_complete', met: false, blocking: true, sortOrder: 20,
    title: '1 test incomplete: total aerobic microbial count',
    detail: 'Incubating since 11 Oct. Read due 15 Oct 2026. Release needs every test complete '
      + 'and passing (D2.5).',
    waitingOn: 'WAITING ON QC · S. BAKARE' },
  { key: 'tests_passed', met: true, blocking: true, sortOrder: 30,
    title: '6 of 7 tests passed',
    detail: 'Identity, assay, 4-aminophenol, loss on drying, sulphated ash, particle size',
    waitingOn: null },
  { key: 'sampling_recorded', met: true, blocking: false, sortOrder: 40,
    title: 'Sampling recorded',
    detail: 'SMP-26-0233 · 11 Oct 2026 · 6 of 20 containers', waitingOn: null },
  { key: 'supplier_approved', met: true, blocking: false, sortOrder: 50,
    title: 'Supplier approved',
    detail: 'Kemchem Pharma · qualified to 30 Jun 2027', waitingOn: null },
  { key: 'within_dating', met: true, blocking: false, sortOrder: 60,
    title: 'Within expiry and retest',
    detail: 'Retest 09 Oct 2028 · expiry 11 Sep 2029', waitingOn: null },
  { key: 'qa_release_role', met: true, blocking: true, sortOrder: 70,
    title: 'You hold the QA release role',
    detail: 'Head of Quality · release needs your signature (D2.7)', waitingOn: null },
];

//  What each condition reads as once it passes. In the real screen
//  these come from material_lot_release_conditions, which words a met
//  condition differently from a blocking one.
const MET_TITLES: Record<string, string> = {
  certificate_verified: 'Supplier certificate verified',
  tests_complete: '7 required tests performed',
};
const MET_DETAILS: Record<string, string> = {
  certificate_verified: '1 certificate checked against the internal specification.',
  tests_complete: 'Every test the specification requires has a result.',
};

const label = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 11, letterSpacing: '0.06em',
  textTransform: 'uppercase' as const, color: 'var(--nv-light-text-tertiary)',
};

const materials = (
  <div style={{ background: 'var(--nv-light-ground)', padding: 24, borderRadius: 16,
                display: 'flex', flexDirection: 'column', gap: 28 }}>
    <QuarantineBanner since="10 Oct 2026 · 2 days" nextStep="QC records sampling, then tests." />

    {/*  The two badges side by side. The design's NOT DONE IF is that
        they must be distinct in greyscale too, so this pairing is the
        thing to look at. */}
    <div>
      <p style={label}>Quarantine must not read as On hold</p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <StateBadge state="quarantine">Quarantined</StateBadge>
        <StateBadge state="on_hold">On hold</StateBadge>
        <StateBadge state="pending">Under test</StateBadge>
        <StateBadge state="released">Released</StateBadge>
        <StateBadge state="rejected">Rejected</StateBadge>
      </div>
    </div>

    <div>
      <p style={label}>MT-06 · blocked, every condition shown before the attempt</p>
      <ReleaseReadinessCard readiness={summarise(MT06)} onAct={() => {}} />
    </div>

    {/*  The met variant uses the titles the database returns once a
        condition passes, not the blocked titles with a tick: "Supplier
        certificate verified", not "Supplier certificate not verified
        · MET". */}
    <div>
      <p style={label}>MT-07 · all conditions met</p>
      <ReleaseReadinessCard
        readiness={summarise(MT06.map((c) => ({
          ...c, met: true, waitingOn: null,
          title: MET_TITLES[c.key] ?? c.title,
          detail: MET_DETAILS[c.key] ?? c.detail,
        })))}
        onAct={() => {}} />
    </div>

    <div>
      <p style={label}>Readiness gap that does not stop release</p>
      <ReleaseReadinessCard
        readiness={summarise(MT06.map((c) => ({
          ...c,
          met: c.key !== 'sampling_recorded',
          waitingOn: c.key === 'sampling_recorded' ? 'WAITING ON QC' : null,
          title: c.key === 'sampling_recorded' ? 'No sampling record'
            : MET_TITLES[c.key] ?? c.title,
          detail: c.key === 'sampling_recorded'
            ? 'Results have no recorded sampling behind them. Record how the lot was sampled.'
            : MET_DETAILS[c.key] ?? c.detail,
        })))}
        onAct={() => {}} />
    </div>
  </div>
);

const page = screen === 'materials' ? materials
  : screen === 'roles' ? roles
  : screen === 'access' ? access
  : screen === 'tracks' ? tracks : screen === 'banners' ? banners
  : screen === 'products'
    ? <ProductsPage companyId="c1" userId="u1" onOpenRegistrations={() => {}} onImportSpreadsheet={() => {}} />
    : <FirstRunDashboard companyId="c1" userId="u1" onAddProduct={() => {}} onImportSpreadsheet={() => {}} onOpenRow={() => {}} />;

createRoot(document.getElementById('root')!).render(
  <MainLayout currentPage={(['banners','tracks','access','roles','materials'].includes(screen) ? 'dashboard' : screen) as any} onNavigate={() => {}}>{page}</MainLayout>,
);
