/**
 * state/step and the lifecycle track it sits on (node 47:385).
 *
 * The component's description in Figma is the specification, and one
 * sentence of it decides the whole design of this file:
 *
 *   "Place N instances in a horizontal auto-layout: the track has as
 *    many steps as the lifecycle definition has states, NEVER A FIXED
 *    SET. ... The Label prop carries the state name from the
 *    definition."
 *
 * So this component takes the states as data and draws however many
 * there are. It does not know that a deviation has four states or a
 * product seven, and it must not — those live in lifecycle_definitions
 * and a company may override them. A track with a hard-coded set of
 * steps would be a second copy of the workflow, drifting from the one
 * the database enforces, and the first symptom would be a screen
 * showing a state the record cannot actually be in.
 *
 * The rest of the description, implemented below:
 *
 *   "Lead line / Trail line props hide the connector on the first and
 *    last step."
 *   "Collapse completed states beyond 2 into 'Collapsed earlier' (+n)
 *    and upcoming states beyond 2 into 'Collapsed later'."
 *   "'Branch' shows an off-path state (returned, on hold) only when the
 *    record has entered it."
 *   "'Paused' marks a state where the clock stops waiting on the
 *    applicant (compliance directive, screening query): hold colour,
 *    pause octagon. It sits between the stage it was raised at and the
 *    stage it resumes at."
 *
 * THE TWO MARKERS DRAWN IN CSS RATHER THAN IMPORTED. Figma exports the
 * Current ring and the Upcoming hollow dot as SVGs because they are
 * vector ellipses, but they are the step marker itself rather than
 * iconography: a circle with a stroke. Drawing them with a border keeps
 * them on the colour tokens, scales them with the type, and avoids two
 * asset files whose only content is a circle. Every real icon here —
 * the check, the return arrow, the pause octagon — comes from the
 * project's icon registry, which maps the toolkit's names onto the set
 * this app ships.
 */

import type { CSSProperties } from 'react';
import { ICONS, STATUS_ICONS, iconProps } from '../../lib/design/icons';

/** The seven kinds state/step defines. */
export type StepKind =
  | 'done' | 'current' | 'upcoming'
  | 'collapsed_earlier' | 'collapsed_later'
  | 'branch' | 'paused';

export interface TrackState {
  /** The state_key from the lifecycle definition. */
  key: string;
  /** The label from the definition. Shown as given. */
  label: string;
  /**
   * An off-path state — returned, on hold, paused. The description is
   * explicit that these appear "only when the record has entered it",
   * so a branch the record has never been in is left out by the caller.
   */
  branch?: 'returned' | 'paused';
  /**
   * For a branch: the key of the on-path state it was raised at.
   *
   * REQUIRED FOR A BRANCH TO APPEAR AT ALL, because a branch is not in
   * the ordered path and nothing else says where it belongs. The
   * description puts it exactly: "It sits between the stage it was
   * raised at and the stage it resumes at." A paused application is not
   * at the start of the lifecycle and not at the end — it is next to
   * Division review, because that is where it will resume.
   */
  raisedAt?: string;
}

export interface LifecycleTrackProps {
  /** In definition order. As many as the definition has. */
  states: TrackState[];
  /** The record's current state_key. */
  currentKey: string;
  /**
   * Collapse threshold. The design says "beyond 2", which is the
   * default; a wider screen may pass more.
   */
  shoulder?: number;
  className?: string;
}

/** One step. Exported because RA-05 places single steps side by side. */
export function StateStep({ kind, label, leadLine = true, trailLine = true }: {
  kind: StepKind; label: string; leadLine?: boolean; trailLine?: boolean;
}) {
  const greenLine = kind === 'done' || kind === 'collapsed_earlier';
  const holdLead = kind === 'branch' || kind === 'paused';

  //  Lead and trail are coloured by what they connect, not by the step:
  //  the line behind a Current step is green because the path up to it
  //  is complete, and the line after it is grey because it is not.
  const leadColour = greenLine || kind === 'current'
    ? 'var(--nv-light-state-compliant-icon)'
    : holdLead ? 'var(--nv-light-state-hold-border)'
      : 'var(--nv-light-border-strong)';
  const trailColour = greenLine
    ? 'var(--nv-light-state-compliant-icon)'
    : 'var(--nv-light-border-strong)';

  return (
    <div style={step}>
      <div style={track}>
        {leadLine ? <span style={{ ...line, background: leadColour }} /> : <span style={lineSpacer} />}
        <Marker kind={kind} />
        {trailLine ? <span style={{ ...line, background: trailColour }} /> : <span style={lineSpacer} />}
      </div>
      <span style={{ ...labelBase, ...LABEL_STYLE[kind] }}>{label}</span>
    </div>
  );
}

