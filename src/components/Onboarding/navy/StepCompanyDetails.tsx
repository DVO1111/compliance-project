/**
 * ONB-01 · Company details.
 *
 * Two cards, "Your company" and "About you", on the 680 px column.
 *
 * WHAT THE NOTES REQUIRE, AND WHERE IT IS
 *
 *   "Required fields are marked *. Continue validates on click and
 *    shows the error state from input/text with a message per field."
 *    → validate() below, run from onContinue, returning a map of field
 *      to message. Nothing validates while typing: being told an email
 *      is wrong before you have finished typing it is the most common
 *      way a form becomes unpleasant.
 *
 *   "Logo upload is carried over from Company Settings › Brand Identity
 *    (ADM-02) and feeds the CoA template header (C10.2)."
 *    → the control says what it is for in those words, so the person
 *      knows why a logo is being asked for at all.
 *
 *   "The admin's own role comes from the PRD user list (1.3), not the
 *    old Admin / Legal / Marketing / Viewer set."
 *    → ADMIN_ROLES in onboardingData.ts, which is a job title list and
 *      not a permission list. Permissions are not set here.
 *
 *   "Values entered in onboarding stay editable later in Company
 *    Settings." → said on screen, under About you, because a person
 *      filling a form faster is a person who knows it is not final.
 */

import { useState } from 'react';
import { ADMIN_ROLES, COUNTRY } from '../../../lib/onboarding/onboardingData';
import { saveCompanyDetails, type CompanyDetailsInput } from '../../../lib/onboarding/setupSteps';
import OnboardingShell, { OnboardingCard, FieldRow } from './OnboardingShell';
import NavyField, { NavySelect } from './NavyField';
import { ICONS, iconProps } from '../../../lib/design/icons';

export interface StepCompanyDetailsProps {
  companyId: string;
  userId: string;
  initial: Partial<CompanyDetailsInput>;
  onBack: () => void;
  onDone: () => void;
}

type Errors = Partial<Record<keyof CompanyDetailsInput, string>>;

