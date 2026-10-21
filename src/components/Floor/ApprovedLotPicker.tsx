/**
 * The dispensing lot picker (DS-01, DS-M01).
 *
 * The design's NOT DONE IF: "Unapproved lots selectable then refused:
 * no. They are never listed; the picker says so."
 *
 * SO THERE IS NO DISABLED ROW IN THIS FILE. The list comes from
 * dispensable_lots, which asks the dispensing gate per lot, and
 * `DispensableLot` has no `disabled` or `reason` field — there is
 * nowhere to put one. A picker that greyed unavailable lots would be
 * kinder-looking and worse: it puts a quarantined lot under somebody's
 * thumb at a workstation, where the next thing that happens is a tap.
 *
 * WHAT IT SAYS INSTEAD. The empty state explains which kinds of lot
 * are missing and where to look, because an empty picker with no words
 * leaves an operator unable to tell a broken system from no stock —
 * and those have different next steps.
 */

import type { CSSProperties } from 'react';
import { Boxes, Check } from 'lucide-react';
import { emptyPickerMessage, type DispensableLot } from '../../lib/floor/floorConditions';
import { TOUCH } from '../../lib/batch/stageStrip';

export interface ApprovedLotPickerProps {
  materialName: string;
  lots: DispensableLot[];
  selectedLotId?: string;
  onSelect: (lot: DispensableLot) => void;
  className?: string;
}

export default function ApprovedLotPicker({
  materialName, lots, selectedLotId, onSelect, className,
}: ApprovedLotPickerProps) {
  return (
    <section className={className} style={card} aria-labelledby="lot-picker">
      <header style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h2 id="lot-picker" style={cardTitle}>Choose a lot</h2>
        <span style={{ flex: 1, minWidth: 0 }} />
        <span style={count}>
          {lots.length === 1 ? '1 APPROVED LOT' : `${lots.length} APPROVED LOTS`}
        </span>
      </header>

      {lots.length === 0 ? (
        <p style={empty}>{emptyPickerMessage(materialName)}</p>
      ) : (
        <ul style={list}>
          {lots.map((lot) => {
            const chosen = lot.lotId === selectedLotId;
            return (
              <li key={lot.lotId}>
                <button
                  type="button"
                  style={{ ...row, ...(chosen ? rowChosen : rowPlain) }}
                  onClick={() => onSelect(lot)}
                  aria-pressed={chosen}
                >
                  <span style={{ ...glyph, ...(chosen ? glyphChosen : glyphPlain) }}>
                    {chosen
                      ? <Check size={18} strokeWidth={3} aria-hidden />
                      : <Boxes size={18} strokeWidth={1.75} aria-hidden />}
                  </span>

                  <span style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                    <span style={{ fontWeight: 600, fontSize: 16, lineHeight: '22px' }}>
                      {lot.lotNumber}
                    </span>
                    {/*  Retest first, because the list is ordered by it
                        and the operator should see why this lot is at
                        the top rather than wonder. */}
                    <span style={meta}>
                      {lot.retestDueDate ? `Retest ${lot.retestDueDate}` : 'No retest date'}
                      {lot.supplierExpiryDate ? ` · expires ${lot.supplierExpiryDate}` : ''}
                    </span>
                  </span>

                  <span style={quantity}>
                    {lot.quantityAvailable} {lot.unitOfMeasure}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {lots.length > 0 && (
        //  Said once, under the list, rather than per row. It explains
        //  the absences without implying any particular lot is hidden.
        <p style={footnote}>
          Only lots QA has released are listed. Oldest usable stock first.
        </p>
      )}
    </section>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12,
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

const list: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: TOUCH.gap,
  margin: 0, padding: 0, listStyle: 'none',
};

const row: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  width: '100%', boxSizing: 'border-box',
  //  56px at least, for gloved hands.
  minHeight: TOUCH.target, padding: '12px 14px', borderRadius: 10,
  borderWidth: 2, borderStyle: 'solid', cursor: 'pointer',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const rowPlain: CSSProperties = {
  background: 'var(--nv-light-surface)',
  borderColor: 'var(--nv-light-border)',
};

const rowChosen: CSSProperties = {
  background: 'var(--nv-light-select-fill)',
  borderColor: 'var(--nv-light-action-bg)',
};

const glyph: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 36, height: 36, flexShrink: 0, borderRadius: 8,
};

const glyphPlain: CSSProperties = {
  background: 'var(--nv-light-surface-sunken)', color: 'var(--nv-light-text-secondary)',
};

const glyphChosen: CSSProperties = {
  background: 'var(--nv-light-action-bg)', color: '#ffffff',
};

const meta: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 11, lineHeight: '16px',
  color: 'var(--nv-light-text-tertiary)',
};

const quantity: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 15, lineHeight: '22px',
  marginLeft: 'auto', whiteSpace: 'nowrap',
};

const empty: CSSProperties = {
  margin: 0, padding: '14px 16px', borderRadius: 8,
  background: 'var(--nv-light-surface-sunken)',
  fontSize: 14, lineHeight: '21px', color: 'var(--nv-light-text-secondary)',
};

const footnote: CSSProperties = {
  margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--nv-light-text-tertiary)',
};
