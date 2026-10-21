/**
 * The yield account and the block (YR-01, YR-M01).
 *
 * "Theoretical, packed, samples, rejects, unaccounted, yield and
 *  variance against the threshold; red block on completion;
 *  investigation and supervisor route."
 *
 * ═════════════════════════════════════════════════════════════════════
 * TWO PERCENTAGES SIT ON THIS CARD AND THEY ARE DIFFERENT NUMBERS
 * ═════════════════════════════════════════════════════════════════════
 * From the design's own figures: 300,000 theoretical, 289,440 packed,
 * 1,260 sampled, 2,100 rejected, 7,200 unaccounted at 2.4 % — and an
 * actual yield of 96.5 % with a variance of − 3.5 %.
 *
 * 96.5 % is packed over theoretical. The accounted total over
 * theoretical is 97.6 %. So the threshold is applied to PACKED, and
 * the unaccounted line measures something else: material the paperwork
 * cannot locate.
 *
 * Both have to be on the screen. Showing only the yield hides 7,200
 * tablets nobody can find; showing only the account hides the 3.5 %
 * the stage is blocked on. They are kept in separate groups with the
 * lines above and the verdict below, so nobody reads one as a
 * restatement of the other.
 *
 * THIS CARD DOES NOT DECIDE THE BLOCK. `within_threshold` comes off
 * the record, derived by item 12's trigger and enforced by
 * `batch_stage_complete`. `summarise` reads it; nothing here compares a
 * variance to a threshold, because a second comparison is a second
 * verdict and the two would differ on exactly the boundary case.
 *
 * THE BLOCK PANEL HAS NO WAY PAST IT, by construction — the same rule
 * as W4·18's FloorNotice. The two routes are the design's: recount
 * (cheapest, commonest cause) and flag for investigation with a
 * supervisor. Neither is a way of proceeding without one; "proceeding
 * without a recorded authorisation" is item 12's third NOT DONE IF.
 */

import type { CSSProperties } from 'react';
import { X, ShieldCheck, FileSignature } from 'lucide-react';
import {
  summarise, formatQuantity, formatPct, formatSignedPct, formatUnaccounted,
  thresholdBand, thresholdNote, blockHeadline, blockDetail, blockDetailShort,
  completeButtonLabel, routes, lineLabel, formatBare, accountUnit, phoneRouteNote,
  type AccountLine, type AccountSummary, type YieldVerdict,
} from '../../lib/yield/yieldAccount';
import { TOUCH } from '../../lib/batch/stageStrip';
import type { FloorLayout } from '../../lib/inprocess/floorLayout';

export interface YieldAccountCardProps {
  stageName: string;
  stageSequence: number;
  lines: AccountLine[];
  verdict: YieldVerdict;
  /** The two ends of the threshold window. Passed in rather than
   *  derived from one number, because the design's example window
   *  (98.0 – 101.0 %) is not symmetric and deriving it would quietly
   *  correct the design. */
  window: { lower: number; upper: number };
  onFlagInvestigation: () => void;
  onRecount: () => void;
  onComplete: () => void;
  /**
   * YR-01 or YR-M01.
   *
   * The phone is not the same card narrower. It puts the block ABOVE
   * the account rather than beside it, shortens every label, prints
   * the figures bare with the unit stated once, drops the threshold
   * strip, and moves both routes into a bar at the bottom. Each of
   * those is a decision about what to show, not how to space it —
   * see lib/inprocess/floorLayout.ts.
   */
  layout?: FloorLayout;
  className?: string;
}

