/**
 * Raising a deviation (DV-01, DV-02, DV-03, DV-M01, DV-M02, DV-M03).
 *
 * ═════════════════════════════════════════════════════════════════════
 * IT DOES NOT TAKE THE PERSON AWAY FROM THE RECORD
 * ═════════════════════════════════════════════════════════════════════
 * "Raise flow makes the user leave the record: no. Sheet, drawer or
 * phone sheet over the record; Cancel returns to it."
 *
 * That is why this is an overlay with three presentations rather than
 * a page with a route. A page would lose the batch somebody is
 * standing at — and the context this sheet locks in place is exactly
 * what a page would have had to ask for again.
 *
 *   sheet       tablet, over the batch record (DV-01, DV-03)
 *   drawer      desktop, from the side (DV-02)
 *   fullscreen  phone (DV-M01 to DV-M03)
 *
 * ═════════════════════════════════════════════════════════════════════
 * NOTHING IS PRESELECTED, AND THE TYPES SAY SO
 * ═════════════════════════════════════════════════════════════════════
 * "Impact preselected: no. All three options start empty, a blank
 * impact is an error."
 *
 * `DeviationDraft.severity` and `.impact` are `… | null`, `emptyDraft`
 * returns nulls, and there is no `defaultImpact` prop for a caller to
 * reach for. A default here would not be inaccurate so much as
 * dishonest: the field exists because somebody decided, and a form
 * that arrives with an answer collects the form author's opinion
 * several thousand times under the name of whoever pressed Raise.
 *
 * THE CONSEQUENCES ARE NOT WRITTEN HERE. Each option's effect on
 * release comes from `deviation_impact_consequence`, derived from the
 * gate's own rule and from the company's setting for an undetermined
 * impact — W5·11 decision 1, which is open. A sentence composed in
 * this file would be the sheet's opinion of a rule it does not own,
 * and it would go on saying it after somebody changed the setting.
 *
 * THE BUTTON SAYS WHAT IS MISSING rather than going dim: "Raise
 * unavailable with the reason shown" (DV-01).
 */

import type { CSSProperties, ReactNode } from 'react';
import { X, AlertTriangle, Info, Lock } from 'lucide-react';
import {
  checkDraft, canRaise, raiseButtonLabel, sortOptions, chosenConsequence,
  consequenceTone, contextIsComplete, raiseHeading, optionsAreWellFormed,
  SEVERITIES, SEVERITY_LABEL, SEVERITY_MEANING,
  type DeviationDraft, type ImpactOption, type Severity, type Impact,
  type ContextLine,
} from '../../lib/deviations/raise';

export type Presentation = 'sheet' | 'drawer' | 'fullscreen';

export interface RaiseDeviationSheetProps {
  presentation: Presentation;
  draft: DeviationDraft;
  onChange: (next: DeviationDraft) => void;
  /** The locked context, read from the record this was opened over. */
  context: ContextLine[];
  sourceLabel: string | null;
  /** From deviation_impact_consequence. Three rows, each stating what
   *  that option does to release. */
  impactOptions: ImpactOption[];
  onRaise: () => void;
  /** Returns to the record. Never navigates. */
  onCancel: () => void;
  /**
   * Whether Raise has been pressed with something missing.
   *
   * THE FIELD-LEVEL MESSAGES WAIT FOR THIS. The button says what is
   * outstanding from the first render — that is the design's "Raise
   * unavailable with the reason shown" — but a sheet that arrives
   * with three red lines on it is scolding somebody for not having
   * filled in a form they have just opened. After a press, the
   * messages appear beside the fields they are about, which is where
   * somebody looking for them will be.
   */
  attempted?: boolean;
  className?: string;
}

