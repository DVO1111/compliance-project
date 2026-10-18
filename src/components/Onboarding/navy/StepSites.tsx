/**
 * ONB-03 · Sites, departments and products.
 *
 * Four cards: the sites, what the company makes, the departments that
 * will carry document numbers, and an optional spreadsheet import.
 *
 * WHAT THE NOTES REQUIRE, AND WHERE IT IS
 *
 *   "Sites list: empty state shows one blank site form instead of an
 *    empty list."
 *    → `editing` starts at 'new' when nothing is stored, so the first
 *      thing a new workspace sees is a form, not an invitation to find
 *      a button.
 *
 *   "At least one manufacturing or warehouse site is required to
 *    continue."
 *    → checked on Continue against SITE_TYPES[].countsTowardMinimum,
 *      so adding a site type later cannot silently change the rule.
 *
 *   "Departments … now visibly drive numbering: CC-{DEPT}-{YYYY}-
 *    {NNNN}."
 *    → the preview strip is built from the codes actually ticked. Untick
 *      Quality Assurance and the preview stops saying CC-QA-, because a
 *      preview of a series that will not exist is a lie that costs
 *      nothing to tell and a lot to discover.
 *
 *   "Rows are validated before saving, and errors are listed per row
 *    (pattern to be specified)."
 *    → THE PATTERN IS NOT SPECIFIED, so there is no importer here. The
 *      card offers the template, which is real, and says plainly that
 *      the upload is not switched on. Inventing a validator would mean
 *      inventing the file format it validates, and every spreadsheet
 *      built against it would be wrong later.
 *
 * The whole screen is edited locally and written on Continue — see
 * saveSitesStep, which reconciles rather than appends.
 */

import { useState } from 'react';
import {
  SITE_TYPES, siteTypeBadge, PRODUCT_CATEGORIES, productCategoryLabel,
  SUGGESTED_DEPARTMENTS, DEPARTMENT_CODE_PATTERN, numberingPreview,
  IMPORT_NOT_READY_NOTE,
} from '../../../lib/onboarding/onboardingData';
import {
  saveSitesStep, type SiteInput, type DepartmentInput, type SitesStepState,
} from '../../../lib/onboarding/setupSteps';
import { ICONS, iconProps } from '../../../lib/design/icons';
import OnboardingShell, { OnboardingCard, FieldRow } from './OnboardingShell';
import NavyField, { NavySelect } from './NavyField';
import NavyButton from './NavyButton';
import { Chip } from './SelectCard';
import { downloadImportTemplate } from '../../../lib/onboarding/importTemplate';

export interface StepSitesProps {
  companyId: string;
  initial: SitesStepState;
  onBack: () => void;
  onDone: () => void;
}

const BLANK_SITE: SiteInput = {
  name: '', siteType: 'manufacturing', address: '', productCategories: [], notes: '',
};

