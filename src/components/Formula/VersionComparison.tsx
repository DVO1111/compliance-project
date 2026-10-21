/**
 * MF-05 · Version comparison (node 140:1066).
 *
 * "Versions can't be compared: no. MF-05 compares any two." — grouped
 * by stage, old beside new.
 *
 * THE GROUPING IS THE POINT. A flat list of forty differences is a
 * changelog; a reviewer approving v4 needs to answer "what happened to
 * compression", and that is a question about a stage. So differences
 * arrive already carrying their stage and are grouped here, with the
 * formula-level and bill-of-materials changes in their own groups
 * because they belong to no stage.
 *
 * NOTHING IS COMPUTED HERE. The differences come from
 * master_formula_compare, which matches stages on stage_code and
 * parameters on (stage_code, parameter) rather than on display name —
 * so a renamed stage reads as a change and not as a removal plus an
 * addition. Re-deriving that in the browser would mean fetching both
 * versions whole and getting exactly that case wrong.
 */

import type { CSSProperties } from 'react';
import { Plus, Minus, ArrowRight, MoveVertical } from 'lucide-react';

export type ChangeKind = 'added' | 'removed' | 'changed' | 'moved';
export type ChangeScope = 'formula' | 'stage' | 'parameter' | 'material';

export interface FormulaDifference {
  stageCode: string | null;
  stageName: string | null;
  sequenceNo: number | null;
  scope: ChangeScope;
  change: ChangeKind;
  /** The thing that changed: a stage name, a parameter, a material. */
  item: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  sortOrder: number;
}

export interface VersionComparisonProps {
  /** "3" and "4" — the version labels, not ids. */
  fromVersion: string;
  toVersion: string;
  differences: FormulaDifference[];
  className?: string;
}

interface Group {
  key: string;
  title: string;
  /** "Stage 7" or null for the two non-stage groups. */
  caption: string | null;
  rows: FormulaDifference[];
}

/**
 * Stage groups in stage order, then the bill of materials, then the
 * formula's own fields.
 *
 * Deliberately NOT by severity or by change kind. Somebody reading a
 * comparison is walking the formula, and a list that reordered itself
 * by how alarming each row was would stop matching the thing being
 * reviewed.
 */
export function groupDifferences(differences: FormulaDifference[]): Group[] {
  const stages = new Map<string, Group>();
  const materials: FormulaDifference[] = [];
  const formula: FormulaDifference[] = [];

  for (const d of differences) {
    if (d.scope === 'material') { materials.push(d); continue; }
    if (d.scope === 'formula') { formula.push(d); continue; }

    const key = d.stageCode ?? '(none)';
    if (!stages.has(key)) {
      stages.set(key, {
        key,
        title: d.stageName ?? key,
        caption: d.sequenceNo != null ? `Stage ${d.sequenceNo}` : null,
        rows: [],
      });
    }
    stages.get(key)!.rows.push(d);
  }

  const ordered = [...stages.values()].sort((a, b) => {
    const sa = a.rows[0]?.sequenceNo ?? Number.MAX_SAFE_INTEGER;
    const sb = b.rows[0]?.sequenceNo ?? Number.MAX_SAFE_INTEGER;
    return sa - sb;
  });

  for (const g of ordered) g.rows.sort((a, b) => a.sortOrder - b.sortOrder);

  const out = [...ordered];
  if (materials.length) {
    out.push({ key: '__materials', title: 'Bill of materials', caption: null, rows: materials });
  }
  if (formula.length) {
    out.push({ key: '__formula', title: 'Batch and yield', caption: null, rows: formula });
  }
  return out;
}

