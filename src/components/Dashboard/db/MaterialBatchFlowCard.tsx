/**
 * "Material and batch flow" (DB-01 node 77:420, DB-02 node 79:600).
 *
 * Eight stages in a row, each with a number, a caption, a live count and
 * an access chip that comes from the viewer's own role. The legend
 * across the top names the three grades so the chips are readable
 * without hovering anything.
 *
 * WHY A LOCKED STAGE IS STILL DRAWN. DB-02 subtitles this card "Stages
 * you can't open still show where your lots are." A Storekeeper whose
 * material is sitting in QC needs to know it is in QC. Removing the
 * stage would not remove the fact; it would remove the explanation, and
 * somebody would go and ask in person, or worse, assume nothing is
 * happening.
 *
 * A stage the viewer may open is a button. One they may not is not —
 * per the design's own rule, "Users don't see actions they can't take"
 * — and instead carries the locked chip and, where the section can be
 * asked for, the Request access affordance DB-02 draws.
 */

import type { CSSProperties } from 'react';
import AccessChip from '../../Access/AccessChip';
import { FLOW_STAGES, type StageCount } from './materialBatchFlow';
import { sectionAccess, type Access } from '../../../lib/access/roleAccess';
import type { WorkRole } from '../../../lib/access/permissionRequests';

export interface MaterialBatchFlowCardProps {
  role: WorkRole | null;
  /** Keyed by stage number: '01' … '08'. Missing is "still loading". */
  counts: Record<string, StageCount>;
  /** The sentence under the title; the two dashboards word it differently. */
  subtitle: string;
  /** Opens a stage the viewer may open. */
  onOpen?: (page: string) => void;
  /** Offered on a locked stage that can be asked for. */
  onRequest?: (section: string) => void;
  /** Sections with a request already waiting, so the stage says so
   *  instead of offering to ask again. */
  pendingSections?: string[];
}

//  The one media query this card needs, injected once rather than
//  pulled into the global sheet: eight columns is right on a desktop
//  and unreadable on a phone, and inline styles cannot express that.
const RESPONSIVE = `
@media (max-width: 1180px) {
  .db-flow-stages { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
}
@media (max-width: 720px) {
  .db-flow-stages { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
}
@media (max-width: 440px) {
  .db-flow-stages { grid-template-columns: minmax(0, 1fr) !important; }
}`;

export default function MaterialBatchFlowCard(p: MaterialBatchFlowCardProps) {
  const pending = new Set(p.pendingSections ?? []);
  return (
    <section style={card}>
      <style>{RESPONSIVE}</style>
      <header style={head}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Material and batch flow</h3>
          <span style={sub}>{p.subtitle}</span>
        </div>
        <div style={legend}>
          <span style={{ ...sub, whiteSpace: 'nowrap' }}>Your access:</span>
          <AccessChip grade="act" />
          <AccessChip grade="view" />
          <AccessChip grade="none" />
        </div>
      </header>

      <ol style={stages} className="db-flow-stages">
        {FLOW_STAGES.map((s) => {
          const grade: Access = s.section ? sectionAccess(p.role, s.section) : 'none';
          const count = p.counts[s.no];
          const openable = grade !== 'none' && !!s.page && !!p.onOpen;
          const isPending = !!s.section && pending.has(s.section);

          const body = (
            <>
              <span style={stageNo}>{s.no} · {s.title.toUpperCase()}</span>
              <span style={stageCaption}>{s.caption}</span>
              {grade === 'none' ? (
                //  No number on a stage you cannot open: the count is a
                //  fact about records you have no standing to see, and
                //  showing it would leak exactly what the chip refuses.
                <span style={dash} aria-hidden>—</span>
              ) : (
                <span style={stageValue}>
                  {count?.value === null || count === undefined ? '·' : count.value}
                </span>
              )}
              <span style={stageLabel}>
                {grade === 'none' ? 'You can’t open this stage' : (count?.label ?? '')}
              </span>
              <span style={{ flex: 1 }} />
              {grade === 'none' ? (
                <>
                  <AccessChip grade="none" />
                  {isPending ? (
                    <span style={pendingText}>Request pending</span>
                  ) : p.onRequest && s.section ? (
                    <button type="button" style={requestLink}
                      onClick={() => p.onRequest!(s.section!)}>
                      Request access
                    </button>
                  ) : null}
                </>
              ) : (
                <AccessChip grade={grade} />
              )}
              {s.inferred && grade !== 'none' && (
                //  Named on the card, not only in a comment: this chip
                //  is read off a column the design does not draw for
                //  this stage, and a reader deserves to know which one
                //  is an inference.
                <span style={inferredNote} title="No column in PM-03 covers finished-product QC; this reads the QC testing cell.">
                  from QC testing
                </span>
              )}
            </>
          );

          return (
            <li key={s.no} style={{ listStyle: 'none', minWidth: 0 }}>
              {openable ? (
                <button type="button" style={{ ...stage, ...stageButton }}
                  onClick={() => p.onOpen!(s.page!)}>
                  {body}
                </button>
              ) : (
                <div style={{ ...stage, ...(grade === 'none' ? stageLocked : null) }}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const card: CSSProperties = {
  background: '#fff', border: '1px solid #e3e6eb', borderRadius: 14,
  padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0,
};
const head: CSSProperties = {
  display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', minWidth: 0,
};
const legend: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexWrap: 'wrap',
};
const sub: CSSProperties = { fontSize: 13, color: '#5b6472', lineHeight: '19px' };
//  EIGHT ACROSS, BECAUSE THE CHAIN IS THE POINT. The design lays the
//  stages out in one row at 1440: procurement on the left, distribution
//  on the right, material moving between them. Wrapping it to two rows
//  of four reads as two lists rather than one flow, and the stage a
//  lot is sitting in stops being obvious at a glance.
//
//  So eight equal columns while there is room for them — minmax(0,1fr)
//  rather than auto-fit, so the track can be narrower than its content
//  and the cards shrink instead of overflowing — and one column at
//  phone width, where a horizontal chain cannot work at all.
const stages: CSSProperties = {
  margin: 0, padding: 0, display: 'grid', gap: 10,
  gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
};

const stage: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start',
  border: '1px solid #e3e6eb', borderRadius: 10, background: '#fff',
  padding: '12px 13px', minHeight: 150, width: '100%', textAlign: 'left', minWidth: 0,
};
const stageButton: CSSProperties = { cursor: 'pointer', font: 'inherit' };
const stageLocked: CSSProperties = { background: '#f7f8fa' };
const stageNo: CSSProperties = {
  fontSize: 10.5, letterSpacing: '0.06em', fontWeight: 700, color: '#5b6472',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};
const stageCaption: CSSProperties = { fontSize: 12.5, color: '#5b6472', lineHeight: '17px' };
const stageValue: CSSProperties = { fontSize: 26, fontWeight: 600, lineHeight: '30px' };
const dash: CSSProperties = { fontSize: 26, fontWeight: 600, lineHeight: '30px', color: '#b4bac4' };
const stageLabel: CSSProperties = { fontSize: 12, color: '#5b6472', lineHeight: '16px' };
const requestLink: CSSProperties = {
  border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
  fontSize: 12.5, fontWeight: 600, color: '#2f6f4e', textAlign: 'left',
};
const pendingText: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: '#9a6b1f' };
const inferredNote: CSSProperties = { fontSize: 11, color: '#8a919c' };