export default function RaiseDeviationSheet(p: RaiseDeviationSheetProps) {
  const phone = p.presentation === 'fullscreen';
  const problems = p.attempted ? checkDraft(p.draft) : [];
  const options = sortOptions(p.impactOptions);
  const chosen = chosenConsequence(options, p.draft.impact);
  const tone = consequenceTone(chosen);

  //  A sheet that offered two options, or four, would be about to
  //  collect something the column refuses. Said on screen rather than
  //  failing at the round trip.
  const optionsBroken = options.length > 0 && !optionsAreWellFormed(options);
  const contextBroken = !contextIsComplete(p.context);

  //  Floor-use rules (W4 item 02) are still pending; the tablet sheet
  //  uses the W4 assumptions — 56 px buttons and close target, choices
  //  at least 52 px — and phones use 44–52. Decision 7.
  const target = phone ? 48 : 56;
  const choiceHeight = phone ? 52 : 56;

  return (
    <div className={p.className} style={{ ...shell, ...SHELL[p.presentation] }}
         role="dialog" aria-modal="true" aria-labelledby="raise-heading">
      <header style={{ ...head, ...(phone ? headPhone : null) }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h2 id="raise-heading" style={{ ...heading, ...(phone ? headingPhone : null) }}>
            {raiseHeading(p.draft.sourceType, p.sourceLabel)}
          </h2>
          <span style={meta}>Any user can raise a deviation.</span>
        </div>
        <button
          type="button"
          style={{ ...closeButton, width: target, height: target }}
          onClick={p.onCancel}
          aria-label="Close without raising, and go back to the record"
        >
          <X size={22} strokeWidth={2.25} aria-hidden />
        </button>
      </header>

      <div style={body}>
        {/*  THE LOCKED CONTEXT. Read from the record, not typed — which
            is the whole reason the flow opens over the record. */}
        <section style={contextCard} aria-label="What this is raised against">
          <span style={contextHead}>
            <Lock size={14} strokeWidth={2} aria-hidden />
            Filled in from the record
          </span>
          {contextBroken ? (
            <p style={problemText}>
              This sheet has lost the record it was opened over, so the context is
              incomplete. Close it and start again from the record rather than raising a
              deviation against nothing.
            </p>
          ) : (
            <dl style={contextGrid}>
              {p.context.map((l) => (
                <div key={l.key} style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                  <dt style={contextLabel}>{l.label}</dt>
                  <dd style={contextValue}>{l.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {/*  Title first: deviations.title is NOT NULL (3B.1), and it is
            the line everybody reads in the register. */}
        <Field
          label="Title"
          hint="One line — what happened."
          problem={problems.find((x) => x.field === 'title')?.message}
        >
          <input
            value={p.draft.title}
            onChange={(e) => p.onChange({ ...p.draft, title: e.target.value })}
            placeholder="Tablet mass above the action limit on check #14"
            style={{ ...input, minHeight: target }}
          />
        </Field>

        <Field label="What happened" hint="Optional. The detail the investigation starts from.">
          <textarea
            value={p.draft.description}
            onChange={(e) => p.onChange({ ...p.draft, description: e.target.value })}
            rows={3}
            style={textarea}
          />
        </Field>

        {/*  SEVERITY. Each option says what it means, and none of them
            mentions blocking — the commonest mistake on this screen is
            reaching for Critical to make something stop, when the
            field that stops it is the one underneath. */}
        <Field
          label="Severity"
          hint="How serious the departure is. This does not gate release."
          problem={problems.find((x) => x.field === 'severity')?.message}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SEVERITIES.map((s) => (
              <Choice
                key={s}
                height={choiceHeight}
                chosen={p.draft.severity === s}
                onPick={() => p.onChange({ ...p.draft, severity: s })}
                title={SEVERITY_LABEL[s]}
                detail={SEVERITY_MEANING[s]}
              />
            ))}
          </div>
        </Field>

        {/*  IMPACT. The field that does gate release, with each option
            stating what it will do — before anything is chosen. */}
        <Field
          label="Does this affect product quality?"
          hint="This is what gates release."
          problem={problems.find((x) => x.field === 'impact')?.message}
        >
          {optionsBroken ? (
            <p style={problemText}>
              The impact options did not load correctly, so this sheet cannot say what
              choosing one would do. Close it and try again rather than raising on a guess.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {options.map((o) => (
                <Choice
                  key={o.impact}
                  height={choiceHeight}
                  chosen={p.draft.impact === o.impact}
                  onPick={() => p.onChange({ ...p.draft, impact: o.impact as Impact })}
                  title={o.label}
                  detail={o.consequence}
                  //  The consequence is tinted by what it will DO, so
                  //  the blocking options read as blocking while the
                  //  person is still choosing.
                  tone={o.effect === 'blocks' ? 'blocked'
                    : o.effect === 'warns' ? 'flagged' : 'none'}
                />
              ))}
            </div>
          )}
        </Field>

        {/*  DV-03. Once an option is chosen its consequence is stated
            on its own, out of the list: the other two stop being
            relevant, and three equally loud sentences is how somebody
            reads the wrong one. */}
        {chosen && (
          <section
            style={{ ...consequencePanel, ...CONSEQUENCE_TONE[tone] }}
            role="status"
          >
            <span style={{ ...consequenceMark, ...CONSEQUENCE_MARK[tone] }}>
              {tone === 'blocked'
                ? <AlertTriangle size={18} strokeWidth={2.5} aria-hidden />
                : <Info size={18} strokeWidth={2.5} aria-hidden />}
            </span>
            <span style={{ flex: 1, minWidth: 180, fontSize: 14, lineHeight: '21px' }}>
              {chosen.consequence}
            </span>
          </section>
        )}
      </div>

      <footer style={{ ...foot, ...(phone ? footPhone : null) }}>
        <button
          type="button"
          style={{ ...cancel, minHeight: target }}
          onClick={p.onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          //  NEVER GREYED, never removed. It says what is missing, and
          //  pressing it is how somebody finds out — "Raise
          //  unavailable with the reason shown".
          style={{ ...raise, minHeight: target, ...(canRaise(p.draft) ? {} : raiseWaiting) }}
          onClick={p.onRaise}
        >
          {raiseButtonLabel(p.draft)}
        </button>
      </footer>
    </div>
  );
}

/** A labelled field with its hint and, when there is one, the problem
 *  that is stopping the raise — beside the field it is about rather
 *  than collected in a summary at the bottom. */
function Field({ label, hint, problem, children }: {
  label: string; hint?: string; problem?: string; children: ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={fieldLabel}>{label}</span>
      {hint && <span style={fieldHint}>{hint}</span>}
      {children}
      {problem && <span style={fieldProblem}>{problem}</span>}
    </label>
  );
}

/**
 * One option, as a button rather than a radio.
 *
 * A radio's hit area is the dot plus whatever a label wraps; this is
 * the whole row at 52–56 px, which is what the floor rules ask for and
 * what a gloved thumb actually finds. `aria-pressed` carries the state
 * that a radio would have carried.
 */
function Choice({ chosen, onPick, title, detail, height, tone = 'none' }: {
  chosen: boolean; onPick: () => void; title: string; detail: string;
  height: number; tone?: 'blocked' | 'flagged' | 'none';
}) {
  //  The dot takes the row's own accent. A red-edged row with a green
  //  dot inside it reads as two different answers to the same
  //  question — and the row that gets it is "Yes, this blocks
  //  release", where looking decided is the point.
  const accent = tone === 'blocked' ? 'var(--nv-light-state-rejected-bg)'
    : tone === 'flagged' ? 'var(--nv-light-badge-waiting-text)'
    : 'var(--nv-light-action-bg)';

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={chosen}
      style={{
        ...choice,
        minHeight: height,
        borderColor: chosen ? accent : 'var(--nv-light-border)',
        background: chosen ? 'var(--nv-light-select-fill)' : 'var(--nv-light-surface)',
      }}
    >
      <span style={{ ...radio, ...(chosen ? { borderColor: accent } : null) }} aria-hidden>
        {chosen && <span style={{ ...radioDot, background: accent }} />}
      </span>
      <span style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column',
                     gap: 2, textAlign: 'left' }}>
        <span style={{ fontWeight: 600, fontSize: 15, lineHeight: '21px' }}>{title}</span>
        <span style={{ fontSize: 13, lineHeight: '18px',
                       color: 'var(--nv-light-text-secondary)' }}>
          {detail}
        </span>
      </span>
    </button>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const shell: CSSProperties = {
  display: 'flex', flexDirection: 'column', minWidth: 0, boxSizing: 'border-box',
  background: 'var(--nv-light-surface)',
  border: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
  //  Overlays sit above the record rather than replacing it, so they
  //  carry a shadow that says so.
  boxShadow: '0 18px 48px rgba(13, 25, 51, 0.18)',
};

const SHELL: Record<Presentation, CSSProperties> = {
  //  Tablet, over the batch. Wide enough for the consequence sentences
  //  to sit on two lines rather than five.
  sheet: { width: '100%', maxWidth: 720, borderRadius: 16 },
  //  Desktop, from the side. Full height, square on the leading edge.
  drawer: { width: '100%', maxWidth: 520, borderRadius: '16px 0 0 16px', height: '100%' },
  //  Phone. Edge to edge, and the footer is pinned.
  fullscreen: { width: '100%', borderRadius: 0, border: 'none', minHeight: '100%' },
};

const head: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'flex-start',
  padding: '18px 20px', borderBottom: '1px solid var(--nv-light-border)',
};

const headPhone: CSSProperties = {
  position: 'sticky', top: 'env(safe-area-inset-top, 0px)', zIndex: 2,
  background: 'var(--nv-light-surface)', padding: '14px 16px',
};

const heading: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 21, lineHeight: '28px', textWrap: 'balance',
};

const headingPhone: CSSProperties = { fontSize: 18, lineHeight: '24px' };

const meta: CSSProperties = {
  fontSize: 12, lineHeight: '18px', color: 'var(--nv-light-text-tertiary)',
};

const closeButton: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  borderRadius: 10, background: 'var(--nv-light-surface)',
  border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)', cursor: 'pointer',
};

const body: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 18,
  padding: 20, overflowY: 'auto', flex: 1, minHeight: 0,
};

const contextCard: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8,
  padding: '12px 14px', borderRadius: 10,
  background: 'var(--nv-light-surface-sunken)',
  border: '1px solid var(--nv-light-border)',
};

