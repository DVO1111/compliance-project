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
import StageParameterRow from '../../src/components/Formula/StageParameterRow';
import VersionComparison from '../../src/components/Formula/VersionComparison';
import StageStrip from '../../src/components/Batch/StageStrip';
import SignOffPair from '../../src/components/Batch/SignOffPair';
import CorrectionRecord from '../../src/components/Batch/CorrectionRecord';
import FloorNotice from '../../src/components/Floor/FloorNotice';
import ApprovedLotPicker from '../../src/components/Floor/ApprovedLotPicker';
import ZoneChip, { ZoneKeyCard } from '../../src/components/Inprocess/ZoneChip';
import SampleDuePrompt from '../../src/components/Inprocess/SampleDuePrompt';
import ReadingEntry from '../../src/components/Inprocess/ReadingEntry';
import SupervisorDecision from '../../src/components/Inprocess/SupervisorDecision';
import YieldAccountCard from '../../src/components/Yield/YieldAccountCard';
import type { ZoneBand, ZoneOrNone } from '../../src/lib/inprocess/zones';
import type { AccountLine } from '../../src/lib/yield/yieldAccount';
import RaiseDeviationSheet from '../../src/components/Deviations/RaiseDeviationSheet';
import RootCausePanel from '../../src/components/Deviations/RootCausePanel';
import InvestigationPanel from '../../src/components/Deviations/InvestigationPanel';
import DeviationRegister from '../../src/components/Deviations/DeviationRegister';
import DeviationOnRecord from '../../src/components/Deviations/DeviationOnRecord';
import { emptyDraft, type ImpactOption } from '../../src/lib/deviations/raise';
import type {
  RootCauseAnalysis, ReadinessCondition, RegisterRow, Investigation,
} from '../../src/lib/deviations/investigation';

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

//  W4·16. The parameter rows of one stage — both types, critical and
//  not, locked and not — and the v3 → v4 comparison.
const formula = (
  <div style={{ background: 'var(--nv-light-ground)', padding: 24, borderRadius: 16,
                display: 'flex', flexDirection: 'column', gap: 28 }}>
    <div>
      <p style={label}>Stage 7 · Compression — parameters, both types</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <StageParameterRow showRecording parameter={{
          parameter: 'Pre-compression force', parameterType: 'machine_setting',
          unit: 'kN', targetValue: 3.0, minValue: 2.0, maxValue: 4.0,
          isCritical: true, samplingIntervalMinutes: null }} />
        <StageParameterRow showRecording parameter={{
          parameter: 'Main compression force', parameterType: 'machine_setting',
          unit: 'kN', targetValue: 12.0, minValue: 10.0, maxValue: 14.0,
          samplingIntervalMinutes: null }} />
        <StageParameterRow showRecording parameter={{
          parameter: 'Turret speed', parameterType: 'machine_setting',
          unit: 'rpm', targetValue: 30, minValue: 25, maxValue: 35,
          samplingIntervalMinutes: null }} />
        <StageParameterRow showRecording parameter={{
          parameter: 'Tablet mass', parameterType: 'product_attribute',
          unit: 'mg', targetValue: 550, minValue: 530, maxValue: 570,
          samplingIntervalMinutes: 30 }} />
        <StageParameterRow showRecording parameter={{
          parameter: 'Hardness', parameterType: 'product_attribute',
          unit: 'N', targetValue: 80, minValue: 60, maxValue: 100,
          samplingIntervalMinutes: 60 }} />
        <StageParameterRow showRecording locked parameter={{
          parameter: 'Appearance', parameterType: 'product_attribute',
          targetText: 'White, biconvex, scored', minValue: null, maxValue: null,
          samplingIntervalMinutes: 60 }} />
      </div>
    </div>

    <VersionComparison
      fromVersion="3" toVersion="4"
      differences={[
        { stageCode: 'DRY', stageName: 'Dry blending', sequenceNo: 2, scope: 'stage',
          change: 'changed', item: 'Dry blending', field: 'name',
          oldValue: 'Dry mixing', newValue: 'Dry blending', sortOrder: 10 },
        { stageCode: 'GRAN', stageName: 'Wet granulation', sequenceNo: 3, scope: 'stage',
          change: 'changed', item: 'Wet granulation', field: 'equipment',
          oldValue: 'Granulator 1', newValue: 'Granulator 2', sortOrder: 10 },
        { stageCode: 'COMP', stageName: 'Compression', sequenceNo: 7, scope: 'parameter',
          change: 'changed', item: 'Pre-compression force', field: 'limits',
          oldValue: '3.0 kN · 2.0 – 4.0 · critical',
          newValue: '3.0 kN · 2.5 – 3.5 · critical', sortOrder: 20 },
        { stageCode: 'COMP', stageName: 'Compression', sequenceNo: 7, scope: 'parameter',
          change: 'changed', item: 'Tablet mass', field: 'sampling_interval_minutes',
          oldValue: '550 mg · 530 – 570 · every 30 min',
          newValue: '550 mg · 530 – 570 · every 15 min', sortOrder: 20 },
        { stageCode: 'COMP', stageName: 'Compression', sequenceNo: 7, scope: 'parameter',
          change: 'added', item: 'Hardness', field: null,
          oldValue: null, newValue: '80 N · 60 – 100 · every 60 min', sortOrder: 20 },
        { stageCode: 'SCRN', stageName: 'Screening', sequenceNo: 5, scope: 'stage',
          change: 'removed', item: 'Screening', field: null,
          oldValue: 'stage 5', newValue: null, sortOrder: 10 },
        { stageCode: null, stageName: null, sequenceNo: null, scope: 'material',
          change: 'changed', item: 'Maize starch BP', field: 'quantity_per_batch',
          oldValue: '18.00 kg · ± 1.0 %', newValue: '20.00 kg · ± 1.0 %', sortOrder: 30 },
        { stageCode: null, stageName: null, sequenceNo: null, scope: 'formula',
          change: 'changed', item: 'Yield range', field: 'yield_range',
          oldValue: '95 – 101', newValue: '96 – 101', sortOrder: 2 },
      ]}
    />

    <div>
      <p style={label}>Two versions with nothing between them</p>
      <VersionComparison fromVersion="4" toVersion="4" differences={[]} />
    </div>
  </div>
);