export default function StepSites({ companyId, initial, onBack, onDone }: StepSitesProps) {
  const [sites, setSites] = useState<SiteInput[]>(initial.sites);
  const [categories, setCategories] = useState<string[]>(initial.productCategories);
  const [departments, setDepartments] = useState<DepartmentInput[]>(() =>
    //  Already-stored departments win, so a workspace that named its own
    //  does not have them replaced by the suggestions. Where nothing is
    //  stored, the usual six come ticked — "We suggested the usual ones".
    initial.departments.length > 0
      ? initial.departments
      : SUGGESTED_DEPARTMENTS.filter((d) => d.on).map((d) => ({ name: d.name, code: d.code })),
  );

  //  'new', a site index, or null for the list. Starts on the form when
  //  there is nothing to list.
  const [editing, setEditing] = useState<number | 'new' | null>(
    initial.sites.length === 0 ? 'new' : null,
  );
  const [draft, setDraft] = useState<SiteInput>(BLANK_SITE);
  const [draftError, setDraftError] = useState<string | null>(null);

  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ name: '', code: '' });
  const [customError, setCustomError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const Pin = ICONS['access/site'];
  const Edit = ICONS['action/edit'];
  const Delete = ICONS['action/delete'];
  const Add = ICONS['action/add'];

  const codes = departments.map((d) => d.code).filter(Boolean);
  const preview = numberingPreview(codes);

  // ── site form ──────────────────────────────────────────────────────

  const openNew = () => { setDraft(BLANK_SITE); setDraftError(null); setEditing('new'); };
  const openEdit = (i: number) => { setDraft(sites[i]); setDraftError(null); setEditing(i); };

  const commitDraft = () => {
    if (!draft.name.trim()) { setDraftError('Give this site a name.'); return; }
    const clash = sites.some((s, i) =>
      i !== editing && s.name.trim().toLowerCase() === draft.name.trim().toLowerCase());
    if (clash) { setDraftError('You already have a site with this name.'); return; }

    setSites((cur) => (editing === 'new' ? [...cur, draft]
      : cur.map((s, i) => (i === editing ? draft : s))));
    setEditing(null);
    setError(null);
  };

  const cancelDraft = () => {
    //  There is nothing to go back to on an empty list, so the blank form
    //  stays rather than leaving the card with neither a site nor a form.
    if (sites.length === 0) { setDraft(BLANK_SITE); setDraftError(null); return; }
    setEditing(null);
  };

  const removeSite = (i: number) => {
    const next = sites.filter((_, n) => n !== i);
    setSites(next);
    if (next.length === 0) { setDraft(BLANK_SITE); setEditing('new'); }
    else if (editing === i) setEditing(null);
  };

  // ── departments ────────────────────────────────────────────────────

  const toggleDepartment = (name: string, code: string) =>
    setDepartments((cur) => cur.some((d) => d.name === name)
      ? cur.filter((d) => d.name !== name)
      : [...cur, { name, code }]);

  const addCustomDepartment = () => {
    const name = custom.name.trim();
    const code = custom.code.trim().toUpperCase();
    if (!name) { setCustomError('Name the department.'); return; }
    if (!DEPARTMENT_CODE_PATTERN.test(code)) {
      setCustomError('The code is 2 to 8 letters or digits, upper case — it goes into every document number.');
      return;
    }
    if (departments.some((d) => d.code === code)) {
      setCustomError(`${code} is already in use.`); return;
    }
    if (departments.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
      setCustomError(`You already have a ${name} department.`); return;
    }
    setDepartments((cur) => [...cur, { name, code }]);
    setCustom({ name: '', code: '' });
    setCustomError(null);
    setCustomOpen(false);
  };

  // ── continue ───────────────────────────────────────────────────────

  const submit = async () => {
    const pending = editing !== null && draft.name.trim().length > 0;
    if (pending) { setError('Save the site you’re filling in first, or clear its name.'); return; }

    const qualifying = sites.filter((s) =>
      SITE_TYPES.find((t) => t.id === s.siteType)?.countsTowardMinimum);
    if (qualifying.length === 0) {
      setError('Add at least one manufacturing site or warehouse — records are organised by site.');
      return;
    }

    setBusy(true);
    setError(null);
    const r = await saveSitesStep(companyId, sites, departments, categories, initial);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onDone();
  };

  return (
    <OnboardingShell
      step={3}
      stepLabel="Sites, departments and products"
      title="Sites, departments and products"
      subtitle="Sites are the main way your records are organised. Batch records, materials and inspections all belong to a site."
      backLabel="Back"
      onBack={onBack}
      onContinue={submit}
      continueBusy={busy}
    >
      {/* ── Sites ─────────────────────────────────────────────────── */}
      <OnboardingCard
        title="Sites"
        description="Add every factory and warehouse. People can be assigned to one or more sites in the next step."
      >
        {initial.sitesUnavailable && (
          <p role="alert" style={alertText}>
            This workspace’s database doesn’t have the sites table yet. What you enter here can’t
            be saved until <code>scripts/fix/onboarding-all.sql</code> has been run in the Supabase
            SQL editor. It creates the sites table, the department codes and the product
            categories, and it is safe to run more than once.
          </p>
        )}

        {sites.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
            {sites.map((site, i) => (
              <li key={`${site.name}-${i}`} style={siteCard}>
                <span aria-hidden="true" style={{ color: 'var(--nv-icon-default)', marginTop: 2 }}>
                  <Pin {...iconProps('sm')} />
                </span>

                <div style={{ flex: '1 1 0', minWidth: 0, display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{
                      fontWeight: 600, fontSize: 14, lineHeight: '20px',
                      color: 'var(--nv-text-primary)',
                    }}>
                      {site.name}
                    </span>
                    <span style={badge}>{siteTypeBadge(site.siteType)}</span>
                  </div>

                  {site.address && <p style={siteLine}>{site.address}</p>}

                  {site.productCategories.length > 0 ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                      {site.productCategories.map((c) => (
                        <Chip key={c} label={productCategoryLabel(c)} selected />
                      ))}
                    </div>
                  ) : (
                    //  A warehouse that only stores makes nothing, and its
                    //  note is what the card has to say instead.
                    site.notes && <p style={siteLine}>{site.notes}</p>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
                  <IconAction label={`Edit ${site.name}`} icon={Edit} onClick={() => openEdit(i)} />
                  <IconAction label={`Remove ${site.name}`} icon={Delete} onClick={() => removeSite(i)} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {editing !== null ? (
          <div style={formWell}>
            <FieldRow>
              <NavyField
                label="Site name"
                required
                value={draft.name}
                placeholder="Ibadan plant"
                error={draftError}
                onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setDraftError(null); }}
              />
              <NavySelect
                label="What happens here"
                required
                value={draft.siteType}
                options={SITE_TYPES.map((t) => t.label)}
                onChange={(e) => {
                  const picked = SITE_TYPES.find((t) => t.label === e.target.value);
                  setDraft({ ...draft, siteType: picked?.id ?? 'manufacturing' });
                }}
              />
            </FieldRow>

            <NavyField
              label="Address"
              value={draft.address}
              placeholder="14 Oluyole Industrial Estate, Ibadan, Oyo State"
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            />

            <div>
              <p style={legend}>WHAT THIS SITE MAKES</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PRODUCT_CATEGORIES.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.label}
                    selected={draft.productCategories.includes(c.id)}
                    onToggle={() => setDraft({
                      ...draft,
                      productCategories: draft.productCategories.includes(c.id)
                        ? draft.productCategories.filter((x) => x !== c.id)
                        : [...draft.productCategories, c.id],
                    })}
                  />
                ))}
              </div>
              <p style={hint}>Leave these empty for a site that only stores or ships.</p>
            </div>

            <NavyField
              label="Note"
              value={draft.notes}
              placeholder="Stores finished goods. No manufacturing."
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />

            <div style={{ display: 'flex', gap: 12 }}>
              <NavyButton variant="outline" onClick={commitDraft}>
                {editing === 'new' ? 'Save site' : 'Save changes'}
              </NavyButton>
              <NavyButton variant="ghost" onClick={cancelDraft}>Cancel</NavyButton>
            </div>
          </div>
        ) : (
          <div>
            <NavyButton variant="outline" onClick={openNew}>Add a site</NavyButton>
          </div>
        )}
      </OnboardingCard>

      {/* ── Product categories ────────────────────────────────────── */}
      <OnboardingCard
        title="Product categories"
        description="Everything you make or hold registrations for. Categories decide which document checklists apply to your applications."
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRODUCT_CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              selected={categories.includes(c.id)}
              onToggle={() => setCategories((cur) =>
                cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id])}
            />
          ))}
        </div>
      </OnboardingCard>

      {/* ── Departments ───────────────────────────────────────────── */}
      <OnboardingCard
        title="Departments"
        description="Departments raise records and set document numbers. We suggested the usual ones; rename or add your own."
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            ...SUGGESTED_DEPARTMENTS,
            //  Departments the workspace already has, or added just now,
            //  that are not among the suggestions.
            ...departments.filter((d) =>
              !SUGGESTED_DEPARTMENTS.some((s) => s.name === d.name)),
          ].map((d) => (
            <Chip
              key={d.name}
              label={d.code ? `${d.name} · ${d.code}` : d.name}
              selected={departments.some((x) => x.name === d.name)}
              onToggle={() => toggleDepartment(d.name, d.code)}
            />
          ))}
        </div>

        {/*  The card promises "add your own", so there is somewhere to do
            it. Codes are validated here rather than at save time, because
            the constraint that would refuse them is in the database and
            its message is not written for a person.  */}
        {customOpen ? (
          <div style={formWell}>
            <FieldRow>
              <NavyField
                label="Department name"
                required
                value={custom.name}
                placeholder="Microbiology"
                onChange={(e) => { setCustom({ ...custom, name: e.target.value }); setCustomError(null); }}
              />
              <NavyField
                label="Code"
                required
                value={custom.code}
                placeholder="MICRO"
                maxLength={8}
                error={customError}
                hint="2–8 letters or digits. It appears in every document number this department raises."
                onChange={(e) => {
                  setCustom({ ...custom, code: e.target.value.toUpperCase() });
                  setCustomError(null);
                }}
              />
            </FieldRow>
            <div style={{ display: 'flex', gap: 12 }}>
              <NavyButton variant="outline" onClick={addCustomDepartment}>Add department</NavyButton>
              <NavyButton variant="ghost" onClick={() => { setCustomOpen(false); setCustomError(null); }}>
                Cancel
              </NavyButton>
            </div>
          </div>
        ) : (
          <div>
            <NavyButton variant="ghost" onClick={() => setCustomOpen(true)} style={{ padding: 0 }}>
              <Add {...iconProps('sm')} aria-hidden="true" />
              Add your own
            </NavyButton>
          </div>
        )}

        <div style={previewStrip}>
          <span style={{ ...legend, margin: 0, flex: 'none' }}>NUMBERING PREVIEW</span>
          {preview.length > 0 ? (
            <span style={{
              fontFamily: 'var(--nv-font-mono)', fontSize: 12, lineHeight: '18px',
              color: 'var(--nv-text-primary)',
            }}>
              {preview.join('  ·  ')}
            </span>
          ) : (
            <span style={{ fontSize: 12, lineHeight: '18px', color: 'var(--nv-text-tertiary)' }}>
              Choose a department to see how its documents will be numbered.
            </span>
          )}
        </div>
      </OnboardingCard>

      {/* ── Optional import ───────────────────────────────────────── */}
      <OnboardingCard
        title="Already tracking this in spreadsheets?"
        description="Bring in products, licences and open CAPAs now, or later from the dashboard. We check each row before anything is saved."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <NavyButton variant="outline" onClick={downloadImportTemplate}>
            Download template
          </NavyButton>
          <span style={{ fontSize: 14, lineHeight: '21px', color: 'var(--nv-text-tertiary)' }}>
            Upload .xlsx or .csv
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: '19px', color: 'var(--nv-text-secondary)' }}>
          {IMPORT_NOT_READY_NOTE}
        </p>
      </OnboardingCard>

      {error && <p role="alert" style={alertText}>{error}</p>}
    </OnboardingShell>
  );
}