const contextHead: CSSProperties = {
  display: 'flex', gap: 6, alignItems: 'center',
  fontFamily: 'var(--nv-font-mono)', fontSize: 10, lineHeight: '14px',
  letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--nv-light-text-tertiary)',
};

const contextGrid: CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: '6px 20px', margin: 0,
};

const contextLabel: CSSProperties = {
  margin: 0, fontSize: 13, lineHeight: '19px',
  color: 'var(--nv-light-text-secondary)', whiteSpace: 'nowrap',
};

const contextValue: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-mono)', fontSize: 13, lineHeight: '19px',
  color: 'var(--nv-light-text-primary)',
};

const fieldLabel: CSSProperties = { fontWeight: 600, fontSize: 15, lineHeight: '22px' };

const fieldHint: CSSProperties = {
  fontSize: 13, lineHeight: '18px', color: 'var(--nv-light-text-secondary)',
};

const fieldProblem: CSSProperties = {
  fontSize: 13, lineHeight: '19px', color: 'var(--nv-light-state-overdue-text)',
};

const problemText: CSSProperties = {
  margin: 0, padding: '10px 12px', borderRadius: 8,
  background: 'var(--nv-light-state-overdue-bg)',
  color: 'var(--nv-light-state-overdue-text)',
  fontSize: 13, lineHeight: '19px',
};