//  W4·17. The strip with a locked stage that says why, the two
//  signature cards in all three states, and a correction with the
//  original kept beside the new value.
const STAGES = [
  { stageId: 's1', sequenceNo: 1, name: 'Dispensing', status: 'complete',
    state: 'done' as const, waitingFor: null, requiresVerifier: false,
    signedByOperator: true, signedByVerifier: false,
    readingsTotal: 3, readingsRecorded: 3, readingsOutOfSpec: 0 },
  { stageId: 's2', sequenceNo: 2, name: 'Wet granulation', status: 'awaiting_verification',
    state: 'current' as const, waitingFor: null, requiresVerifier: true,
    signedByOperator: true, signedByVerifier: false,
    readingsTotal: 4, readingsRecorded: 4, readingsOutOfSpec: 1 },
  { stageId: 's3', sequenceNo: 3, name: 'Drying', status: 'pending',
    state: 'locked' as const,
    waitingFor: 'Waiting for stage 2, Wet granulation, which is awaiting verification.',
    requiresVerifier: false, signedByOperator: false, signedByVerifier: false,
    readingsTotal: 2, readingsRecorded: 0, readingsOutOfSpec: 0 },
  { stageId: 's4', sequenceNo: 4, name: 'Compression', status: 'pending',
    state: 'locked' as const,
    waitingFor: 'Waiting for stage 2, Wet granulation, which is awaiting verification.',
    requiresVerifier: true, signedByOperator: false, signedByVerifier: false,
    readingsTotal: 6, readingsRecorded: 0, readingsOutOfSpec: 0 },
];

const batch = (
  <div style={{ background: 'var(--nv-light-ground)', padding: 24, borderRadius: 16,
                display: 'flex', flexDirection: 'column', gap: 28 }}>
    <div>
      <p style={label}>BR-02 · the strip — every locked stage says what it waits for</p>
      <StageStrip stages={STAGES} activeStageId="s2" onOpen={() => {}} />
    </div>

    <div>
      <p style={label}>BR-04 · operator signed, waiting for the verifier (seen by the operator)</p>
      <SignOffPair
        requiresVerifier
        viewerIsOperator
        operator={{ name: 'Musa Danjuma', standing: 'Production operator · Line 2',
                    signedAt: '12 Oct 2026 · 14:22', meaning: 'Authored' }}
        verifier={null}
        onVerify={() => {}} />
    </div>

    <div>
      <p style={label}>BR-04 · the same stage, seen by somebody who may verify it</p>
      <SignOffPair
        requiresVerifier
        operator={{ name: 'Musa Danjuma', standing: 'Production operator · Line 2',
                    signedAt: '12 Oct 2026 · 14:22', meaning: 'Authored' }}
        verifier={null}
        onVerify={() => {}} />
    </div>

    <div>
      <p style={label}>BR-05 · both signed — the two records must not look alike</p>
      <SignOffPair
        requiresVerifier
        operator={{ name: 'Musa Danjuma', standing: 'Production operator · Line 2',
                    signedAt: '12 Oct 2026 · 14:22', meaning: 'Authored' }}
        verifier={{ name: 'Ifeoma Nwosu', standing: 'QC Analyst · Ikeja plant',
                    signedAt: '12 Oct 2026 · 14:31', meaning: 'Witnessed' }} />
    </div>

    <div>
      <p style={label}>BR-06 · a correction keeps the original</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <CorrectionRecord correction={{
          parameterName: 'Tablet mass', unit: 'mg',
          originalValue: '520', newValue: '548',
          reason: 'Balance was reading against the previous tare. Re-weighed on balance BAL-03.',
          correctedBy: 'M. Danjuma', correctedAt: '12 Oct 2026 · 15:40',
          attachment: 'bal-03-printout.jpg' }} />
        <CorrectionRecord correction={{
          parameterName: 'Granulation endpoint', unit: 'A',
          originalValue: '5.1', newValue: '5.4',
          reason: 'Transcribed from the wrong line of the chart recorder.',
          correctedBy: 'M. Danjuma', correctedAt: '11 Oct 2026 · 09:12',
          resigned: true }} />
      </div>
    </div>
  </div>
);