/**
 * The pencil and the bin on a site card.
 *
 * A real button with a name, not an icon in a div: "edit" and "delete"
 * sitting side by side with no label is the one place a screen reader
 * user cannot guess which is which, and guessing wrong deletes a site.
 */
function IconAction({ label, icon: Icon, onClick }: {
  label: string; icon: typeof ICONS['action/edit']; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="navy-btn"
      data-variant="ghost"
      style={{
        width: 32, height: 32, display: 'grid', placeItems: 'center',
        borderRadius: 8, border: '1px solid transparent', background: 'transparent',
        color: 'var(--nv-icon-default)', cursor: 'pointer',
      }}
    >
      <Icon {...iconProps('sm')} aria-hidden="true" />
    </button>
  );
}

const siteCard: React.CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'flex-start',
  padding: 16, borderRadius: 12,
  background: 'var(--nv-surface-recessed)',
  border: '1px solid var(--nv-border-default)',
};

const siteLine: React.CSSProperties = {
  margin: 0, fontSize: 13, lineHeight: '19px', color: 'var(--nv-text-secondary)',
};

const badge: React.CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10, lineHeight: '14px', letterSpacing: '0.08em',
  color: 'var(--nv-text-tertiary)',
};

const formWell: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 16,
  padding: 16, borderRadius: 12,
  background: 'var(--nv-surface-recessed)',
  border: '1px solid var(--nv-border-default)',
};

const legend: React.CSSProperties = {
  margin: '0 0 8px',
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 11, lineHeight: '16px', letterSpacing: '0.06em',
  color: 'var(--nv-text-tertiary)',
};

const hint: React.CSSProperties = {
  margin: '8px 0 0', fontSize: 12, lineHeight: '18px', color: 'var(--nv-text-tertiary)',
};

const previewStrip: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
  padding: '10px 14px', borderRadius: 8,
  background: 'var(--nv-surface-recessed)',
  border: '1px solid var(--nv-border-default)',
};

const alertText: React.CSSProperties = {
  margin: 0, fontSize: 13, lineHeight: '19px', color: '#ffb4a6',
};
