/**
 * Root cause (DV-05, DV-05b, DV-M05, DV-M05b).
 *
 * ═════════════════════════════════════════════════════════════════════
 * ONE FRAMEWORK, AND THE OTHER ONE IS NOT RENDERED
 * ═════════════════════════════════════════════════════════════════════
 * "Root cause uses one framework per analysis, configurable per
 * company. Five whys and 5W1H no longer appear together."
 *
 * So this panel branches on `analysis.framework` and draws ONE of
 * them. Not both with one collapsed, not a tab strip — the other
 * framework's fields are not in the document at all. A collapsed
 * section is still in the accessibility tree, still focusable, and
 * still a place somebody can type an answer that the database will
 * then refuse.
 *
 * `hasForeignContent` is checked anyway, because a screen receives
 * whatever the transport gives it — a payload cached from before the
 * migration, a hand-rolled fixture — and a chain of whys drawn under a
 * 5W1H heading is the one failure that looks like a working screen.
 * When it fires the panel says so rather than drawing something
 * plausible.
 *
 * THE CHAIN HAS NO FIXED LENGTH. "Usually five steps; sometimes three,
 * sometimes seven." There is no progress bar out of five, because one
 * would make a three-step answer look unfinished — which is how people
 * learn to pad a chain to reach a number.
 *
 * THE CATEGORY LIST IS THE COMPANY'S. It arrives as a prop from
 * root_cause_categories_effective; the six defaults are decision 10
 * for the lead, which is a row to change rather than a deploy.
 */

import type { CSSProperties } from 'react';
import { AlertTriangle, CornerDownRight, Check } from 'lucide-react';
import {
  FRAMEWORKS, hasForeignContent, nextWhyQuestion, whyProgress, answerProgress,
  canComplete, completeButtonLabel,
  type RootCauseAnalysis,
} from '../../lib/deviations/investigation';

export interface CategoryOption { key: string; label: string }

/** Whether the chain is ready for another step: nothing recorded yet,
 *  or the last step answered. An unanswered step in the middle is a
 *  gap, and offering to add past it hides the gap. */
function lastWhyAnswered(whys: RootCauseAnalysis['whys']): boolean {
  if (whys.length === 0) return true;
  return (whys[whys.length - 1].answer ?? '').trim().length > 0;
}

export interface RootCausePanelProps {
  analysis: RootCauseAnalysis;
  /** From root_cause_categories_effective — the company's own list,
   *  active entries only. */
  categories: CategoryOption[];
  onAnswerWhy: (seq: number, answer: string) => void;
  onAddWhy: () => void;
  onAnswer: (key: string, answer: string) => void;
  onChangeRootCause: (value: string) => void;
  onChangeCategory: (key: string) => void;
  onComplete: () => void;
  className?: string;
}