//  W4·18. The two treatments beside each other, which is the only
//  way to see whether the rule holds: flagged must never read as a
//  stop, blocked must never read as a warning.
const floor = (
  <div style={{ background: 'var(--nv-light-ground)', padding: 24, borderRadius: 16,
                display: 'flex', flexDirection: 'column', gap: 28 }}>
    <div>
      <p style={label}>LC-02 · blocked — solid red, ✕, "can't", no way past it</p>
      <FloorNotice
        condition={{ key: 'line_blocked', severity: 'blocked',
          title: 'Line TL-2 is blocked',
          detail: 'A changeover verification failed: residue found on the hopper outlet. '
            + 'The line stays blocked until a passing verification is recorded — it cannot '
            + 'be overridden here.',
          continueWith: null, sortOrder: 5 }}
        nextSteps={
          <ul style={{ margin: 0, paddingLeft: 18, color: '#ffffff', fontSize: 14, lineHeight: '22px' }}>
            <li>Re-clean the line to the changeover SOP.</li>
            <li>QC takes a new swab and records the result.</li>
            <li>Start a fresh line clearance once it passes.</li>
          </ul>
        } />
    </div>

    <div>
      <p style={label}>DS-03 · blocked — names the instrument, the date, and what removes it</p>
      <FloorNotice
        condition={{ key: 'instrument_unusable', severity: 'blocked',
          title: 'Balance BAL-02 cannot be used',
          detail: 'BAL-02 went out of calibration on 08 Oct 2026 and cannot be used until it '
            + 'is recalibrated. The weight you read is not lost — it has not been recorded '
            + 'against the batch.',
          continueWith: null, sortOrder: 10 }}
        nextSteps={
          <ul style={{ margin: 0, paddingLeft: 18, color: '#ffffff', fontSize: 14, lineHeight: '22px' }}>
            <li>Switch to BAL-03, calibrated to 14 Feb 2027, and weigh again.</li>
            <li>Notify S. Bakare, who owns BAL-02.</li>
          </ul>
        } />
    </div>

    <div>
      <p style={label}>DS-02 · flagged — amber, info, "you can continue with…"</p>
      <FloorNotice
        condition={{ key: 'out_of_tolerance', severity: 'flagged',
          title: 'Outside tolerance',
          detail: '26.0 kg weighed against 24.0 kg ± 2 %. The allowed range is 23.52 to '
            + '24.48 kg.',
          continueWith: 'A supervisor signing in here, with a reason. The weight is recorded '
            + 'as it was read, not adjusted.',
          sortOrder: 20 }}
        action={{ label: 'Get authorisation', onAct: () => {} }} />
    </div>

    <div>
      <p style={label}>CAL · flagged — due soon, readings still valid</p>
      <FloorNotice
        condition={{ key: 'calibration_due_soon', severity: 'flagged',
          title: 'Balance BAL-03 is due for calibration',
          detail: 'Calibration runs out on 14 Nov 2026, in 25 days. Readings taken until then '
            + 'are valid.',
          continueWith: 'Nothing — the instrument is still in calibration. Book it in before '
            + 'the date to avoid a stoppage.',
          sortOrder: 20 }} />
    </div>

    <div>
      <p style={label}>A malformed flagged condition degrades to blocked rather than promising nothing</p>
      <FloorNotice
        condition={{ key: 'broken', severity: 'flagged',
          title: 'Something the database flagged without saying how to continue',
          detail: 'This renders as blocked on purpose. "You can continue with:" followed by '
            + 'nothing is worse than no distinction at all, because it looks right.',
          continueWith: null, sortOrder: 30 }} />
    </div>

    <div>
      <p style={label}>DS-01 · the picker lists approved lots only</p>
      <ApprovedLotPicker
        materialName="Paracetamol BP"
        selectedLotId="l2"
        onSelect={() => {}}
        lots={[
          { lotId: 'l1', lotNumber: 'ML-2609-031', quantityAvailable: 42,
            unitOfMeasure: 'kg', retestDueDate: '2027-03-09', supplierExpiryDate: '2029-01-11' },
          { lotId: 'l2', lotNumber: 'ML-2610-028', quantityAvailable: 150,
            unitOfMeasure: 'kg', retestDueDate: '2028-10-09', supplierExpiryDate: '2029-09-11' },
          { lotId: 'l3', lotNumber: 'ML-2610-044', quantityAvailable: 88,
            unitOfMeasure: 'kg', retestDueDate: null, supplierExpiryDate: '2030-02-01' },
        ]} />
    </div>

    <div>
      <p style={label}>… and says so when there are none</p>
      <ApprovedLotPicker materialName="Maize starch BP" lots={[]} onSelect={() => {}} />
    </div>
  </div>
);

//  W4·19. The three things the section turns on, each where it can be
//  looked at rather than reasoned about: the five zone glyphs side by
//  side in one row (the greyscale rule either holds at 28 px or it
//  does not), the live typing panel with the gauge under it, and the
//  yield account with its two different percentages.
const BANDS: ZoneBand[] = [
  { zone: '3L', action: 'resample', lowerBound: null, upperBound: 575,
    lowerInclusive: false, upperInclusive: false, boundText: 'below 575 mg', sortOrder: 1 },
  { zone: '2L', action: 'adjust', lowerBound: 575, upperBound: 590,
    lowerInclusive: true, upperInclusive: false, boundText: '575 – 590 mg', sortOrder: 2 },
  { zone: '1', action: 'accept', lowerBound: 590, upperBound: 620,
    lowerInclusive: true, upperInclusive: true, boundText: '590 – 620 mg', sortOrder: 3 },
  { zone: '2U', action: 'adjust', lowerBound: 620, upperBound: 635,
    lowerInclusive: false, upperInclusive: true, boundText: '620 – 635 mg', sortOrder: 4 },
  { zone: '3U', action: 'resample', lowerBound: 635, upperBound: null,
    lowerInclusive: false, upperInclusive: false, boundText: 'above 635 mg', sortOrder: 5 },
];

const RECORDED = [
  604, 611, 598, 607, 615, 602, 623, 609, 600, 612, 596, 618,
].map((v, i) => ({
  readingId: `r${i}`, sequenceNo: i + 1, value: v,
  zone: (v > 635 ? '3U' : v > 620 ? '2U' : v >= 590 ? '1' : v >= 575 ? '2L' : '3L') as ZoneOrNone,
}));

