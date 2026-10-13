/**
 * The `button` component from the Product Design file (node 17:206).
 *
 * The Figma description is a complete behavioural spec, and every clause
 * of it is implemented here rather than paraphrased:
 *
 *   "Button. Height 40, radius 8, padding 0 18, gap 8, Bricolage
 *    Grotesque SemiBold 15/20. Focus: 2 px CR Blue Light (#183470)
 *    outside stroke, same on every variant (CSS: outline 2px solid
 *    #183470; outline-offset 0). Loading: label kept at 0% opacity so
 *    width does not change; 16 px spinner (270° arc, 2 px) in the label
 *    colour; pointer events off, aria-busy=true. Disabled: no hover or
 *    focus, cursor not-allowed."
 *
 * Two clauses are easy to read past and are the reason this is a
 * component rather than a class:
 *
 *   - THE LOADING LABEL KEEPS ITS WIDTH. The text stays in the layout at
 *     zero opacity instead of being swapped for a spinner, so a button
 *     does not resize mid-click and shift everything beside it.
 *   - THE FOCUS RING IS THE SAME ON EVERY VARIANT. Not a lighter ring on
 *     the ghost; the same 2 px #183470 at offset 0, so focus is one
 *     recognisable thing across the screen.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type NavyButtonVariant = 'primary' | 'outline' | 'ghost';

export interface NavyButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: NavyButtonVariant;
  loading?: boolean;
  /** Mobile: the primary action is full width and comes first in reading
   *  order, so it sits closest to the thumb. */
  fullWidth?: boolean;
  children: ReactNode;
}

export default function NavyButton({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  style,
  ...rest
}: NavyButtonProps) {
  const isDisabled = disabled || loading;

  const palette: Record<NavyButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: {
      bg: 'var(--nv-action-primary-bg)',
      fg: 'var(--nv-action-primary-text)',
      border: 'transparent',
    },
    outline: {
      bg: 'transparent',
      fg: 'var(--nv-action-outline-text)',
      border: 'var(--nv-border-strong)',
    },
    ghost: {
      bg: 'transparent',
      fg: 'var(--nv-action-outline-text)',
      border: 'transparent',
    },
  };
  const c = palette[variant];

  return (
    <button
      {...rest}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className="navy-btn"
      data-variant={variant}
      style={{
        //  Height 40, radius 8, padding 0 18, gap 8 — all from the spec.
        height: 'var(--nv-control-height)',
        borderRadius: 'var(--nv-radius-control)',
        padding: '0 18px',
        gap: 8,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: fullWidth ? '100%' : undefined,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        fontFamily: 'var(--nv-font-display)',
        fontWeight: 600,
        fontSize: 15,
        lineHeight: '20px',
        //  "Disabled: no hover or focus, cursor not-allowed."
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        //  Loading keeps pointer events off; disabled keeps the cursor.
        pointerEvents: loading ? 'none' : undefined,
        opacity: disabled && !loading ? 0.5 : 1,
        position: 'relative',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {/*  The label stays in the layout at zero opacity while loading, so
           the button keeps its width. Swapping it for a spinner would
           resize the button mid-click.  */}
      <span style={{ opacity: loading ? 0 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {children}
      </span>

      {loading && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {/*  16 px, a 270° arc at 2 px, in the label colour.  */}
          <svg width="16" height="16" viewBox="0 0 16 16" className="navy-btn-spinner">
            <circle
              cx="8" cy="8" r="6.5" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              /*  2πr ≈ 40.84; 270° is three quarters of it.  */
              strokeDasharray="30.63 10.21"
            />
          </svg>
        </span>
      )}
    </button>
  );
}