export default function RootCausePanel(p: RootCausePanelProps) {
  const a = p.analysis;
  const spec = FRAMEWORKS[a.framework];
  const locked = a.completedAt !== null;

  //  The screen's own check. See the header: drawing the wrong
  //  framework's content is the failure that looks like it worked.
  if (hasForeignContent(a)) {
    return (
      <section className={p.className} style={{ ...card, ...brokenCard }} role="alert">
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <AlertTriangle size={20} strokeWidth={2.5} aria-hidden />
          <span style={{ fontWeight: 600, fontSize: 16 }}>
            This analysis holds content from both frameworks
          </span>
        </span>
        <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>
          It is recorded as {spec.label}, but it also carries answers belonging to the
          other framework. An analysis uses one or the other, so this is not drawn rather
          than drawn misleadingly. Somebody with database access needs to look at it.
        </p>
      </section>
    );
  }

  return (
    <section className={p.className} style={card} aria-labelledby="rca-heading">
      <header style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 id="rca-heading" style={title}>Root cause · {spec.label}</h2>
          <span style={hint}>{spec.description}</span>
        </div>
        <span style={counter}>
          {a.framework === 'five_whys'
            ? `${whyProgress(a.whys).answered} of ${whyProgress(a.whys).total} answered`
            : `${answerProgress(a.answers).answered} of ${answerProgress(a.answers).total} answered`}
        </span>
      </header>

      {/*  ONE OF THESE. The other framework's fields are not rendered
          — see the header. */}
      {a.framework === 'five_whys' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {a.whys.length === 0 && (
            <p style={emptyText}>
              Nothing asked yet. Start with why the deviation happened, then ask why that
              happened, until the answer is something the system can change.
            </p>
          )}
          {a.whys.map((w, i) => (
            <div key={w.seq} style={whyRow}>
              {/*  Indented by step, so the chain reads as a chain. */}
              <span style={{ ...whyIndent, paddingLeft: Math.min(i, 4) * 12 }} aria-hidden>
                <CornerDownRight size={16} strokeWidth={2} />
              </span>
              <label style={{ flex: 1, minWidth: 200, display: 'flex',
                              flexDirection: 'column', gap: 4 }}>
                <span style={whyQuestion}>{w.question}</span>
                <textarea
                  value={w.answer ?? ''}
                  onChange={(e) => p.onAnswerWhy(w.seq, e.target.value)}
                  readOnly={locked}
                  rows={2}
                  style={{ ...input, resize: 'vertical' }}
                />
              </label>
            </div>
          ))}

          {/*  Offered only once the last step has an answer. A chain
              with an empty step and a button inviting a sixth is a
              form that lets somebody skip a link and never notice —
              and the chain's whole value is that each answer follows
              from the one above it. */}
          {!locked && lastWhyAnswered(a.whys) && (
            <button type="button" style={addWhy} onClick={p.onAddWhy}>
              {/*  Phrased from the last answer, which is what makes it
                  a chain rather than five separate questions. */}
              Ask: {nextWhyQuestion(a.whys)}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {spec.prompts.map((q) => (
            <label key={q.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={whyQuestion}>{q.question}</span>
              <span style={hint}>{q.hint}</span>
              <textarea
                value={a.answers[q.key] ?? ''}
                onChange={(e) => p.onAnswer(q.key, e.target.value)}
                readOnly={locked}
                rows={2}
                style={{ ...input, resize: 'vertical' }}
              />
            </label>
          ))}
        </div>
      )}

      {/*  THE CONCLUSION. Stored as a discrete, searchable value
          (B2.7) rather than being read back out of the chain. */}
      <div style={conclusion}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={fieldLabel}>The root cause</span>
          <span style={hint}>
            One statement, in words somebody searching next year would use.
          </span>
          <input
            value={a.determinedRootCause ?? ''}
            onChange={(e) => p.onChangeRootCause(e.target.value)}
            readOnly={locked}
            placeholder="Fill cam worn beyond its service limit"
            style={input}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={fieldLabel}>Category</span>
          <span style={hint}>This company&rsquo;s list. Managed in settings.</span>
          <select
            value={a.rootCauseCategory ?? ''}
            onChange={(e) => p.onChangeCategory(e.target.value)}
            disabled={locked}
            style={input}
          >
            {/*  No preselection here either: the first entry is the
                absence of a choice, not a category that happens to
                sort first. */}
            <option value="">Choose a category…</option>
            {p.categories.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </label>
      </div>

      {locked ? (
        <p style={lockedNote}>
          <Check size={16} strokeWidth={2.5} aria-hidden style={{ flexShrink: 0 }} />
          Recorded on {a.completedAt}. The analysis is part of the deviation record now.
        </p>
      ) : (
        <button
          type="button"
          style={{ ...complete, ...(canComplete(a) ? {} : completeWaiting) }}
          onClick={p.onComplete}
        >
          {completeButtonLabel(a)}
        </button>
      )}
    </section>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0,
  padding: 20, borderRadius: 12,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const brokenCard: CSSProperties = {
  background: 'var(--nv-light-state-overdue-bg)',
  borderColor: 'var(--nv-light-state-overdue-border)',
  color: 'var(--nv-light-state-overdue-text)',
};

const title: CSSProperties = {
  margin: '0 0 2px', fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 20, lineHeight: '26px',
};

const hint: CSSProperties = {
  fontSize: 13, lineHeight: '18px', color: 'var(--nv-light-text-secondary)',
};

const counter: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 11, lineHeight: '16px',
  letterSpacing: '0.04em', color: 'var(--nv-light-text-tertiary)',
};

const whyRow: CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap',
};

const whyIndent: CSSProperties = {
  display: 'flex', alignItems: 'center', paddingTop: 4, flexShrink: 0,
  color: 'var(--nv-light-text-tertiary)',
};

const whyQuestion: CSSProperties = {
  fontWeight: 600, fontSize: 14, lineHeight: '20px',
};

const fieldLabel: CSSProperties = { fontWeight: 600, fontSize: 15, lineHeight: '22px' };

const input: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px',
  borderRadius: 8, border: '1px solid var(--nv-light-border)',
  background: 'var(--nv-light-surface)', color: 'var(--nv-light-text-primary)',
  fontFamily: 'var(--nv-font-body)', fontSize: 15, lineHeight: '22px',
};

const addWhy: CSSProperties = {
  alignSelf: 'flex-start', maxWidth: '100%',
  minHeight: 48, padding: '8px 16px', borderRadius: 10,
  background: 'var(--nv-light-surface-sunken)',
  border: '1px dashed var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 14, lineHeight: '20px',
  cursor: 'pointer', textAlign: 'left',
};

const emptyText: CSSProperties = {
  margin: 0, padding: '12px 14px', borderRadius: 8,
  background: 'var(--nv-light-surface-sunken)',
  fontSize: 14, lineHeight: '21px', color: 'var(--nv-light-text-secondary)',
};

const conclusion: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 14,
  paddingTop: 14, borderTop: '2px solid var(--nv-light-border)',
};

const complete: CSSProperties = {
  alignSelf: 'flex-start', minHeight: 48, padding: '0 20px', borderRadius: 10,
  background: 'var(--nv-light-action-bg)', border: '1px solid var(--nv-light-action-bg)',
  color: '#ffffff',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 15, lineHeight: '22px',
  cursor: 'pointer',
};

const completeWaiting: CSSProperties = {
  background: 'var(--nv-light-surface-sunken)',
  borderColor: 'var(--nv-light-border)',
  color: 'var(--nv-light-text-secondary)',
};

const lockedNote: CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'center', margin: 0,
  padding: '10px 12px', borderRadius: 8,
  background: 'var(--nv-light-badge-done-bg)',
  color: 'var(--nv-light-badge-done-text)',
  fontSize: 14, lineHeight: '21px',
};