const inprocess = (
  <div style={{ background: 'var(--nv-light-ground)', padding: 24, borderRadius: 16,
                display: 'flex', flexDirection: 'column', gap: 28 }}>
    <div>
      <p style={label}>
        The five zones at 28 px. Squint, or print this in black and white: circle · one
        arrow up · one arrow down · two arrows up · two arrows down · no limits
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                    padding: 14, borderRadius: 10, background: 'var(--nv-light-surface)',
                    border: '1px solid var(--nv-light-border)' }}>
        {(['1', '2U', '2L', '3U', '3L', 'none'] as ZoneOrNone[]).map((z) => (
          <ZoneChip key={z} zone={z} />
        ))}
        <span style={{ width: 20 }} />
        {(['1', '2U', '3L', 'none'] as ZoneOrNone[]).map((z) => (
          <ZoneChip key={`f-${z}`} zone={z} size="focus" />
        ))}
      </div>
    </div>

    <div>
      <p style={label}>IP-01 · the sample due prompt — the largest thing on the screen</p>
      <SampleDuePrompt
        headline="Weight check #14 · take 20 tablets from the press"
        prompt={{ minutesOverdue: 2, intervalMinutes: 30, dueAt: '10:30',
                  parameter: 'Tablet mass', checkNumber: 14,
                  alsoChecking: ['Hardness', 'Thickness'] }}
        onTakeSample={() => {}} />
    </div>

    <div>
      <p style={label}>… and the same band while it is still counting down</p>
      <SampleDuePrompt
        headline="Weight check #15 · take 20 tablets from the press"
        prompt={{ minutesOverdue: -22, intervalMinutes: 30, dueAt: '11:00',
                  parameter: 'Tablet mass', checkNumber: 15, alsoChecking: [] }}
        onTakeSample={() => {}} />
    </div>

    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 420px', minWidth: 300 }}>
        <p style={label}>IP-02 / IP-03 · the zone shown as the value is typed, keypad active</p>
        <ReadingEntry
          parameter="Weight check #14"
          unit="mg"
          subtitle="20 tablets · target 605 mg · limits per this product's master formula"
          requiredCount={20}
          recorded={RECORDED}
          text="627" value={627} zone="2U" zoneAction="adjust"
          actionDetail="Adjust · reduce fill depth"
          bands={BANDS}
          conditions={[{ key: 'weight_zone_2u', severity: 'flagged',
            title: 'Zone 2U — above the warning limit',
            detail: '627 mg. This product’s configured response is to adjust.',
            continueWith: 'Saving the reading and adjusting the machine before the next '
              + 'sample.',
            sortOrder: 22 }]}
          needsAcknowledgement={false} acknowledged={false} onAcknowledge={() => {}}
          onKey={() => {}} onSave={() => {}} onSaveAndEscalate={() => {}}
          onCorrect={() => {}}
          alsoInCheck={[
            { key: 'h', parameter: 'Hardness', detail: 'after weights · 10 tablets' },
            { key: 't', parameter: 'Thickness', detail: 'after weights · 10 tablets' },
          ]} />
      </div>

      <div style={{ flex: '1 1 420px', minWidth: 300 }}>
        <p style={label}>
          IP-05 · a product attribute flagged, beside the machine-setting STOP as a
          proposal. The live gate cannot produce the red one — the migration asserts it.
        </p>
        <ReadingEntry
          parameter="Compression force"
          unit="kN"
          subtitle="Critical machine setting · 10 – 14 kN · set at the start of the stage"
          requiredCount={1}
          recorded={[]}
          text="20" value={20} zone="none" zoneAction={null} actionDetail={null}
          bands={[]}
          conditions={[{ key: 'critical_machine_setting', severity: 'flagged',
            title: 'Compression force is a critical machine setting',
            detail: 'Whether a critical machine setting outside specification should stop '
              + 'the stage is still being decided. Today it is flagged like any other '
              + 'reading and nothing is stopped.',
            continueWith: 'Saving the reading and escalating to a supervisor. No equipment '
              + 'is interlocked.',
            sortOrder: 30 }]}
          proposal={{
            condition: { key: 'proposed_interlock', severity: 'blocked',
              title: 'Compression force is outside its critical range',
              detail: '20 kN recorded against 10 to 14 kN. Under the proposed interlock the '
                + 'stage would stop here until a supervisor released it.',
              continueWith: null, sortOrder: 1 },
            note: 'This is the interlock path from W4·19 decision 2. It is NOT built: '
              + 'inprocess_reading_conditions() has no branch that returns a blocked '
              + 'severity, and a deploy assertion fails if one is added. Damilola and '
              + 'Aderoh decide whether it exists.' }}
          needsAcknowledgement acknowledged={false} onAcknowledge={() => {}}
          onKey={() => {}} onSave={() => {}} onSaveAndEscalate={() => {}}
          onCorrect={() => {}} />
      </div>
    </div>

    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 380px', minWidth: 280 }}>
        <p style={label}>IP-01 · the zone key for the product, worst case at the top</p>
        <ZoneKeyCard bands={[...BANDS].reverse().map((b) => ({
          zone: b.zone as ZoneOrNone, boundText: b.boundText,
          actionText: b.zone.startsWith('3')
            ? 'Resample; reject since last good check if repeated'
            : b.zone === '1' ? 'Accept'
            : b.zone === '2U' ? 'Adjust: reduce fill depth' : 'Adjust: increase fill depth',
        }))} />
      </div>
      <div style={{ flex: '1 1 380px', minWidth: 280 }}>
        <p style={label}>… and for a product nobody has configured limits for</p>
        <ZoneKeyCard bands={[]} />
      </div>
    </div>

    <div>
      <p style={label}>IP-04 · the supervisor's decision — recorded, and no deviation raised</p>
      <SupervisorDecision
        reading={{ parameter: 'Tablet mass', value: 641, unit: 'mg', sequenceNo: 13,
                   zone: '3U', inSpecification: false,
                   recordedBy: 'Musa Bello', recordedAt: '10:34' }}
        raisedBy="Musa Bello"
        raisedNote="Third sample running high since the hopper was topped up."
        canDecide
        onDecide={() => {}}
        onRaiseDeviation={() => {}} />
    </div>

    <div>
      <p style={label}>… and the same panel for the person who raised it: no controls, a reason</p>
      <SupervisorDecision
        reading={{ parameter: 'Tablet mass', value: 641, unit: 'mg', sequenceNo: 13,
                   zone: '3U', inSpecification: false,
                   recordedBy: 'Musa Bello', recordedAt: '10:34' }}
        raisedBy="Musa Bello"
        raisedNote={null}
        canDecide={false}
        onDecide={() => {}} />
    </div>
  </div>
);

