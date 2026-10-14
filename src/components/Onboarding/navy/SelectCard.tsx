/**
 * `onboarding/select-card` and `onboarding/chip`.
 *
 * The ONB-02 notes name both: "Uses onboarding/select-card, an
 * extension of the ADM-04 module-access card list, plus
 * onboarding/chip."
 *
 * The select-card is a radio in card clothing, so it is built as one: a
 * real <input type="radio"> inside a <label>, visually hidden rather
 * than absent. A div with an onClick would look identical and be
 * unreachable by keyboard, and arrow keys would not move between the
 * options the way they do in a radio group.
 */

import type { LucideIcon } from 'lucide-react';
import { Check } from 'lucide-react';
import { iconProps } from '../../../lib/design/icons';

export interface SelectCardProps {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function SelectCard({
  name, value, checked, onChange, icon: Icon, title, description,
}: SelectCardProps) {
  return (
    <label
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start',
        padding: 16, borderRadius: 12, cursor: 'pointer',
        background: checked ? 'rgba(113, 166, 106, 0.10)' : 'var(--nv-surface-recessed)',
        border: checked
          ? '1.5px solid var(--nv-action-primary-bg)'
          : '1px solid var(--nv-border-default)',
        //  The 1.5px border on the selected card would otherwise make it
        //  half a pixel taller than its neighbours in the grid.
        boxSizing: 'border-box',
        height: '100%',
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />

      <span aria-hidden="true" style={{
        width: 36, height: 36, flex: 'none', borderRadius: 10,
        display: 'grid', placeItems: 'center',
        background: checked ? 'rgba(113, 166, 106, 0.18)' : 'var(--nv-surface-hover)',
        color: checked ? 'var(--nv-action-primary-bg)' : 'var(--nv-icon-default)',
      }}>
        <Icon {...iconProps('md')} />
      </span>

      <span style={{ flex: '1 1 0', minWidth: 0 }}>
        <span style={{
          display: 'block', fontWeight: 600, fontSize: 14, lineHeight: '20px',
          color: 'var(--nv-text-primary)',
        }}>
          {title}
        </span>
        <span style={{
          display: 'block', marginTop: 4, fontSize: 13, lineHeight: '19px',
          color: 'var(--nv-text-secondary)',
        }}>
          {description}
        </span>
      </span>

      {/*  The tick box, which is decoration: the radio above carries the
          state for anything that is not looking at the screen.  */}
      <span aria-hidden="true" style={{
        width: 20, height: 20, flex: 'none', borderRadius: 6,
        display: 'grid', placeItems: 'center',
        background: checked ? 'var(--nv-action-primary-bg)' : 'transparent',
        border: checked ? 'none' : '1px solid var(--nv-border-strong)',
        color: 'var(--nv-action-primary-text)',
      }}>
        {checked && <Check size={14} strokeWidth={2.5} absoluteStrokeWidth />}
      </span>
    </label>
  );
}

export interface ChipProps {
  label: string;
  selected: boolean;
  /** Omitted for a chip that states a fact rather than offering a
   *  choice — Nigeria in Phase 1, or a regulator that follows from the
   *  industry rather than from a decision. */
  onToggle?: () => void;
  disabled?: boolean;
}

export function Chip({ label, selected, onToggle, disabled }: ChipProps) {
  const fixed = !onToggle || disabled;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={fixed}
      aria-pressed={onToggle ? selected : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: 32, padding: selected ? '0 14px 0 10px' : '0 14px',
        borderRadius: 16,
        cursor: fixed ? 'default' : 'pointer',
        background: selected ? 'rgba(113, 166, 106, 0.12)' : 'transparent',
        border: selected
          ? '1px solid var(--nv-action-primary-bg)'
          : '1px solid var(--nv-border-strong)',
        color: selected ? 'var(--nv-action-primary-bg)' : 'var(--nv-text-secondary)',
        fontFamily: 'var(--nv-font-body)', fontWeight: 600,
        fontSize: 13, lineHeight: '18px',
        whiteSpace: 'nowrap',
      }}
    >
      {selected && <Check size={14} strokeWidth={2.5} absoluteStrokeWidth aria-hidden="true" />}
      {label}
    </button>
  );
}
