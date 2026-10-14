/**
 * `input/text` and its select sibling.
 *
 * From the ONB-01 notes:
 *
 *   "Fields use input/text: 40 px high, label above."
 *   "Required fields are marked *. Continue validates on click and
 *    shows the error state from input/text with a message per field."
 *
 * A MESSAGE PER FIELD, not one summary at the top. The difference
 * matters on a form of nine fields: a banner saying "please check your
 * entries" makes the person hunt, and the hunt is where they give up.
 *
 * The error is tied to the input with aria-describedby and the input
 * carries aria-invalid, so it is announced rather than only coloured —
 * red text alone is not a message to someone who cannot see it.
 */

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';

const CONTROL: React.CSSProperties = {
  width: '100%',
  height: 'var(--nv-control-height)',
  padding: '0 12px',
  boxSizing: 'border-box',
  borderRadius: 'var(--nv-radius-control)',
  background: 'var(--nv-field-bg)',
  color: 'var(--nv-text-primary)',
  fontFamily: 'var(--nv-font-body)',
  fontSize: 14,
};

function Label({ htmlFor, children, required }: {
  htmlFor: string; children: ReactNode; required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} style={{
      display: 'block', marginBottom: 6,
      fontFamily: 'var(--nv-font-body)', fontWeight: 600,
      fontSize: 13, lineHeight: '18px',
      color: 'var(--nv-text-primary)',
    }}>
      {children}
      {required && <span aria-hidden="true"> *</span>}
      {/*  Spelled out for a screen reader, which would otherwise read
          the asterisk as "star" or skip it entirely.  */}
      {required && <span className="sr-only"> (required)</span>}
    </label>
  );
}

function ErrorText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" style={{
      margin: '6px 0 0',
      fontSize: 12, lineHeight: '18px',
      color: '#ffb4a6',
    }}>
      {children}
    </p>
  );
}

export interface NavyFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  required?: boolean;
  error?: string | null;
  /** Shown under the field when there is no error. */
  hint?: string;
}

export default function NavyField({
  label, required, error, hint, style, ...rest
}: NavyFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div>
      <Label htmlFor={id} required={required}>{label}</Label>
      <input
        {...rest}
        id={id}
        //  Opts out of the global input !important rule in index.css,
        //  which otherwise repaints this field white. See the comment
        //  beside that rule.
        className="nv-field"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={{
          ...CONTROL,
          border: error
            ? '1px solid #e2725b'
            : '1px solid var(--nv-field-border)',
          ...style,
        }}
      />
      {error
        ? <ErrorText id={errorId}>{error}</ErrorText>
        : hint && (
          <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: '18px', color: 'var(--nv-text-tertiary)' }}>
            {hint}
          </p>
        )}
    </div>
  );
}

export interface NavySelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  required?: boolean;
  error?: string | null;
  options: readonly string[];
  placeholder?: string;
}

export function NavySelect({
  label, required, error, options, placeholder, style, ...rest
}: NavySelectProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div>
      <Label htmlFor={id} required={required}>{label}</Label>
      <select
        {...rest}
        id={id}
        className="nv-field"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={{
          ...CONTROL,
          border: error ? '1px solid #e2725b' : '1px solid var(--nv-field-border)',
          ...style,
        }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {error && <ErrorText id={errorId}>{error}</ErrorText>}
    </div>
  );
}