//  W4·19 · YR-01. The two percentages are the thing to look at: 96.5 %
//  is packed over theoretical and the threshold blocks on it; 2.4 % is
//  material nobody can locate. They are not the same number.
const YIELD_LINES: AccountLine[] = [
  { key: 'theoretical', label: 'Theoretical yield', quantity: 300000, unit: 'tablets',
    pctOfTheoretical: 100, kind: 'theoretical', mustExplain: false, sortOrder: 1 },
  { key: 'packed', label: 'Packed, released to store', quantity: 289440, unit: 'tablets',
    pctOfTheoretical: 96.48, kind: 'counted', mustExplain: false, sortOrder: 2 },
  { key: 'samples', label: 'In-process and QC samples', quantity: 1260, unit: 'tablets',
    pctOfTheoretical: 0.42, kind: 'counted', mustExplain: false, sortOrder: 3 },
  { key: 'rejects', label: 'Counted rejects', quantity: 2100, unit: 'tablets',
    pctOfTheoretical: 0.7, kind: 'counted', mustExplain: false, sortOrder: 4 },
  { key: 'accounted', label: 'Accounted for', quantity: 292800, unit: 'tablets',
    pctOfTheoretical: 97.6, kind: 'derived', mustExplain: false, sortOrder: 5 },
  { key: 'unaccounted', label: 'Unaccounted', quantity: 7200, unit: 'tablets',
    pctOfTheoretical: 2.4, kind: 'derived', mustExplain: false, sortOrder: 6 },
];

const yieldScreen = (
  <div style={{ background: 'var(--nv-light-ground)', padding: 24, borderRadius: 16,
                display: 'flex', flexDirection: 'column', gap: 28 }}>
    <div>
      <p style={label}>YR-01 · the variance blocks stage completion</p>
      <YieldAccountCard
        stageName="Packing" stageSequence={7}
        lines={YIELD_LINES}
        verdict={{ yieldPct: 96.48, variancePct: -3.52, thresholdPct: 2,
                   withinThreshold: false, investigationRequired: false,
                   authorised: false }}
        window={{ lower: 98, upper: 101 }}
        onFlagInvestigation={() => {}} onRecount={() => {}} onComplete={() => {}} />
    </div>

    <div>
      <p style={label}>… once investigated and authorised: the variance stays on the record</p>
      <YieldAccountCard
        stageName="Packing" stageSequence={7}
        lines={YIELD_LINES}
        verdict={{ yieldPct: 96.48, variancePct: -3.52, thresholdPct: 2,
                   withinThreshold: false, investigationRequired: true, authorised: true }}
        window={{ lower: 98, upper: 101 }}
        onFlagInvestigation={() => {}} onRecount={() => {}} onComplete={() => {}} />
    </div>

    <div>
      <p style={label}>
        … and a reconciliation recorded as a single figure: the lines nobody counted are
        blank, and the yield is unaffected
      </p>
      <YieldAccountCard
        stageName="Granulation" stageSequence={3}
        lines={YIELD_LINES.map((l) =>
          ['samples', 'rejects', 'accounted', 'unaccounted'].includes(l.key)
            ? { ...l, quantity: null, pctOfTheoretical: null } : l)}
        verdict={{ yieldPct: 99.2, variancePct: -0.8, thresholdPct: 2,
                   withinThreshold: true, investigationRequired: false,
                   authorised: false }}
        window={{ lower: 98, upper: 102 }}
        onFlagInvestigation={() => {}} onRecount={() => {}} onComplete={() => {}} />
    </div>
  </div>
);

//  W4·19 phones. IP-M01, IP-M02 and YR-M01 are different
//  compositions, not the tablet narrower — no on-screen keypad, short
//  labels, sticky action bars — so they get their own screens to be
//  looked at in a 390 px window.
const inprocessPhone = (
  <div style={{ background: 'var(--nv-light-ground)', padding: 16, borderRadius: 16,
                display: 'flex', flexDirection: 'column', gap: 20 }}>
    <div>
      <p style={label}>IP-M01 · sample due (phone) — dial 56, button under the text</p>
      <SampleDuePrompt
        layout="phone"
        headline="Weight check #14"
        prompt={{ minutesOverdue: 2, intervalMinutes: 30, dueAt: '10:30',
                  parameter: 'Tablet mass', checkNumber: 14,
                  alsoChecking: ['Hardness', 'Thickness'] }}
        onTakeSample={() => {}} />
    </div>

    <div>
      <p style={label}>
        IP-M02 · reading entry (phone) — a real field, so the phone's number pad opens.
        No on-screen keypad is rendered at all.
      </p>
      <ReadingEntry
        layout="phone"
        parameter="Weight check #14 · tablet 13 of 20"
        unit="mg"
        subtitle="Target 605 mg · LWL 590 · UWL 620 · LAL 575 · UAL 635"
        requiredCount={20}
        recorded={RECORDED}
        text="627" value={627} zone="2U" zoneAction="adjust"
        actionDetail="Zone 2U · adjust: reduce fill depth"
        bands={BANDS}
        conditions={[{ key: 'weight_zone_2u', severity: 'flagged',
          title: 'Zone 2U — above the warning limit',
          detail: '627 mg. This product\u2019s configured response is to adjust.',
          continueWith: 'Saving the reading and adjusting the machine before the next '
            + 'sample.',
          sortOrder: 22 }]}
        needsAcknowledgement={false} acknowledged={false} onAcknowledge={() => {}}
        onKey={() => {}} onText={() => {}} onSave={() => {}}
        onSaveAndEscalate={() => {}} onCorrect={() => {}} />
    </div>

    <div>
      <p style={label}>IP-M04 · the supervisor's decision on a phone</p>
      <SupervisorDecision
        reading={{ parameter: 'Tablet mass', value: 641, unit: 'mg', sequenceNo: 13,
                   zone: '3U', inSpecification: false,
                   recordedBy: 'Musa Bello', recordedAt: '10:34' }}
        raisedBy="Musa Bello"
        raisedNote="Third sample running high since the hopper was topped up."
        canDecide
        onDecide={() => {}}
        onRaiseDeviation={() => {}} />
    </div>
  </div>
);