export default function YieldAccountCard(p: YieldAccountCardProps) {
  const s = summarise(p.lines, p.verdict);
  const band = thresholdBand(s.verdict.yieldPct, p.window.lower, p.window.upper);
  const endWidth = (100 - band.withinWidthPct) / 2;
  const phone = p.layout === 'phone';
  const unit = accountUnit(s.lines);

  return (
    <div className={p.className}
         style={phone
           ? { display: 'flex', flexDirection: 'column', gap: 14 }
           : { display: 'flex', gap: 20, flexWrap: 'wrap' }}>

      {/*  ON A PHONE THE BLOCK COMES FIRST. Beside the account on a
          workstation, both are in view at once; stacked, whichever is
          on top is what an operator sees on arriving. "Can't complete
          Packing" is the reason they are looking at the screen, so it
          goes above the seven rows that explain it. */}
      {phone && (
        <PhoneVerdict s={s} stageName={p.stageName} />
      )}

      {/* ── The account ───────────────────────────────────────────── */}
      <section style={phone
        ? { display: 'flex', flexDirection: 'column', gap: 8 }
        : { flex: '1 1 420px', minWidth: 300, display: 'flex',
            flexDirection: 'column', gap: 12 }}>
        {!phone && (
          <h2 style={title}>
            Yield reconciliation · stage {p.stageSequence} · {p.stageName}
          </h2>
        )}

        {/*  THE UNIT, SAID ONCE. YR-M01 prints the quantities bare,
            which is right — seven repetitions of "tablets" down a
            390 px column is noise — but a column of unlabelled numbers
            is a real loss, so it is stated here instead of dropped.
            The design has it nowhere; this is the cheapest way to keep
            it without the clutter it was removed for. */}
        {phone && unit && (
          <span style={unitCaption}>All quantities in {unit}</span>
        )}

        <div style={table} role="table" aria-label="Yield account">
          {s.lines.map((l) => (
            <div
              key={l.key}
              style={{
                ...row,
                //  The two derived lines sit on a sunken ground: they
                //  are conclusions from the lines above, not further
                //  counts, and a flat list of six would read as six
                //  measurements.
                background: l.kind === 'derived'
                  ? 'var(--nv-light-surface-sunken)'
                  : 'var(--nv-light-surface)',
                fontWeight: l.key === 'theoretical' || l.kind === 'derived' ? 600 : 400,
              }}
              role="row"
            >
              <span style={rowLabel} role="cell">{lineLabel(l, p.layout ?? 'workstation')}</span>
              <span style={figure} role="cell">
                {phone
                  ? formatBare(l.quantity, 'quantity')
                  : l.key === 'unaccounted'
                    ? formatUnaccounted(l)
                    : formatQuantity(l.quantity, l.unit)}
              </span>
            </div>
          ))}

          {/*  The verdict, below a divider. Separated from the account
              because it is a percentage of packed alone and the lines
              above are quantities — see the file header. */}
          <div style={{ ...row, borderTop: '2px solid var(--nv-light-border)',
                        background: 'var(--nv-light-surface)', fontWeight: 600 }}
               role="row">
            <span style={rowLabel} role="cell">{phone ? 'Yield' : 'Actual yield'}</span>
            <span style={figure} role="cell">{formatPct(s.verdict.yieldPct)}</span>
          </div>
          <div style={{ ...row, background: 'var(--nv-light-surface)', fontWeight: 600 }}
               role="row">
            <span style={rowLabel} role="cell">
              {phone ? 'Variance' : 'Variance from theoretical'}
            </span>
            <span style={figure} role="cell">{formatSignedPct(s.verdict.variancePct)}</span>
          </div>
        </div>

        {!s.brokenDown && (
          <p style={note}>
            This reconciliation was recorded as a single figure, so the samples and
            rejects lines are blank. The yield and the variance are unaffected.
          </p>
        )}

        {/* ── The threshold strip ───────────────────────────────────
            WORKSTATION ONLY. At 390 px the three segments cannot hold
            even one word each beside a marker, and a strip whose
            labels are gone is a coloured bar that means nothing. The
            figures it carries — the yield and both ends of the window
            — are in the block panel's own sentence on a phone, so
            nothing is lost with it. */}
        {!phone && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={strip} role="img"
               //  The segments show one word each, so the full
               //  figures live here and in each segment's title.
               aria-label={`Yield ${formatPct(s.verdict.yieldPct)}. `
                 + `${band.belowLabel} blocks, ${band.withinLabel} passes, `
                 + `${band.aboveLabel} blocks.`}>
            <span style={{ ...stripCell, width: `${endWidth}%`,
                           background: 'var(--nv-light-state-overdue-bg)',
                           borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }}
                  title={band.belowLabel}>
              {band.belowShort}
            </span>
            <span style={{ ...stripCell, width: `${band.withinWidthPct}%`,
                           background: 'var(--nv-light-badge-done-bg)' }}
                  title={band.withinLabel}>
              {band.withinShort}
            </span>
            <span style={{ ...stripCell, width: `${endWidth}%`,
                           background: 'var(--nv-light-state-overdue-bg)',
                           borderTopRightRadius: 4, borderBottomRightRadius: 4 }}
                  title={band.aboveLabel}>
              {band.aboveShort}
            </span>
            {band.markerPct !== null && (
              <span style={{ ...stripMarker, left: `${band.markerPct}%` }} aria-hidden />
            )}
          </div>
          {/*  THE FIGURE IS PRINTED, not read off the strip. The two
              outer segments run to zero and to infinity, so a marker
              in one of them shows which side and not how far. */}
          <span style={stripNote}>
            {thresholdNote(s.verdict.yieldPct, p.window.lower, p.window.upper)}
          </span>
        </div>
        )}
      </section>

      {/*  ON A PHONE the routes are a bar at the bottom and the
          verdict is already above, so everything below here is the
          workstation column. */}
      {phone ? (
        <PhoneRoutes
          s={s} onFlagInvestigation={p.onFlagInvestigation}
          onRecount={p.onRecount} onComplete={p.onComplete} />
      ) : (
      /* ── The block, and the way through it ─────────────────────── */
      <section style={{ flex: '1 1 340px', minWidth: 280, display: 'flex',
                        flexDirection: 'column', gap: 12 }}>
        <div
          style={{ ...verdictPanel, ...(s.blocks && !s.cleared ? blockTone : clearTone) }}
          role={s.blocks && !s.cleared ? 'alert' : 'status'}
        >
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ ...mark,
                           ...(s.blocks && !s.cleared ? markBlock : markClear) }}>
              {s.blocks && !s.cleared
                ? <X size={20} strokeWidth={3} aria-hidden />
                : <ShieldCheck size={20} strokeWidth={2.25} aria-hidden />}
            </span>
            <span style={{ flex: 1, minWidth: 180, fontWeight: 600, fontSize: 18,
                           lineHeight: '24px' }}>
              {blockHeadline(p.stageName, s)}
            </span>
          </span>
          <span style={verdictDetail}>{blockDetail(s, p.stageName)}</span>
        </div>

        {s.blocks && !s.cleared && (
          <div style={routesCard}>
            <h3 style={{ margin: 0, fontWeight: 600, fontSize: 16, lineHeight: '22px' }}>
              To proceed
            </h3>
            <p style={{ margin: 0, fontSize: 13, lineHeight: '19px',
                        color: 'var(--nv-light-text-secondary)' }}>
              Recount if a count may be wrong. Otherwise flag it for investigation and a
              supervisor decides whether the stage may be completed with the variance on
              the record.
            </p>
            {routes(s).map((r) => (
              <button
                key={r.key} type="button" style={routeButton}
                onClick={r.key === 'recount' ? p.onRecount : p.onFlagInvestigation}
                title={r.detail}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {/*  The primary action says what pressing it will start, rather
            than offering something about to be refused — W4·18's rule.
            It is never removed and never greyed: an operator needs to
            be able to see what the finished state looks like. */}
        <button
          type="button"
          style={{ ...complete,
                   ...(s.blocks && !s.cleared ? completeRefused : {}) }}
          onClick={p.onComplete}
        >
          {!(s.blocks && !s.cleared) && (
            <FileSignature size={20} strokeWidth={1.75} aria-hidden
                            style={{ flexShrink: 0 }} />
          )}
          {completeButtonLabel(s)}
        </button>

        {s.cleared && (
          <p style={note}>
            Investigated and authorised. The variance stays on the batch record, and the
            authorisation names who allowed it.
          </p>
        )}
      </section>
      )}
    </div>
  );
}

/**
 * The phone's verdict panel (YR-M01's top block).
 *
 * One line of detail instead of three sentences — `blockDetailShort`
 * — because the "what happens next" half is said above the action bar
 * at the bottom of the screen, where the buttons that do it are. The
 * same three facts, in the two places each of them fits.
 */
function PhoneVerdict({ s, stageName }: { s: AccountSummary; stageName: string }) {
  const blocked = s.blocks && !s.cleared;
  return (
    <div
      style={{ ...verdictPanel, ...(blocked ? blockTone : clearTone), padding: 14, gap: 8 }}
      role={blocked ? 'alert' : 'status'}
    >
      <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ ...mark, ...(blocked ? markBlock : markClear),
                       width: 28, height: 28, borderRadius: 14 }}>
          {blocked
            ? <X size={16} strokeWidth={3} aria-hidden />
            : <ShieldCheck size={16} strokeWidth={2.25} aria-hidden />}
        </span>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 17,
                       lineHeight: '22px' }}>
          {blockHeadline(stageName, s)}
        </span>
      </span>
      <span style={{ ...verdictDetail, padding: '8px 10px', fontSize: 13,
                     lineHeight: '19px' }}>
        {blockDetailShort(s)}
      </span>
    </div>
  );
}

