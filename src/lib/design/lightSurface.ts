/**
 * The light surface ONB-08 introduced, shared by every screen drawn on
 * it rather than copied into each one.
 *
 * WHY THIS IS A MODULE AND NOT A CONVENTION. The dashboard and the
 * sidebar drifted apart for weeks because each was styled where it
 * stood and nothing held them to the same values. Two screens in the
 * same palette, each with its own `const card`, is the same mistake
 * waiting a second time: they stay identical exactly as long as nobody
 * edits one of them.
 *
 * These are plain style objects, not components. A screen composes them
 * and overrides what it needs — the point is that the ground, the
 * stroke and the type scale are decided once, not that every card in
 * the product has to look the same.
 *
 * The tokens themselves live in src/styles/tokens.css under
 * `--nv-light-*`, beside the navy ones they are the counterpart to.
 */

import type { CSSProperties } from 'react';

/**
 * The cream sheet a screen sits on. The app shell is dark, so the
 * ground arrives as one panel filling the content column rather than as
 * a body background the layout would have to know about.
 */
export const lightPage: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 20,
  padding: 'clamp(16px, 3vw, 28px)',
  borderRadius: 16,
  background: 'var(--nv-light-ground)',
  fontFamily: 'var(--nv-font-body)',
  color: 'var(--nv-light-text-primary)',
};

export const lightCard: CSSProperties = {
  padding: 'clamp(16px, 3vw, 24px)',
  borderRadius: 'var(--nv-radius-card)',
  background: 'var(--nv-light-surface)',
  border: '1px solid var(--nv-light-border)',
  display: 'flex', flexDirection: 'column', gap: 16,
};

/** ONB-00's current-step treatment: a green stroke over an 8% wash. */
export const lightNextCard: CSSProperties = {
  ...lightCard,
  background: 'var(--nv-light-next-fill)',
  border: '1.5px solid var(--nv-light-next-border)',
  gap: 14,
};

export const lightPageTitle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 'clamp(24px, 4vw, 32px)', lineHeight: 1.2,
  letterSpacing: '-0.01em',
  color: 'var(--nv-light-text-primary)',
  textWrap: 'balance',
};

export const lightCardTitle: CSSProperties = {
  margin: 0,
  fontWeight: 600, fontSize: 16, lineHeight: '22px',
  color: 'var(--nv-light-text-primary)',
};

/** Running text. Capped near 62ch, which is where prose stops scanning. */
export const lightBody: CSSProperties = {
  margin: 0,
  fontSize: 14, lineHeight: '21px',
  color: 'var(--nv-light-text-secondary)',
  maxWidth: '62ch',
};

export const lightMeta: CSSProperties = {
  margin: 0,
  fontSize: 13, lineHeight: '19px',
  color: 'var(--nv-light-text-tertiary)',
};

export const lightPrimaryButton: CSSProperties = {
  height: 'var(--nv-control-height)', padding: '0 18px',
  borderRadius: 'var(--nv-radius-control)', border: 'none',
  background: 'var(--nv-light-action-bg)', color: 'var(--nv-light-action-text)',
  font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
};

export const lightOutlineButton: CSSProperties = {
  height: 'var(--nv-control-height)', padding: '0 16px',
  borderRadius: 'var(--nv-radius-control)',
  border: '1px solid var(--nv-light-border-strong)',
  background: 'var(--nv-light-surface)',
  color: 'var(--nv-light-text-primary)',
  font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
};

/** Low emphasis, for a second action beside a primary one. */
export const lightLinkButton: CSSProperties = {
  padding: 0, border: 'none', background: 'none',
  font: 'inherit', fontSize: 14, fontWeight: 500,
  color: 'var(--nv-light-text-secondary)',
  textDecoration: 'underline', textUnderlineOffset: 3,
  cursor: 'pointer',
};

/**
 * A state pill. Title case and the body face, never upper-case mono: a
 * state somebody is in should not read as a system code. Callers add
 * the fill and text colour, and a glyph, so the state is never carried
 * by colour alone.
 */
export const lightBadge: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  flexShrink: 0,
  padding: '5px 12px', borderRadius: 999,
  fontSize: 12, lineHeight: '16px', fontWeight: 600,
  whiteSpace: 'nowrap',
};

export const lightField: CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  height: 'var(--nv-control-height)', padding: '0 12px',
  borderRadius: 'var(--nv-radius-control)',
  border: '1px solid var(--nv-light-border-strong)',
  background: 'var(--nv-light-surface)',
  color: 'var(--nv-light-text-primary)',
  font: 'inherit', fontSize: 14,
};

export const lightLabel: CSSProperties = {
  display: 'block', marginBottom: 6,
  fontSize: 13, fontWeight: 600, lineHeight: '18px',
  color: 'var(--nv-light-text-primary)',
};

/** Two columns where there is room for both, one where there is not. */
export const lightTwoColumns: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
  gap: 20,
  alignItems: 'start',
};