const yieldPhone = (
  <div style={{ background: 'var(--nv-light-ground)', padding: 16, borderRadius: 16,
                display: 'flex', flexDirection: 'column', gap: 20 }}>
    <div>
      <p style={label}>
        YR-M01 · the block comes first, labels are short, figures are bare with the
        unit said once, and both routes sit in a sticky bar
      </p>
      <YieldAccountCard
        layout="phone"
        stageName="Packing" stageSequence={7}
        lines={YIELD_LINES}
        verdict={{ yieldPct: 96.48, variancePct: -3.52, thresholdPct: 2,
                   withinThreshold: false, investigationRequired: false,
                   authorised: false }}
        window={{ lower: 98, upper: 101 }}
        onFlagInvestigation={() => {}} onRecount={() => {}} onComplete={() => {}} />
    </div>

    <div>
      <p style={label}>… and once authorised, the bar carries the one action left</p>
      <YieldAccountCard
        layout="phone"
        stageName="Packing" stageSequence={7}
        lines={YIELD_LINES}
        verdict={{ yieldPct: 96.48, variancePct: -3.52, thresholdPct: 2,
                   withinThreshold: false, investigationRequired: true,
                   authorised: true }}
        window={{ lower: 98, upper: 101 }}
        onFlagInvestigation={() => {}} onRecount={() => {}} onComplete={() => {}} />
    </div>
  </div>
);

//  W5·11. The story continues W4·19: weight check #14 on
//  PCM-2610-014, which is where the supervisor raises from.
const IMPACT_OPTIONS: ImpactOption[] = [
  { impact: 'yes', label: 'Yes — product quality is affected', effect: 'blocks',
    consequence: 'This will block release of batch PCM-2610-014 until the deviation is '
      + 'closed.', sortOrder: 1 },
  { impact: 'no', label: 'No — product quality is not affected', effect: 'warns',
    consequence: 'Release of batch PCM-2610-014 will carry a warning, not a block.',
    sortOrder: 2 },
  { impact: 'undetermined', label: 'Undetermined — not yet assessed', effect: 'blocks',
    consequence: 'This will block release of batch PCM-2610-014 until somebody assesses '
      + 'the impact. Undetermined is a real answer; blank is not.', sortOrder: 3 },
];

const DEV_CONTEXT = [
  { key: 'batch', label: 'Batch', value: 'PCM-2610-014' },
  { key: 'product', label: 'Product', value: 'Paracetamol 500 mg Tablets' },
  { key: 'stage', label: 'Stage', value: '6 · Compression' },
  { key: 'reading', label: 'Reading', value: '641 mg · zone 3U · check #14' },
  { key: 'line', label: 'Line', value: 'TL-1 · press RP-01' },
];

const READINESS: ReadinessCondition[] = [
  { key: 'impact_assessed', met: true, blocking: true,
    title: 'Product quality impact is assessed',
    detail: 'Recorded as "yes".', sortOrder: 10 },
  { key: 'root_cause_determined', met: false, blocking: true,
    title: 'A root cause has been determined',
    detail: 'A five whys analysis is in progress but has no conclusion yet.',
    sortOrder: 20 },
  { key: 'capa_decided', met: false, blocking: false,
    title: 'A CAPA has been raised, or recorded as not needed',
    detail: 'No CAPA is linked and none has been recorded as unnecessary. Whether this '
      + 'is required before closure is still being decided.', sortOrder: 30 },
  { key: 'awaiting_qa', met: false, blocking: true,
    title: 'The deviation has been sent for QA closure',
    detail: 'Currently under_investigation.', sortOrder: 40 },
];

const INVESTIGATION: Investigation = {
  deviationId: 'd1', deviationNumber: 'DEV-00014',
  title: 'Tablet mass above the action limit on check #14',
  severity: 'major', impact: 'yes',
  stateKey: 'under_investigation', stateLabel: 'Under Investigation',
  ownerName: 'Ada Okafor', dueDate: '2026-10-09',
  daysOverdue: 11, isOverdue: true,
  immediateAction: 'Press stopped and the last good check isolated — 4,200 tablets '
    + 'quarantined pending this investigation.',
  containment: 'Compression held. The granule already dispensed stays on the line.',
};

const REGISTER_ROWS: RegisterRow[] = [
  { id: 'r1', deviationNumber: 'DEV-00014',
    title: 'Tablet mass above the action limit on check #14',
    severity: 'major', impact: 'yes', sourceType: 'batch',
    sourceLabel: 'PCM-2610-014', stateKey: 'under_investigation',
    stateLabel: 'Under Investigation', dueDate: '2026-10-09', daysOverdue: 11,
    isOverdue: true, raisedAt: '2026-09-28T10:40:00Z', linkedCapaCount: 0 },
  { id: 'r2', deviationNumber: 'DEV-00011',
    title: 'Swab result above limit after changeover',
    severity: 'minor', impact: 'no', sourceType: 'batch',
    sourceLabel: 'PCM-2610-009', stateKey: 'under_investigation',
    stateLabel: 'Under Investigation', dueDate: '2026-09-30', daysOverdue: 20,
    isOverdue: true, raisedAt: '2026-09-20T07:10:00Z', linkedCapaCount: 1 },
  { id: 'r3', deviationNumber: 'DEV-00018',
    title: 'Balance BAL-02 found out of calibration mid-shift',
    severity: 'critical', impact: 'undetermined', sourceType: 'equipment',
    sourceLabel: 'BAL-02', stateKey: 'raised', stateLabel: 'Raised',
    dueDate: '2026-10-27', daysOverdue: -7, isOverdue: false,
    raisedAt: '2026-10-20T06:05:00Z', linkedCapaCount: 0 },
  { id: 'r4', deviationNumber: 'DEV-00017',
    title: 'Supplier certificate figure disagrees with incoming test',
    severity: 'major', impact: 'no', sourceType: 'material_lot',
    sourceLabel: 'ML-2610-028', stateKey: 'pending_qa_closure',
    stateLabel: 'Pending QA Closure', dueDate: null, daysOverdue: null,
    isOverdue: false, raisedAt: '2026-10-18T13:22:00Z', linkedCapaCount: 2 },
];

