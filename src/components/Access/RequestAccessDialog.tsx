/**
 * DB-03 · Request access dialog (node 80:1048), and DB-M03, which is the
 * same dialog as a bottom sheet.
 *
 * Step 2 of the flow the page header describes: "They pick the section,
 * View or Act, which records, how long and why. Act is disabled where
 * segregation of duties forbids it."
 *
 * THE DISABLED ACT OPTION IS THE WHOLE POINT OF THE SCREEN. It would be
 * easier to hide it — a dialog that only offers what you can have never
 * has to explain itself. The design shows it, greyed, with a lock and
 * the reason spelled out, because somebody who cannot see the option
 * does not learn that the rule exists; they conclude the product is
 * broken and ask an admin, who then has to explain segregation of
 * duties from scratch. Showing the refusal and its reason is cheaper
 * than hiding it, and it is also the control an inspector wants to see
 * demonstrated.
 *
 * The reason itself comes from lib/access/permissionRequests, the same
 * function the admin's review drawer calls, so the sentence the asker
 * reads here and the sentence the admin reads there cannot drift apart.
 */

import { useMemo, useState, type CSSProperties } from 'react';
import { Lock, X, Calendar, Info } from 'lucide-react';
import {
  SECTION_LABELS, LEVEL_MEANING, MAX_GRANT_DAYS,
  canBeRequested, unrequestableReason, checkConflict,
  type AccessSection, type AccessLevel, type WorkRole, type AccessRequestInput,
} from '../../lib/access/permissionRequests';
import { icon } from '../../lib/design/icons';
import { SECTION_ICON } from './sectionIcons';

