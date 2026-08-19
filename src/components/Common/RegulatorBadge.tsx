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
  className?: string;
}

export default function RegulatorBadge({ compact = false, className = '' }: RegulatorBadgeProps) {
  const { profile } = useAuth();
  const selectedJurisdiction = useJurisdictionStore((s) => s.selectedJurisdiction);

  const industryType = (profile as any)?.industry_type as string | null | undefined;
  const jurisdiction = toJurisdictionId(selectedJurisdiction) ?? 'nigeria';
  const regulator = getRegulatorInfo(industryType, jurisdiction);

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