export default function VersionComparison({
  fromVersion, toVersion, differences, className,
}: VersionComparisonProps) {
  const groups = groupDifferences(differences);

  return (
    <section className={className} style={card} aria-labelledby="version-comparison">
      <header style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 id="version-comparison" style={cardTitle}>
          What changed from v{fromVersion} to v{toVersion}
        </h2>
        <span style={{ flex: 1, minWidth: 0 }} />
        <span style={count}>
          {differences.length === 1 ? '1 CHANGE' : `${differences.length} CHANGES`}
        </span>
      </header>

      {differences.length === 0 ? (
        //  Not an empty panel. "Nothing changed" is a real answer to
        //  the question the screen asks, and a reviewer needs to be
        //  told it rather than left wondering whether it loaded.
        <p style={empty}>
          These two versions are identical. Nothing in the stages, the parameters or the
          bill of materials differs.
        </p>
      ) : groups.map((g) => (
        <div key={g.key} style={group}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            {g.caption && <span style={caption}>{g.caption}</span>}
            <span style={groupTitle}>{g.title}</span>
          </div>

          {g.rows.map((d, i) => (
            <div key={`${d.scope}-${d.item}-${d.field}-${i}`} style={diffRow}>
              <span style={{ ...marker, ...MARKER[d.change] }}>
                {d.change === 'added' ? <Plus size={13} strokeWidth={2.5} aria-hidden />
                  : d.change === 'removed' ? <Minus size={13} strokeWidth={2.5} aria-hidden />
                    : d.change === 'moved' ? <MoveVertical size={13} strokeWidth={2.5} aria-hidden />
                      : <ArrowRight size={13} strokeWidth={2.5} aria-hidden />}
              </span>

              <span style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 13, lineHeight: '18px' }}>{d.item}</span>
                <span style={changeLabel}>{LABEL[d.change]}{d.field ? ` · ${d.field}` : ''}</span>
              </span>

              {/*  Old and new side by side, both present even when one
                  is empty — an addition shows a blank old column rather
                  than collapsing, so the eye tracks one layout down the
                  whole list. */}
              <span style={valueCol}>
                <span style={{ ...value, ...(d.oldValue ? strike : absent) }}>
                  {d.oldValue ?? '—'}
                </span>
              </span>
              <ArrowRight
                size={14} strokeWidth={2} aria-hidden
                style={{ flexShrink: 0, color: 'var(--nv-light-text-tertiary)' }}
              />
              <span style={valueCol}>
                <span style={{ ...value, ...(d.newValue ? added : absent) }}>
                  {d.newValue ?? '—'}
                </span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

const LABEL: Record<ChangeKind, string> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
  moved: 'Moved in the sequence',
};

// ── Styles ───────────────────────────────────────────────────────────

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 16,
  padding: 20, borderRadius: 12, minWidth: 0,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const cardTitle: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 18, lineHeight: '24px',
};

const count: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 11, lineHeight: '16px', letterSpacing: '0.04em',
  color: 'var(--nv-light-text-tertiary)',
};

const empty: CSSProperties = {
  margin: 0, padding: '12px 0', fontSize: 13, lineHeight: '20px',
  color: 'var(--nv-light-text-secondary)',
};

const group: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6,
};

const caption: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10, lineHeight: '14px', letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--nv-light-text-tertiary)',
};

const groupTitle: CSSProperties = {
  fontWeight: 600, fontSize: 14, lineHeight: '20px',
};

const diffRow: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
  padding: '10px 12px', borderRadius: 8, width: '100%', boxSizing: 'border-box',
  background: 'var(--nv-light-surface-sunken)',
};

const marker: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22, flexShrink: 0, borderRadius: 11,
};

const MARKER: Record<ChangeKind, CSSProperties> = {
  added:   { background: 'var(--nv-light-badge-done-bg)',    color: 'var(--nv-light-badge-done-text)' },
  removed: { background: 'var(--nv-light-state-overdue-bg)', color: 'var(--nv-light-state-overdue-text)' },
  changed: { background: 'var(--nv-light-badge-waiting-bg)', color: 'var(--nv-light-badge-waiting-text)' },
  moved:   { background: 'var(--nv-light-state-hold-bg)',    color: 'var(--nv-light-state-hold-text)' },
};

const changeLabel: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 10, lineHeight: '14px',
  letterSpacing: '0.04em', textTransform: 'uppercase',
  color: 'var(--nv-light-text-tertiary)',
};

const valueCol: CSSProperties = {
  flex: '0 1 150px', minWidth: 90, display: 'flex', justifyContent: 'flex-end',
};

const value: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 12, lineHeight: '16px',
  textAlign: 'right', wordBreak: 'break-word',
};

//  The old value is struck through rather than only greyed. On a
//  printed comparison grey and black are the same ink.
const strike: CSSProperties = {
  color: 'var(--nv-light-text-tertiary)', textDecoration: 'line-through',
};

const added: CSSProperties = {
  color: 'var(--nv-light-text-primary)', fontWeight: 500,
};

const absent: CSSProperties = {
  color: 'var(--nv-light-text-tertiary)',
};