export default function StepCompanyDetails({
  companyId, userId, initial, onBack, onDone,
}: StepCompanyDetailsProps) {
  const [legalName, setLegalName] = useState(initial.legalName ?? '');
  const [tradingName, setTradingName] = useState(initial.tradingName ?? '');
  const [cacNumber, setCacNumber] = useState(initial.cacNumber ?? '');
  const [headOffice, setHeadOffice] = useState(initial.headOffice ?? '');
  const [country, setCountry] = useState(initial.country ?? COUNTRY.label);
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [fullName, setFullName] = useState(initial.fullName ?? '');
  const [jobTitle, setJobTitle] = useState(initial.jobTitle ?? '');

  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  //  One message per field, and each says what to do rather than what
  //  went wrong. "Required" tells a person nothing they cannot see.
  const validate = (): Errors => {
    const e: Errors = {};
    if (!legalName.trim()) e.legalName = 'Enter the name exactly as registered with the CAC.';
    if (!cacNumber.trim()) e.cacNumber = 'Enter your CAC registration number, e.g. RC 1234567.';
    if (!headOffice.trim()) e.headOffice = 'Enter the address of your head office.';
    if (!fullName.trim()) e.fullName = 'Enter your full name as it should appear on records.';
    if (!jobTitle.trim()) e.jobTitle = 'Choose the role that describes what you do here.';
    return e;
  };

  const submit = async () => {
    const found = validate();
    setErrors(found);
    //  The first field with a message is focused, so a long form does
    //  not leave the person scrolling to find what it objected to.
    if (Object.keys(found).length > 0) {
      const first = document.querySelector('[aria-invalid="true"]');
      if (first instanceof HTMLElement) first.focus();
      return;
    }

    setBusy(true);
    setSaveError(null);
    const r = await saveCompanyDetails(companyId, userId, {
      legalName, tradingName, cacNumber, headOffice, country, phone, fullName, jobTitle,
    });
    setBusy(false);
    if (!r.ok) { setSaveError(r.message); return; }
    onDone();
  };

  const Upload = ICONS['action/upload'];

  return (
    <OnboardingShell
      step={1}
      stepLabel="Company details"
      title="Company details"
      subtitle="How your company appears on certificates, applications and audit exports."
      backLabel="Back to overview"
      onBack={onBack}
      onContinue={submit}
      continueBusy={busy}
    >
      <OnboardingCard
        title="Your company"
        description="Use the legal name exactly as registered with the Corporate Affairs Commission."
      >
        <NavyField
          label="Legal company name"
          required
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          error={errors.legalName}
          placeholder="Ibadan Pharmaceuticals Ltd."
        />

        <FieldRow>
          <NavyField
            label="Trading name"
            value={tradingName}
            onChange={(e) => setTradingName(e.target.value)}
            placeholder="e.g. IbPharm"
          />
          <NavyField
            label="CAC registration number"
            required
            value={cacNumber}
            onChange={(e) => setCacNumber(e.target.value)}
            error={errors.cacNumber}
            placeholder="RC 1234567"
          />
        </FieldRow>

        <NavyField
          label="Head office address"
          required
          value={headOffice}
          onChange={(e) => setHeadOffice(e.target.value)}
          error={errors.headOffice}
          placeholder="14 Oluyole Industrial Estate, Ibadan, Oyo State"
        />

        <FieldRow>
          {/*  One country, because Phase 1 is Nigeria. It is a select
              rather than fixed text so the screen does not have to be
              rebuilt when the second one arrives.  */}
          <NavySelect
            label="Country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            options={[COUNTRY.label]}
          />
          <NavyField
            label="Company phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+234 803 000 0000"
          />
        </FieldRow>

        {/*  THE LOGO IS NOT UPLOADED HERE YET, and the control says so
            rather than accepting a file and dropping it. Storing it
            needs a bucket and a column that do not exist; the same
            upload lives in Company Settings › Brand Identity, which is
            where it is carried over from.  */}
        <div style={{
          display: 'flex', gap: 12, alignItems: 'flex-start',
          padding: 16, borderRadius: 10,
          border: '1px dashed var(--nv-border-strong)',
          background: 'var(--nv-surface-recessed)',
        }}>
          <span style={{ color: 'var(--nv-icon-default)', marginTop: 2 }}>
            <Upload {...iconProps('md')} />
          </span>
          <div>
            <p style={{
              margin: 0, fontWeight: 600, fontSize: 14, lineHeight: '20px',
              color: 'var(--nv-text-primary)',
            }}>
              Company logo (optional)
            </p>
            <p style={{
              margin: '2px 0 0', fontSize: 13, lineHeight: '19px',
              color: 'var(--nv-text-secondary)',
            }}>
              PNG, JPG or SVG, up to 2 MB. Used in the header of generated certificates of
              analysis.
            </p>
            <p style={{
              margin: '8px 0 0', fontSize: 12, lineHeight: '18px',
              color: 'var(--nv-text-tertiary)',
            }}>
              Upload it in Company Settings › Brand Identity — there is nowhere to store it
              from here yet, and a control that took your file and lost it would be worse
              than one that says so.
            </p>
          </div>
        </div>
      </OnboardingCard>

      <OnboardingCard
        title="About you"
        description="You become the workspace administrator. You can hand this role over later."
      >
        <FieldRow>
          <NavyField
            label="Your full name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            error={errors.fullName}
            placeholder="Ada Okafor"
          />
          <NavySelect
            label="Your role"
            required
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            error={errors.jobTitle}
            options={ADMIN_ROLES}
            placeholder="Choose your role…"
          />
        </FieldRow>

        <p style={{
          margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--nv-text-tertiary)',
        }}>
          Everything on this page stays editable later in Company Settings.
        </p>
      </OnboardingCard>

      {saveError && (
        <p role="alert" style={{
          margin: 0, fontSize: 13, lineHeight: '19px', color: '#ffb4a6',
        }}>
          {saveError}
        </p>
      )}
    </OnboardingShell>
  );
}
