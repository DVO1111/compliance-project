/**
 * Type · Machine setting / Product attribute (nodes 139:1215, 139:1229).
 *
 * "Parameter type hidden in a settings panel: no. It's the first
 * question when defining a parameter and shows on every row."
 *
 * THE SHAPES ARE THE ACCESSIBILITY ARGUMENT, not a flourish. A navy
 * filled square against an outlined green pill — the design's own
 * reason is that "they differ in shape, so they also work in
 * greyscale". Two coloured rectangles would be identical on a printed
 * batch record, which is where a formula is most often read.
 *
 * The chip takes only the type. Everything about how it looks comes
 * from lib/formula/parameterTypes, which is also what the builder row,
 * the add-parameter drawer and the version comparison read, so a chip
 * cannot drift from the rule it is announcing.
 */

import type { CSSProperties } from 'react';
import { PARAMETER_TYPES, type ParameterType } from '../../lib/formula/parameterTypes';
import { icon } from '../../lib/design/icons';

export interface ParameterTypeChipProps {
  type: ParameterType;
  className?: string;
}

export default function ParameterTypeChip({ type, className }: ParameterTypeChipProps) {
  const t = PARAMETER_TYPES[type];
  const Glyph = icon(t.icon);

  return (
    <span
      className={className}
      style={{
        ...chip,
        background: t.chipBg,
        borderColor: t.chipBorder,
        color: t.chipText,
        //  Square for a machine setting, pill for a product attribute.
        borderRadius: t.shape === 'square' ? 4 : 12,
        //  The outlined pill carries a heavier stroke so it reads as
        //  deliberate beside a filled chip rather than as a faint one.
        borderWidth: t.shape === 'square' ? 1 : 1.5,
        padding: t.shape === 'square' ? '4px 8px' : '3px 10px',
      }}
    >
      <Glyph size={16} strokeWidth={1.5} aria-hidden />
      {t.label}
    </span>
  );
}

const chip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  borderStyle: 'solid', flexShrink: 0,
  //  IBM Plex Mono at 10, which is the design's: the chip is a label on
  //  a record, not a word in a sentence.
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10, lineHeight: '14px', letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
};