const RCA_FIVE: RootCauseAnalysis = {
  id: 'a1', framework: 'five_whys',
  whys: [
    { seq: 1, question: 'Why did this happen?',
      answer: 'Tablet mass drifted above the upper action limit.' },
    { seq: 2, question: 'Why did that happen? — "Tablet mass drifted above the upper action limit"',
      answer: 'The fill depth increased during the run.' },
    { seq: 3, question: 'Why did that happen? — "The fill depth increased during the run"',
      answer: null },
  ],
  answers: {},
  determinedRootCause: null, rootCauseCategory: null, completedAt: null,
};

const RCA_5W1H: RootCauseAnalysis = {
  id: 'a2', framework: '5w1h', whys: [],
  answers: {
    what: 'Tablet mass ran above the upper action limit on check #14.',
    why: 'Out-of-specification tablets reached the collection bin.',
    where: 'Line TL-1, compression, press RP-01.',
    when: '10:34, about 40 minutes after the hopper was topped up.',
    who: null, how: null,
  },
  determinedRootCause: 'Fill cam worn beyond its service limit',
  rootCauseCategory: 'machine', completedAt: null,
};

const CATEGORIES = [
  { key: 'people', label: 'People' }, { key: 'machine', label: 'Machine' },
  { key: 'method', label: 'Method' }, { key: 'material', label: 'Material' },
  { key: 'measurement', label: 'Measurement' }, { key: 'environment', label: 'Environment' },
];