function Marker({ kind }: { kind: StepKind }) {
  const Check = ICONS['action/check'];
  const Returned = ICONS['lifecycle/returned'];
  const Paused = STATUS_ICONS.on_hold.icon;

  if (kind === 'done') {
    return (
      <span style={{ ...node, ...doneNode }}>
        <Check {...iconProps('sm')} aria-hidden="true" color="#ffffff" />
      </span>
    );
  }

  //  A ring, not a filled dot: the record is here, not past here.
  if (kind === 'current') {
    return <span style={{ ...node, ...currentNode }} />;
  }

  if (kind === 'upcoming') {
    return <span style={{ ...node, ...upcomingNode }} />;
  }

  if (kind === 'collapsed_earlier' || kind === 'collapsed_later') {
    const earlier = kind === 'collapsed_earlier';
    return (
      <span style={{ ...pill, ...(earlier ? earlierPill : laterPill) }}>
        {/*  The caller puts the count in the label; the pill shows it
            because the design does, and a pill reading "+3" with the
            words underneath is how the row stays scannable. */}
      </span>
    );
  }

  return (
    <span style={{ ...node, ...holdNode }}>
      {kind === 'branch'
        ? <Returned {...iconProps('sm')} aria-hidden="true" color="var(--nv-light-state-hold-text)" />
        : <Paused {...iconProps('sm')} aria-hidden="true" color="var(--nv-light-state-hold-text)" />}
    </span>
  );
}

/**
 * The track, built from the definition's states.
 *
 * Everything before the current state is done, everything after is
 * upcoming, and the shoulders collapse — which is what keeps a
 * nine-state submission lifecycle readable on one row.
 */
export default function LifecycleTrack({
  states, currentKey, shoulder = 2, className,
}: LifecycleTrackProps) {
  const onPath = states.filter((s) => !s.branch);

  //  A current state that is itself a branch — the record is paused or
  //  returned — does not advance the path. The cursor stays at the
  //  stage it was raised at, which is where review resumes.
  const branchState = states.find((s) => s.key === currentKey && s.branch);
  const cursorKey = branchState?.raisedAt ?? currentKey;
  const currentIndex = onPath.findIndex((s) => s.key === cursorKey);

  type Rendered = { kind: StepKind; label: string };
  const rendered: Rendered[] = [];

  onPath.forEach((s, i) => {
    //  An unknown current state (the definition changed under a live
    //  record) leaves every step upcoming rather than guessing one is
    //  current. Showing the wrong step as current is worse than showing
    //  none, because somebody will act on it.
    const kind: StepKind =
      currentIndex < 0 ? 'upcoming'
        : i < currentIndex ? 'done'
          : i === currentIndex ? 'current'
            : 'upcoming';
    rendered.push({ kind, label: s.label });

    //  Immediately after the stage it was raised at, so the eye reads
    //  "Division review → paused → lab testing" in that order.
    if (branchState && i === currentIndex) {
      rendered.push({
        kind: branchState.branch === 'returned' ? 'branch' : 'paused',
        label: branchState.label,
      });
    }
  });

  const collapsed = collapse(rendered, shoulder);

  return (
    <div style={row} className={className} aria-label="Lifecycle">
      {collapsed.map((s, i) => (
        <StateStep
          key={`${s.kind}-${s.label}-${i}`}
          kind={s.kind}
          label={s.label}
          leadLine={i > 0}
          trailLine={i < collapsed.length - 1}
        />
      ))}
    </div>
  );
}

