/**
 * ONB-07 · Your workspace is ready.
 *
 * "Post-onboarding state defined, with a clear first action" (W1·14).
 *
 * THE HONEST-STATE RULES, which are the whole character of this screen:
 *
 *   "Invitations show as sent and waiting, not as joined."
 *    → the line reads "3 invitations sent · waiting for people to
 *      accept". Nobody has joined; saying they have would be the first
 *      thing the product got wrong.
 *
 *   "No metrics are shown. The summary repeats only what the user
 *    entered."
 *    → every line below counts something typed or ticked on one of the
 *      six steps. There is no compliance score, no readiness
 *      percentage and no risk count, because the workspace has not
 *      been used yet and any such number would be invented.
 *
 * THE FIRST ACTION IS PRODUCTS, and the card says why rather than
 * asserting it: "a batch can only start for a product with a valid
 * registration, and renewal alerts need each registration's expiry
 * date" (L2.3, 2.3 P1, C2.8, A5.1). A next step with a reason is one
 * someone takes; a next step without one is a button they ignore.
 *
 * The green border is ONB-00's "current step" treatment, reused so the
 * next action reads as the next step rather than as an advertisement.
 */

import { INDUSTRIES, REGULATORS } from '../../../lib/onboarding/onboardingData';
import type { ReadySummary } from '../../../lib/onboarding/setupSteps';
import { ICONS, iconProps } from '../../../lib/design/icons';
import OnboardingShell from './OnboardingShell';
import NavyButton from './NavyButton';

export interface StepReadyProps {
  summary: Partial<ReadySummary>;
  /** Opens the product registry, where the first action happens. */
  onAddProduct: () => void;
  onUploadProducts: () => void;
  onGoToDashboard: () => void;
}

export default function StepReady({
  summary, onAddProduct, onUploadProducts, onGoToDashboard,
}: StepReadyProps) {
  const Check = ICONS['action/check'];

  const industry = INDUSTRIES.find((i) => i.value === summary.industryTitle);
  const industryName = industry?.title.toLowerCase() ?? 'regulated manufacturing';
  const country = summary.country || 'Nigeria';
  const company = summary.companyName || 'Your workspace';

  //  The ACRONYM, not the long label. "NAFDAC and PCN" is how the
  //  design writes it and how anyone in the industry says it;
  //  "PCN (Pharmacists Council of Nigeria)" belongs on the screen where
  //  you are choosing, not on the one summarising what you chose.
  const regulatorLabels = (summary.regulators ?? [])
    .filter((id) => REGULATORS.some((r) => r.id === id))
    .map((id) => id.toUpperCase());

  return (
    <OnboardingShell
      step={6}
      stepLabel="Ready"
      completed
      hideBack
      title="Your workspace is ready"
      subtitle={`${company} is set up for ${industryName} in ${country}.`}
      backLabel="Back"
      onBack={() => {}}
      onContinue={onGoToDashboard}
      continueLabel="Go to dashboard"
      continueVariant="outline"
      //  THE ADDRESS, because there is no link. This said "from Company
      //  Settings" and that page has nothing on it that reopens setup —
      //  so the one line telling somebody how to get back pointed at a
      //  place where the way back is not. /onboarding does open the hub,
      //  and naming it is true today; a link in Company Settings would
      //  be better and is not what this comment is for.
      footnote="You can reopen any setup step later at criateur.com/onboarding."
    >
      <section style={card}>
        <h2 style={cardTitle}>What’s set up</h2>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
          <Line icon={Check}>Company profile and logo</Line>

          <Line icon={Check}>
            {industry
              ? `${industry.title} template${regulatorLabels.length > 0 ? ` · ${regulatorLabels.join(' and ')}` : ''}`
              : 'Industry and region'}
          </Line>

          <Line icon={Check}>
            {joinCounts([
              [summary.siteCount, 'site', 'sites'],
              [summary.departmentCount, 'department', 'departments'],
              [summary.productCategoryCount, 'product category', 'product categories'],
            ])}
          </Line>

          <Line icon={Check}>
            {plural(summary.areaCount ?? 0, 'area', 'areas')} switched on
          </Line>

          {(summary.starterRecordsKept ?? 0) > 0 && (
            <Line icon={Check}>
              Starter obligations, licences, policies and risks kept for review
            </Line>
          )}

          {/*  "Sent and waiting, not joined." The distinction is the
              line's entire purpose, so it is in the sentence and not
              only in a tooltip.  */}
          {(summary.invitesSent ?? 0) > 0 && (
            <Line icon={Check}>
              {plural(summary.invitesSent ?? 0, 'invitation', 'invitations')} sent ·
              {' '}waiting for people to accept
            </Line>
          )}
        </ul>
      </section>

      {/* ── The first action ──────────────────────────────────────── */}
      <section style={{
        ...card,
        background: 'rgba(113, 166, 106, 0.08)',
        border: '1.5px solid var(--nv-action-primary-bg)',
      }}>
        <h2 style={cardTitle}>Your first step: add your products</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--nv-text-secondary)' }}>
          Everything else depends on products. A batch can only start for a product with a
          valid registration, and renewal alerts need each registration’s expiry date.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <NavyButton onClick={onAddProduct}>Add your first product</NavyButton>
          <NavyButton variant="ghost" onClick={onUploadProducts} style={{ padding: 0 }}>
            Upload a product spreadsheet
          </NavyButton>
        </div>
      </section>
    </OnboardingShell>
  );
}

function Line({ icon: Icon, children }: {
  icon: typeof ICONS['action/check']; children: React.ReactNode;
}) {
  return (
    <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span aria-hidden="true" style={{ color: 'var(--nv-action-primary-bg)', marginTop: 1 }}>
        <Icon {...iconProps('sm')} />
      </span>
      <span style={{ fontSize: 14, lineHeight: '21px', color: 'var(--nv-text-primary)' }}>
        {children}
      </span>
    </li>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * "2 sites · 5 departments · 2 product categories", leaving out
 * anything that is zero.
 *
 * A workspace that added no departments should not be told it has "0
 * departments" on the screen that congratulates it.
 */
function joinCounts(parts: [number | undefined, string, string][]): string {
  const said = parts
    .filter(([n]) => (n ?? 0) > 0)
    .map(([n, one, many]) => plural(n ?? 0, one, many));
  return said.length > 0 ? said.join(' · ') : 'Sites and departments';
}

const card: React.CSSProperties = {
  padding: 24,
  borderRadius: 'var(--nv-radius-card)',
  background: 'var(--nv-surface-raised)',
  border: '1px solid var(--nv-border-default)',
  display: 'flex', flexDirection: 'column', gap: 14,
};

const cardTitle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--nv-font-body)', fontWeight: 600,
  fontSize: 16, lineHeight: '22px',
  color: 'var(--nv-text-primary)',
};