/**
 * The phone's action bar (YR-M01's sticky bottom).
 *
 * STICKY, so the two routes stay reachable however far down the seven
 * rows an operator has scrolled — the account is what they are
 * reading and the buttons are what they came to press, and on a 844 px
 * screen those do not fit in one view.
 *
 * It sits above the home indicator: `bottom: 0` plus the safe-area
 * inset, so the lower button is not half under it.
 *
 * THERE IS NO "COMPLETE AND SIGN" BUTTON WHILE BLOCKED, which is YR-M01
 * and is the same rule as FloorNotice's blocked variant: no way past
 * it on screen. The workstation card shows the refused button because
 * there is room to show what the finished state looks like; a phone
 * has room for the two things that change it.
 */
function PhoneRoutes({ s, onFlagInvestigation, onRecount, onComplete }: {
  s: AccountSummary;
  onFlagInvestigation: () => void;
  onRecount: () => void;
  onComplete: () => void;
}) {
  const blocked = s.blocks && !s.cleared;
  const note = phoneRouteNote(s);

  return (
    <>
      {note && <p style={{ margin: 0, fontSize: 13, lineHeight: '19px',
                           color: 'var(--nv-light-text-secondary)' }}>{note}</p>}
      <div style={phoneBar}>
        {blocked ? routes(s, 'phone').map((r) => (
          <button
            key={r.key} type="button"
            style={r.key === 'investigate' ? phoneBarPrimary : phoneBarSecondary}
            onClick={r.key === 'recount' ? onRecount : onFlagInvestigation}
          >
            {r.label}
          </button>
        )) : (
          <button type="button" style={phoneBarPrimary} onClick={onComplete}>
            <FileSignature size={20} strokeWidth={1.75} aria-hidden
                           style={{ flexShrink: 0 }} />
            Complete and sign stage
          </button>
        )}
      </div>
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const title: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 21, lineHeight: '28px', color: 'var(--nv-light-text-primary)',
  textWrap: 'balance',
};

const table: CSSProperties = {
  display: 'flex', flexDirection: 'column',
  borderRadius: 12, overflow: 'hidden',
  border: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const row: CSSProperties = {
  //  WRAPS, and the figure drops below its own label when it has to.
  //  "Packed, released to store" and "289,440 tablets" genuinely do
  //  not fit on one line at 390 px, and the two other ways out were
  //  both worse: holding the figure on the line printed it over the
  //  word "Unaccounted", and letting it break split "289,440" from
  //  "tablets" into a column of bare numbers above a column of bare
  //  units. A label with its figure beneath it is the ordinary phone
  //  reading of a table row; the other two are bugs.
  display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap',
  minHeight: 41, padding: '10px 14px', boxSizing: 'border-box',
  borderBottom: '1px solid var(--nv-light-border)',
};

const rowLabel: CSSProperties = {
  //  140, not 160: the narrower floor keeps "Counted rejects" and
  //  "Actual yield" on one line with their figures at phone width,
  //  and only the two longest labels wrap.
  flex: '1 1 140px', minWidth: 140,
  fontSize: 15, lineHeight: '20px',
};

const figure: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 15, lineHeight: '20px',
  //  Aligned on the digits, so the lines read as a column that adds up.
  fontVariantNumeric: 'tabular-nums', textAlign: 'right',
  marginLeft: 'auto', flexShrink: 0,
  //  Never broken. formatQuantity binds the unit to its number with a
  //  non-breaking space for the same reason: a figure that splits
  //  across lines stops being one figure.
  whiteSpace: 'nowrap',
};

const unitCaption: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 11, lineHeight: '16px',
  letterSpacing: '0.04em', color: 'var(--nv-light-text-tertiary)',
};

