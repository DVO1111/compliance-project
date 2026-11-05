/**
 * RegulatorBadge — shows which regulator the workspace operates under.
 *
 * Replaces the old JurisdictionSelector. The regulatory body is chosen once at
 * sign-up and is a property of the workspace, so this reports it rather than
 * offering a choice: changing the regulator mid-stream would silently re-scope
 * every scan, risk score and audit record already on file.
 */

import { useAuth } from '../../contexts/AuthContext';
import { useJurisdictionStore } from '../../stores/jurisdictionStore';
import {
  getRegulatorInfo,
  toJurisdictionId,
  JURISDICTION_LABELS,
} from '../../lib/regulatoryProfile';
import { Landmark } from 'lucide-react';

interface RegulatorBadgeProps {
  /** Compact drops the jurisdiction name and keeps the short regulator code. */
  compact?: boolean;
  /**
   * 'mono' is the Criateur Dashboard design's treatment: a hairline pill in
   * the mono face, a small accent dot in place of the icon, and the
   * regulator and jurisdiction together as "NAFDAC · Nigeria".
   *
   * A separate variant rather than a change to `compact`, which UploadPage
   * also uses and which means something different — compact DROPS the
   * jurisdiction, where this one deliberately shows it.
   */
  variant?: 'default' | 'mono';
  className?: string;
}

export default function RegulatorBadge({
  compact = false,
  variant = 'default',
  className = '',
}: RegulatorBadgeProps) {
  const { profile } = useAuth();
  const selectedJurisdiction = useJurisdictionStore((s) => s.selectedJurisdiction);

  const industryType = (profile as any)?.industry_type as string | null | undefined;
  const jurisdiction = toJurisdictionId(selectedJurisdiction) ?? 'nigeria';
  const regulator = getRegulatorInfo(industryType, jurisdiction);

  if (variant === 'mono') {
    return (
      <span
        className={`inline-flex items-center gap-2 border whitespace-nowrap ${className}`}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10.5px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)',
          borderColor: 'var(--color-border)',
          borderRadius: 8,
          padding: '9px 12px',
        }}
        title={regulator.description}
      >
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: 'var(--color-accent)',
            flexShrink: 0,
          }}
        />
        {regulator.short} · {JURISDICTION_LABELS[jurisdiction]}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 px-3 rounded-xl border ${className}`}
      style={{
        height: 'var(--control-height-md)',
        background: 'var(--color-surface-alt)',
        borderColor: 'var(--color-border)',
        color: 'var(--color-text-secondary)',
      }}
      title={regulator.description}
    >
      <Landmark className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
      <span className="type-heading-01" style={{ color: 'var(--color-text-primary)' }}>
        {regulator.short}
      </span>
      {!compact && (
        <span className="type-caption-01" style={{ color: 'var(--color-text-tertiary)' }}>
          {JURISDICTION_LABELS[jurisdiction]}
        </span>
      )}
    </span>
  );
}