/**
 * "Collapse completed states beyond 2 into 'Collapsed earlier' (+n) and
 * upcoming states beyond 2 into 'Collapsed later'."
 *
 * "Beyond 2" is read literally: at most `shoulder` steps stay on each
 * side, and anything past that collapses, including a single one. An
 * earlier version here kept a lone extra step on the grounds that a
 * "+1" pill saves no width — true, but it makes the track's length
 * depend on how many states happen to be left, so two applications a
 * stage apart drew differently. A fixed shoulder is the point.
 */
function collapse(
  steps: { kind: StepKind; label: string }[],
  shoulder: number,
): { kind: StepKind; label: string }[] {
  const firstKept = steps.findIndex((s) => s.kind !== 'done');
  const out = [...steps];

  //  Later first, so collapsing the front does not shift the indices
  //  the back half was measured against.
  const lastKept = out.map((s) => s.kind).lastIndexOf('upcoming');
  const upcomingStart = out.findIndex((s) => s.kind === 'upcoming');
  if (upcomingStart >= 0 && lastKept - upcomingStart + 1 > shoulder) {
    const hidden = lastKept - (upcomingStart + shoulder) + 1;
    out.splice(upcomingStart + shoulder, hidden, {
      kind: 'collapsed_later', label: `+${hidden} later`,
    });
  }

  if (firstKept > shoulder) {
    const hidden = firstKept - shoulder;
    out.splice(0, hidden, { kind: 'collapsed_earlier', label: `+${hidden} earlier` });
  }

  return out;
}

/* ─────────────────────────── Styles ─────────────────────────── */

const row: CSSProperties = {
  display: 'flex', alignItems: 'flex-start',
  fontFamily: 'var(--nv-font-body)',
};

const step: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  gap: 8, width: 112, flexShrink: 0,
};

const track: CSSProperties = {
  display: 'flex', alignItems: 'center',
  height: 24, width: '100%', overflow: 'hidden',
};

const line: CSSProperties = { flex: '1 0 0', height: 2, minWidth: 0 };
//  Keeps the marker centred when a connector is hidden on an end step.
const lineSpacer: CSSProperties = { flex: '1 0 0', minWidth: 0 };

const node: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0, borderRadius: 999, lineHeight: 0,
};

const doneNode: CSSProperties = {
  width: 22, height: 22,
  background: 'var(--nv-light-state-compliant-icon)',
};

const currentNode: CSSProperties = {
  width: 24, height: 24, boxSizing: 'border-box',
  border: '3px solid var(--nv-light-state-compliant-icon)',
  background: 'var(--nv-light-surface)',
};

const upcomingNode: CSSProperties = {
  width: 18, height: 18, boxSizing: 'border-box',
  border: '2px solid var(--nv-light-border-strong)',
  background: 'var(--nv-light-surface)',
};

const holdNode: CSSProperties = {
  width: 24, height: 24, boxSizing: 'border-box',
  background: 'var(--nv-light-state-hold-bg)',
  border: '1.5px solid var(--nv-light-state-hold-border)',
};

const pill: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0, width: 36, height: 20, borderRadius: 10,
  boxSizing: 'border-box',
};

const earlierPill: CSSProperties = {
  background: 'var(--nv-light-badge-done-bg)',
  border: '1px solid var(--nv-light-badge-done-border)',
};

const laterPill: CSSProperties = {
  background: 'var(--nv-light-surface-sunken)',
  border: '1px solid var(--nv-light-border-strong)',
};

const labelBase: CSSProperties = {
  fontSize: 12, lineHeight: '16px', textAlign: 'center',
  width: '100%', overflowWrap: 'anywhere',
};

const LABEL_STYLE: Record<StepKind, CSSProperties> = {
  done:              { color: 'var(--nv-light-text-secondary)' },
  current:           { color: 'var(--nv-light-text-primary)', fontWeight: 600 },
  upcoming:          { color: 'var(--nv-light-text-tertiary)' },
  collapsed_earlier: { color: 'var(--nv-light-text-tertiary)' },
  collapsed_later:   { color: 'var(--nv-light-text-tertiary)' },
  branch:            { color: 'var(--nv-light-state-hold-text)' },
  paused:            { color: 'var(--nv-light-state-hold-text)' },
};