const phoneBar: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10,
  position: 'sticky',
  //  Above the home indicator, not under it.
  bottom: 'env(safe-area-inset-bottom, 0px)',
  padding: '12px 0 0',
  background: 'var(--nv-light-ground)',
};

const phoneBarPrimary: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center',
  minHeight: TOUCH.target, padding: '0 16px', borderRadius: 10,
  background: 'var(--nv-light-action-bg)', border: '1px solid var(--nv-light-action-bg)',
  color: '#ffffff',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 16, lineHeight: '22px',
  cursor: 'pointer',
};

const phoneBarSecondary: CSSProperties = {
  minHeight: TOUCH.target, padding: '0 16px', borderRadius: 10,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 16, lineHeight: '22px',
  cursor: 'pointer',
};

const note: CSSProperties = {
  margin: 0, fontSize: 13, lineHeight: '19px', color: 'var(--nv-light-text-secondary)',
};

const strip: CSSProperties = {
  display: 'flex', position: 'relative', width: '100%', height: 24, borderRadius: 4,
};

const stripCell: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxSizing: 'border-box', overflow: 'hidden',
  fontFamily: 'var(--nv-font-mono)', fontSize: 10, lineHeight: '14px',
  color: 'var(--nv-light-text-primary)', whiteSpace: 'nowrap',
};