const input: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  borderRadius: 8, border: '1px solid var(--nv-light-border)',
  background: 'var(--nv-light-surface)', color: 'var(--nv-light-text-primary)',
  fontFamily: 'var(--nv-font-body)', fontSize: 15, lineHeight: '22px',
};

const textarea: CSSProperties = { ...input, resize: 'vertical', minHeight: 80 };

const choice: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  width: '100%', boxSizing: 'border-box', padding: '10px 14px',
  borderRadius: 10, borderWidth: 2, borderStyle: 'solid', cursor: 'pointer',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const radio: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22, flexShrink: 0, borderRadius: 11,
  border: '2px solid var(--nv-light-border)', background: 'var(--nv-light-surface)',
};

const radioDot: CSSProperties = {
  width: 10, height: 10, borderRadius: 5, background: 'var(--nv-light-action-bg)',
};

const consequencePanel: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap',
  padding: '12px 14px', borderRadius: 10,
  borderWidth: 2, borderStyle: 'solid',
};

const CONSEQUENCE_TONE: Record<'blocked' | 'flagged' | 'none', CSSProperties> = {
  blocked: {
    background: 'var(--nv-light-state-overdue-bg)',
    borderColor: 'var(--nv-light-state-overdue-border)',
    color: 'var(--nv-light-state-overdue-text)',
  },
  flagged: {
    background: 'var(--nv-light-badge-waiting-bg)',
    borderColor: 'var(--nv-light-badge-waiting-border)',
    color: 'var(--nv-light-badge-waiting-text)',
  },
  none: {
    background: 'var(--nv-light-surface-sunken)',
    borderColor: 'var(--nv-light-border)',
    color: 'var(--nv-light-text-primary)',
  },
};

const consequenceMark: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, flexShrink: 0, borderRadius: 14,
};

const CONSEQUENCE_MARK: Record<'blocked' | 'flagged' | 'none', CSSProperties> = {
  blocked: { background: 'var(--nv-light-state-rejected-bg)', color: '#ffffff' },
  flagged: { background: 'var(--nv-light-badge-waiting-border)',
             color: 'var(--nv-light-badge-waiting-text)' },
  none: { background: 'var(--nv-light-border)', color: 'var(--nv-light-text-primary)' },
};

const foot: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  padding: '14px 20px', borderTop: '1px solid var(--nv-light-border)',
};

const footPhone: CSSProperties = {
  position: 'sticky', bottom: 'env(safe-area-inset-bottom, 0px)',
  background: 'var(--nv-light-surface)', padding: '12px 16px',
};

const cancel: CSSProperties = {
  padding: '0 20px', borderRadius: 10,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 15, lineHeight: '22px',
  cursor: 'pointer',
};

const raise: CSSProperties = {
  flex: 1, minWidth: 180, padding: '0 20px', borderRadius: 10,
  background: 'var(--nv-light-action-bg)', border: '1px solid var(--nv-light-action-bg)',
  color: '#ffffff',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 16, lineHeight: '22px',
  cursor: 'pointer',
};

//  The waiting treatment, NOT a disabled one. Same reasoning as the
//  reading-entry save button: what is missing is one tap away, and a
//  greyed button makes somebody hunt for why.
const raiseWaiting: CSSProperties = {
  background: 'var(--nv-light-surface-sunken)',
  borderColor: 'var(--nv-light-border)',
  color: 'var(--nv-light-text-secondary)',
};

export type { Severity, Impact };