export interface RequestAccessDialogProps {
  /** The section the person tapped Request access on. */
  section: AccessSection;
  /** Their job, which is what the duties rule is checked against. */
  role: WorkRole;
  /** "Storekeeper" — for the sentence on the disabled option. */
  roleLabel: string;
  /** The two scope choices, narrowest first. From the design: "Lots I
   *  received" / "All lots at Ikeja plant". */
  scopeOptions: [string, string];
  /** Who it goes to, named in the routing note. */
  adminName: string;
  /** Today, for the default end date and the cap. Injectable for tests. */
  today?: Date;
  onCancel: () => void;
  onSend: (request: AccessRequestInput) => void | Promise<void>;
  /** True while the request is in flight. */
  sending?: boolean;
  /** Laid out as a centred dialog or as a bottom sheet (DB-M03). */
  variant?: 'dialog' | 'sheet';
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** "31 Oct 2026", the design's date format. */
function human(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}`;
}

export default function RequestAccessDialog({
  section, role, roleLabel, scopeOptions, adminName,
  today = new Date(), onCancel, onSend, sending = false, variant = 'dialog',
}: RequestAccessDialogProps) {
  const [level, setLevel] = useState<AccessLevel>('view');
  const [scope, setScope] = useState(scopeOptions[0]);
  const [dated, setDated] = useState(true);
  //  The design's default is a date about three weeks out, not the cap.
  //  Defaulting to the maximum would make every request the longest one
  //  the rules allow, which is the opposite of asking for what you need.
  const [until, setUntil] = useState(() => iso(new Date(today.getTime() + 21 * 86400000)));
  const [reason, setReason] = useState('');

  const actConflict = useMemo(() => checkConflict(role, section, 'act'), [role, section]);
  const SectionIcon = icon(SECTION_ICON[section]);
  const requestable = canBeRequested(section);
  const meaning = LEVEL_MEANING[section];
  const maxDate = iso(new Date(today.getTime() + MAX_GRANT_DAYS * 86400000));

  //  A section that cannot be requested should never have opened this
  //  dialog — the tile has no button. If it somehow does, say so rather
  //  than offering a form whose Send can only fail.
  if (!requestable) {
    return (
      <div style={{ ...(variant === 'sheet' ? sheet : dialog), gap: 16 }} role="dialog" aria-modal="true">
        <Header
          title={SECTION_LABELS[section]}
          blurb={unrequestableReason(section)!}
          onClose={onCancel}
        />
        <div style={footer}>
          <button type="button" style={ghostButton} onClick={onCancel}>Close</button>
        </div>
      </div>
    );
  }

  const canSend = reason.trim().length > 0 && !sending;

  return (
    <form
      style={variant === 'sheet' ? sheet : dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-access-title"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSend) return;
        void onSend({ section, level, scope, until: dated ? until : null, reason: reason.trim() });
      }}
    >
      <Header
        title="Request access"
        blurb="Goes to the Compliance admin, who can grant it, narrow it or decline it."
        onClose={onCancel}
      />

      <Field label="Section">
        {/*  Not a select. The person arrived here from one locked tile,
            and the section is what they tapped — offering a dropdown
            would invite them to request something they have not seen
            the lock on. It is shown so they can confirm it, and the
            dialog is closed and reopened to change it. */}
        <div style={select} aria-readonly="true">
          <SectionIcon size={16} strokeWidth={1.5} aria-hidden style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14 }}>
            {SECTION_LABELS[section]}
          </span>
        </div>
      </Field>

      <fieldset style={fieldset}>
        <legend style={label}>Access level</legend>

        <label style={{ ...option, ...(level === 'view' ? optionSelected : optionPlain) }}>
          <input
            type="radio" name="level" value="view" checked={level === 'view'}
            onChange={() => setLevel('view')} style={radio}
          />
          <span style={optionBody}>
            <span style={optionTitle}>View</span>
            <span style={optionBlurb}>{meaning.view}</span>
          </span>
        </label>

        {/*  Disabled, visible, and explained. See the header comment. */}
        <label
          style={{ ...option, ...(actConflict.conflicts ? optionDisabled
            : level === 'act' ? optionSelected : optionPlain) }}
        >
          <input
            type="radio" name="level" value="act" checked={level === 'act'}
            disabled={actConflict.conflicts}
            onChange={() => setLevel('act')} style={radio}
          />
          <span style={optionBody}>
            <span style={{
              ...optionTitle, display: 'inline-flex', alignItems: 'center', gap: 6,
              color: actConflict.conflicts ? 'var(--nv-light-text-tertiary)' : optionTitle.color,
            }}>
              Act
              {actConflict.conflicts && <Lock size={16} strokeWidth={1.5} aria-hidden />}
            </span>
            <span style={{
              ...optionBlurb,
              color: actConflict.conflicts ? 'var(--nv-light-text-tertiary)' : optionBlurb.color,
            }}>
              {meaning.act}
              {actConflict.conflicts
                && ` Not available to ${roleLabel}s: ${lowerFirst(actConflict.reason!)}`}
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset style={fieldset}>
        <legend style={label}>Which records</legend>
        <Segmented
          options={scopeOptions}
          value={scope}
          onChange={setScope}
          name="scope"
        />
      </fieldset>

      <fieldset style={fieldset}>
        <legend style={label}>For how long</legend>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Segmented
            options={['Until a date', 'No end date']}
            value={dated ? 'Until a date' : 'No end date'}
            onChange={(v) => setDated(v === 'Until a date')}
            name="duration"
            style={{ flex: 1, minWidth: 220 }}
          />
          {dated && (
            <label style={dateBox}>
              <Calendar size={16} strokeWidth={1.5} aria-hidden />
              <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
                End date
              </span>
              <input
                type="date" value={until} min={iso(today)} max={maxDate}
                onChange={(e) => setUntil(e.target.value)}
                style={dateInput}
              />
            </label>
          )}
        </div>
        {dated && (
          //  The cap is stated before it is enforced. A date input that
          //  silently refuses a value teaches nothing.
          <p style={hint}>At most {MAX_GRANT_DAYS} days — until {human(maxDate)}.</p>
        )}
      </fieldset>

      <Field
        label="Why do you need it?"
        requirement="Required"
        hint="The admin sees this exactly as you write it."
      >
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          required
          placeholder="What you need to do, and why this section is where it is done."
          style={{ ...textarea, borderColor: reason.trim() ? 'var(--nv-light-action-bg)' : 'var(--nv-light-outline-border)' }}
        />
      </Field>

      <p style={routingNote}>
        <Info size={16} strokeWidth={1.5} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Goes to {adminName} (Compliance admin). You'll get a notification when they
          decide. Nothing changes until then.
        </span>
      </p>

      <div style={footer}>
        <button type="button" style={ghostButton} onClick={onCancel}>Cancel</button>
        <button
          type="submit"
          style={{ ...primaryButton, ...(canSend ? null : disabledButton) }}
          disabled={!canSend}
          aria-busy={sending}
        >
          {sending ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </form>
  );
}

/** "QC results must…" → "QC results must…"; only drops a capital that a
 *  mid-sentence position makes wrong, and leaves acronyms alone. */
function lowerFirst(s: string): string {
  if (s.length < 2) return s;
  //  "QC", "QA", "CAPA" — two capitals in a row means it is an acronym
  //  and lowering the first letter would misspell it.
  if (s[1] === s[1].toUpperCase() && s[1] !== s[1].toLowerCase()) return s;
  return s[0].toLowerCase() + s.slice(1);
}

// ── The small parts ──────────────────────────────────────────────────

function Header({ title, blurb, onClose }: { title: string; blurb: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}>
      <span style={headerIcon}><Lock size={20} strokeWidth={1.75} aria-hidden /></span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span id="request-access-title" style={headerTitle}>{title}</span>
        <span style={headerBlurb}>{blurb}</span>
      </span>
      <button type="button" onClick={onClose} style={closeButton} aria-label="Close">
        <X size={20} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}

function Field({ label: text, requirement, hint: hintText, children }: {
  label: string; requirement?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <label style={fieldset}>
      <span style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
        <span style={label}>{text}</span>
        {requirement && <span style={{ ...hint, margin: 0 }}>{requirement}</span>}
      </span>
      {children}
      {hintText && <span style={hint}>{hintText}</span>}
    </label>
  );
}

function Segmented({ options, value, onChange, name, style }: {
  options: readonly string[]; value: string; onChange: (v: string) => void;
  name: string; style?: CSSProperties;
}) {
  return (
    <div style={{ ...segmented, ...style }} role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          key={o} type="button" role="radio" aria-checked={value === o}
          onClick={() => onChange(o)}
          style={{ ...segment, ...(value === o ? segmentOn : segmentOff) }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

// ── Styles, from the node's own measurements ─────────────────────────

const dialog: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 20,
  padding: 24, borderRadius: 12,
  width: 'min(560px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 64px)',
  overflowY: 'auto',
  background: '#ffffff',
  border: '1px solid var(--nv-light-border)',
  boxShadow: '0 12px 32px rgba(13, 26, 51, 0.18)',
  fontFamily: 'var(--nv-font-body)',
  color: 'var(--nv-light-text-primary)',
};

//  DB-M03. Full width, flat at the bottom, and taller than the dialog
//  is allowed to be, because a sheet scrolls against the thumb.
const sheet: CSSProperties = {
  ...dialog,
  width: '100%', borderRadius: '16px 16px 0 0',
  maxHeight: '92vh',
  paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
};

const headerIcon: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 36, height: 36, flexShrink: 0, borderRadius: 8,
  background: '#e6f0e6', color: 'var(--nv-light-action-bg)',
};

const headerTitle: CSSProperties = {
  fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 20, lineHeight: '26px',
};

const headerBlurb: CSSProperties = {
  fontSize: 12, lineHeight: '18px', color: 'var(--nv-light-text-tertiary)',
};

const closeButton: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, flexShrink: 0,
  border: 'none', background: 'none', borderRadius: 6, cursor: 'pointer',
  color: 'var(--nv-light-text-secondary)',
};

const fieldset: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8,
  width: '100%', margin: 0, padding: 0, border: 'none',
};

const label: CSSProperties = {
  fontWeight: 600, fontSize: 13, lineHeight: '18px',
  color: 'var(--nv-light-text-primary)', padding: 0,
};

const hint: CSSProperties = {
  margin: 0, fontSize: 12, lineHeight: '18px', fontWeight: 400,
  color: 'var(--nv-light-text-tertiary)',
};

const select: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  height: 44, padding: '0 12px', borderRadius: 8,
  background: '#ffffff', border: '1px solid var(--nv-light-outline-border)',
  color: 'var(--nv-light-text-primary)',
};

const option: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'flex-start',
  padding: 14, borderRadius: 8, width: '100%',
  cursor: 'pointer',
};

const optionSelected: CSSProperties = {
  background: 'var(--nv-light-select-fill)',
  border: '1.5px solid var(--nv-light-action-bg)',
};

const optionPlain: CSSProperties = {
  background: '#ffffff',
  border: '1.5px solid var(--nv-light-border)',
};

const optionDisabled: CSSProperties = {
  background: 'var(--nv-light-surface-sunken)',
  border: '1.5px solid var(--nv-light-border)',
  cursor: 'not-allowed',
};

const radio: CSSProperties = {
  width: 18, height: 18, flexShrink: 0, marginTop: 1,
  accentColor: 'var(--nv-light-action-bg)',
};

const optionBody: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0,
};

const optionTitle: CSSProperties = {
  fontWeight: 600, fontSize: 14, lineHeight: '20px',
  color: 'var(--nv-light-text-primary)',
};

const optionBlurb: CSSProperties = {
  fontSize: 12, lineHeight: '18px', color: 'var(--nv-light-text-secondary)',
};

const segmented: CSSProperties = {
  display: 'flex', gap: 4, padding: 4, borderRadius: 8,
  background: 'var(--nv-light-surface-sunken)',
};

const segment: CSSProperties = {
  flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: 6,
  fontFamily: 'var(--nv-font-body)', fontSize: 13, lineHeight: '18px',
  cursor: 'pointer',
};

const segmentOn: CSSProperties = {
  background: '#ffffff', border: '1px solid var(--nv-light-outline-border)',
  fontWeight: 600, color: 'var(--nv-light-text-primary)',
};

const segmentOff: CSSProperties = {
  background: 'none', border: '1px solid transparent',
  fontWeight: 400, color: 'var(--nv-light-text-secondary)',
};

const dateBox: CSSProperties = {
  position: 'relative',
  display: 'flex', alignItems: 'center', gap: 8,
  height: 44, padding: '0 12px', borderRadius: 8, width: 180,
  background: '#ffffff', border: '1px solid var(--nv-light-outline-border)',
  color: 'var(--nv-light-text-primary)',
};

const dateInput: CSSProperties = {
  flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none',
  fontFamily: 'var(--nv-font-body)', fontSize: 14,
  color: 'var(--nv-light-text-primary)',
};

const textarea: CSSProperties = {
  width: '100%', minHeight: 88, padding: 12, borderRadius: 8, resize: 'vertical',
  background: '#ffffff', borderWidth: 1.5, borderStyle: 'solid',
  fontFamily: 'var(--nv-font-body)', fontSize: 14, lineHeight: '20px',
  color: 'var(--nv-light-text-primary)',
};

const routingNote: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'flex-start',
  margin: 0, padding: 12, borderRadius: 8, width: '100%',
  background: 'var(--nv-light-state-hold-bg)',
  color: 'var(--nv-light-state-hold-text)',
  fontSize: 12, lineHeight: '18px',
};

const footer: CSSProperties = {
  display: 'flex', gap: 12, justifyContent: 'flex-end', width: '100%', flexWrap: 'wrap',
};

const buttonBase: CSSProperties = {
  height: 40, padding: '0 18px', borderRadius: 8, minWidth: 120,
  fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 15, lineHeight: '20px', cursor: 'pointer',
};

const ghostButton: CSSProperties = {
  ...buttonBase,
  background: 'var(--nv-light-outline-bg)',
  border: '1px solid var(--nv-light-outline-border)',
  color: 'var(--nv-light-outline-text)',
};

const primaryButton: CSSProperties = {
  ...buttonBase,
  background: 'var(--nv-light-action-bg)', border: '1px solid var(--nv-light-action-bg)',
  color: 'var(--nv-light-action-text)',
};

const disabledButton: CSSProperties = {
  background: 'var(--nv-light-disabled-bg)',
  border: '1px solid var(--nv-light-disabled-border)',
  color: 'var(--nv-light-disabled-text)',
  cursor: 'not-allowed',
};
