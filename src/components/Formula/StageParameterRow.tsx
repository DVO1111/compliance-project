/**
 * A parameter on a stage (node 139:1286) — MF-02, MF-03, and the
 * preview inside MF-04.
 *
 * One row: a 4px bar in the type's colour, the type chip, the name,
 * the values, and a lock when the formula is approved.
 *
 * THE BAR AND THE CHIP SAY THE SAME THING TWICE, ON PURPOSE. A stage
 * holds both kinds of parameter interleaved, and somebody scanning a
 * column of eight rows for "which of these stop the line" should not
 * have to read eight chips. The bar answers it at a glance; the chip
 * answers it precisely. Colour alone would fail in print, which is why
 * the chip also differs in shape.
 */

import type { CSSProperties } from 'react';
import { Lock, AlertOctagon } from 'lucide-react';
import {
  PARAMETER_TYPES, describeParameter, describeRecording,
  type StageParameter,
} from '../../lib/formula/parameterTypes';
import ParameterTypeChip from './ParameterTypeChip';

export interface StageParameterRowProps {
  parameter: StageParameter;
  /** True once the formula is approved: nothing on it can change. */
  locked?: boolean;
  /** Shows "At start, then every 60 min" under the name. */
  showRecording?: boolean;
  onOpen?: () => void;
  className?: string;
}

export default function StageParameterRow({
  parameter, locked = false, showRecording = false, onOpen, className,
}: StageParameterRowProps) {
  const t = PARAMETER_TYPES[parameter.parameterType];
  const values = describeParameter(parameter);

  return (
    <div
      className={className}
      style={{ ...row, borderLeft: `4px solid ${t.bar}` }}
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(); } : undefined}
    >
      <ParameterTypeChip type={parameter.parameterType} />

      <span style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 14, lineHeight: '20px' }}>
            {parameter.parameter}
          </span>
          {/*  Critical is the one flag that changes what happens on the
              line, so it is a marker rather than a word in the detail
              line where it could be skimmed past. */}
          {parameter.isCritical && (
            <span style={criticalTag} title="Out of range stops the stage until a supervisor decides.">
              <AlertOctagon size={13} strokeWidth={2} aria-hidden />
              CRITICAL
            </span>
          )}
        </span>
        {showRecording && (
          <span style={recording}>{describeRecording(parameter)}</span>
        )}
      </span>

      {values && <span style={valueText}>{values}</span>}

      {/*  The lock is not decoration: an approved formula is frozen
          whole, and a row that looked editable would invite an attempt
          that the database refuses. */}
      {locked && (
        <Lock
          size={16} strokeWidth={1.5} aria-label="Frozen — the formula is approved"
          style={{ flexShrink: 0, color: 'var(--nv-light-text-tertiary)' }}
        />
      )}
    </div>
  );
}

const row: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  padding: '10px 14px', borderRadius: 4, width: '100%', boxSizing: 'border-box',
  background: 'var(--nv-light-surface)',
  borderTop: '1px solid var(--nv-light-border)',
  borderRight: '1px solid var(--nv-light-border)',
  borderBottom: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
  cursor: 'default',
};

const criticalTag: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '1px 6px', borderRadius: 3,
  background: 'var(--nv-light-state-overdue-bg)',
  color: 'var(--nv-light-state-overdue-text)',
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 9, lineHeight: '13px', letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
};

const recording: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 10.5, lineHeight: '15px',
  color: 'var(--nv-light-text-tertiary)',
};

//  Mono, because these are numbers that line up down a column and a
//  proportional face makes "2.0 – 4.0" and "20 – 40" look alike.
const valueText: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 12, lineHeight: '16px',
  color: 'var(--nv-light-text-primary)',
  marginLeft: 'auto', whiteSpace: 'nowrap',
};