const stripMarker: CSSProperties = {
  position: 'absolute', top: -5, width: 4, height: 34, borderRadius: 2,
  background: 'var(--nv-light-ink-bg)', transform: 'translateX(-2px)',
};

const stripNote: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 11, lineHeight: '16px',
  color: 'var(--nv-light-text-tertiary)',
};

const verdictPanel: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10,
  padding: 16, borderRadius: 12, boxSizing: 'border-box',
  borderWidth: 2, borderStyle: 'solid',
  fontFamily: 'var(--nv-font-body)',
};

const blockTone: CSSProperties = {
  background: 'var(--nv-light-state-rejected-bg)',
  borderColor: 'var(--nv-light-state-rejected-bg)',
  color: 'var(--nv-light-state-rejected-text)',
};

const clearTone: CSSProperties = {
  background: 'var(--nv-light-badge-done-bg)',
  borderColor: 'var(--nv-light-badge-done-border)',
  color: 'var(--nv-light-badge-done-text)',
};

const mark: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, flexShrink: 0, borderRadius: 16,
};

const markBlock: CSSProperties = {
  background: '#ffffff', color: 'var(--nv-light-state-rejected-bg)',
};

const markClear: CSSProperties = {
  background: 'var(--nv-light-badge-done-border)', color: '#ffffff',
};

//  On a panel inside the notice, so it stays readable on the solid red
//  fill without a second colour rule per variant — the same device as
//  FloorNotice.
const verdictDetail: CSSProperties = {
  padding: '10px 12px', borderRadius: 6,
  background: 'var(--nv-light-surface)',
  color: 'var(--nv-light-text-primary)',
  fontSize: 14, lineHeight: '21px',
};

const routesCard: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10,
  padding: 15, borderRadius: 12,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)', fontFamily: 'var(--nv-font-body)',
};

const routeButton: CSSProperties = {
  minHeight: TOUCH.target, padding: '0 16px', borderRadius: 10,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 15, lineHeight: '22px',
  cursor: 'pointer', textAlign: 'center',
};

const complete: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center',
  minHeight: TOUCH.target, padding: '0 20px', borderRadius: 10,
  background: 'var(--nv-light-action-bg)', border: '1px solid var(--nv-light-action-bg)',
  color: '#ffffff',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 16, lineHeight: '22px',
  cursor: 'pointer',
};

//  Says it cannot, in the design's word, rather than going dim. The
//  count of what must change is in the panel above it.
const completeRefused: CSSProperties = {
  background: 'var(--nv-light-surface-sunken)',
  borderColor: 'var(--nv-light-border)',
  color: 'var(--nv-light-text-secondary)',
};