const deviations = (
  <div style={{ background: 'var(--nv-light-ground)', padding: 24, borderRadius: 16,
                display: 'flex', flexDirection: 'column', gap: 28 }}>
    <div>
      <p style={label}>
        DV-01 · the tablet sheet with nothing chosen. Raise says what is missing rather
        than going dim.
      </p>
      <RaiseDeviationSheet
        presentation="sheet"
        draft={emptyDraft('batch', 'b1')}
        onChange={() => {}}
        context={DEV_CONTEXT}
        sourceLabel="PCM-2610-014"
        impactOptions={IMPACT_OPTIONS}
        onRaise={() => {}} onCancel={() => {}} />
    </div>

    <div>
      <p style={label}>
        … and after pressing Raise with nothing chosen: the messages appear beside the
        fields, not on arrival
      </p>
      <RaiseDeviationSheet
        presentation="sheet"
        draft={emptyDraft('batch', 'b1')}
        onChange={() => {}}
        attempted
        context={DEV_CONTEXT}
        sourceLabel="PCM-2610-014"
        impactOptions={IMPACT_OPTIONS}
        onRaise={() => {}} onCancel={() => {}} />
    </div>

    <div>
      <p style={label}>
        DV-03 · Major and impact Yes chosen. The consequence is stated on its own,
        naming the batch, before Raise is pressed.
      </p>
      <RaiseDeviationSheet
        presentation="sheet"
        draft={{ ...emptyDraft('batch', 'b1'),
          title: 'Tablet mass above the action limit on check #14',
          description: 'Three consecutive tablets above UAL 635 mg on check #14.',
          severity: 'major', impact: 'yes' }}
        onChange={() => {}}
        context={DEV_CONTEXT}
        sourceLabel="PCM-2610-014"
        impactOptions={IMPACT_OPTIONS}
        onRaise={() => {}} onCancel={() => {}} />
    </div>

    <div>
      <p style={label}>DV-11 · the deviation on the batch — release blocked</p>
      <DeviationOnRecord
        recordKind="batch" recordLabel="PCM-2610-014"
        deviations={[
          { id: 'd1', deviationNumber: 'DEV-00014',
            title: 'Tablet mass above the action limit on check #14',
            severity: 'major', impact: 'yes', stateKey: 'under_investigation',
            stateLabel: 'Under Investigation', effect: 'blocks',
            attachedAs: 'raised_against' },
          { id: 'd2', deviationNumber: 'DEV-00017',
            title: 'Supplier certificate figure disagrees with incoming test',
            severity: 'major', impact: 'no', stateKey: 'pending_qa_closure',
            stateLabel: 'Pending QA Closure', effect: 'warns',
            attachedAs: 'linked', viaLabel: 'lot ML-2610-028' },
          { id: 'd3', deviationNumber: 'DEV-00002',
            title: 'Line clearance record signed late',
            severity: 'minor', impact: 'no', stateKey: 'closed',
            stateLabel: 'Closed', effect: 'none', attachedAs: 'raised_against' },
        ]}
        onOpen={() => {}} onRaise={() => {}} />
    </div>

    <div>
      <p style={label}>DV-12 · and on the lot — a warning, not a block</p>
      <DeviationOnRecord
        recordKind="lot" recordLabel="ML-2610-028"
        deviations={[
          { id: 'd2', deviationNumber: 'DEV-00017',
            title: 'Supplier certificate figure disagrees with incoming test',
            severity: 'major', impact: 'no', stateKey: 'pending_qa_closure',
            stateLabel: 'Pending QA Closure', effect: 'warns',
            attachedAs: 'raised_against' },
        ]}
        onOpen={() => {}} onRaise={() => {}} />
    </div>

    <div>
      <p style={label}>DV-09 · the register — overdue first, then gravest, then oldest</p>
      <DeviationRegister
        rows={REGISTER_ROWS} includingClosed={false}
        onOpen={() => {}} onToggleClosed={() => {}} />
    </div>

    <div>
      <p style={label}>DV-10 · and empty, saying which kind of empty it is</p>
      <DeviationRegister
        rows={[]} includingClosed={false}
        onOpen={() => {}} onToggleClosed={() => {}} />
    </div>

    <div>
      <p style={label}>
        DV-04 / DV-07 · the investigation, overdue, with the readiness checklist. The
        CAPA condition is amber: shown and counted, enforcing nothing, because decision
        4 is still open.
      </p>
      <InvestigationPanel
        investigation={INVESTIGATION}
        conditions={READINESS}
        linked={[
          { key: 'b', kind: 'batch', label: 'PCM-2610-014',
            detail: 'Paracetamol 500 mg Tablets · release blocked' },
        ]}
        isQa
        onSign={() => {}} onRaiseCapa={() => {}} />
    </div>

    <div>
      <p style={label}>DV-08 · closed and locked, signed as Approved</p>
      <InvestigationPanel
        investigation={{ ...INVESTIGATION, stateKey: 'closed', stateLabel: 'Closed',
          isOverdue: false, daysOverdue: null }}
        conditions={READINESS.map((c) => ({ ...c, met: true }))}
        linked={[
          { key: 'c', kind: 'capa', label: 'CAPA-00031',
            detail: 'Replace fill cam and add it to the PM schedule · systemic' },
          { key: 'cc', kind: 'change_control', label: 'CC-00008',
            detail: 'PM interval for compression tooling' },
        ]}
        isQa
        signature={{ signedByName: 'Ada Okafor', signedAt: '20 Oct 2026 · 16:12',
                     meaning: 'Approved' }}
        onSign={() => {}} onRaiseCapa={() => {}} />
    </div>

    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 420px', minWidth: 300 }}>
        <p style={label}>DV-05 · root cause, five whys</p>
        <RootCausePanel
          analysis={RCA_FIVE} categories={CATEGORIES}
          onAnswerWhy={() => {}} onAddWhy={() => {}} onAnswer={() => {}}
          onChangeRootCause={() => {}} onChangeCategory={() => {}} onComplete={() => {}} />
      </div>
      <div style={{ flex: '1 1 420px', minWidth: 300 }}>
        <p style={label}>
          DV-05b · the same deviation's analysis under 5W1H. One framework per analysis —
          the other one's fields are not in the document at all.
        </p>
        <RootCausePanel
          analysis={RCA_5W1H} categories={CATEGORIES}
          onAnswerWhy={() => {}} onAddWhy={() => {}} onAnswer={() => {}}
          onChangeRootCause={() => {}} onChangeCategory={() => {}} onComplete={() => {}} />
      </div>
    </div>

    <div>
      <p style={label}>
        … and an analysis that somehow holds both: not drawn, rather than drawn
        misleadingly
      </p>
      <RootCausePanel
        analysis={{ ...RCA_FIVE, answers: { what: 'Tablets ran heavy' } }}
        categories={CATEGORIES}
        onAnswerWhy={() => {}} onAddWhy={() => {}} onAnswer={() => {}}
        onChangeRootCause={() => {}} onChangeCategory={() => {}} onComplete={() => {}} />
    </div>
  </div>
);

const deviationsPhone = (
  <div style={{ background: 'var(--nv-light-ground)', padding: 0, borderRadius: 16,
                display: 'flex', flexDirection: 'column', gap: 20 }}>
    <RaiseDeviationSheet
      presentation="fullscreen"
      draft={{ ...emptyDraft('batch', 'b1'),
        title: 'Tablet mass above the action limit on check #14',
        severity: 'major', impact: 'yes' }}
      onChange={() => {}}
      context={DEV_CONTEXT}
      sourceLabel="PCM-2610-014"
      impactOptions={IMPACT_OPTIONS}
      onRaise={() => {}} onCancel={() => {}} />
    <div style={{ padding: 16 }}>
      <p style={label}>DV-M09 · the register on a phone</p>
      <DeviationRegister
        rows={REGISTER_ROWS} includingClosed={false} layout="phone"
        onOpen={() => {}} onToggleClosed={() => {}} />
    </div>
  </div>
);

const page = screen === 'deviations' ? deviations
  : screen === 'deviations-phone' ? deviationsPhone
  : screen === 'inprocess-phone' ? inprocessPhone
  : screen === 'yield-phone' ? yieldPhone
  : screen === 'inprocess' ? inprocess
  : screen === 'yield' ? yieldScreen
  : screen === 'floor' ? floor
  : screen === 'batch' ? batch
  : screen === 'formula' ? formula
  : screen === 'materials' ? materials
  : screen === 'roles' ? roles
  : screen === 'access' ? access
  : screen === 'tracks' ? tracks : screen === 'banners' ? banners
  : screen === 'products'
    ? <ProductsPage companyId="c1" userId="u1" onOpenRegistrations={() => {}} onImportSpreadsheet={() => {}} />
    : <FirstRunDashboard companyId="c1" userId="u1" onAddProduct={() => {}} onImportSpreadsheet={() => {}} onOpenRow={() => {}} />;

createRoot(document.getElementById('root')!).render(
  <MainLayout currentPage={(['banners','tracks','access','roles','materials','formula','batch','floor','inprocess','yield','inprocess-phone','yield-phone','deviations','deviations-phone'].includes(screen) ? 'dashboard' : screen) as any} onNavigate={() => {}}>{page}</MainLayout>,
);
