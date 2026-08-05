import { Globe, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useJurisdictionStore } from '../../stores/jurisdictionStore';
import { useAuth } from '../../contexts/AuthContext';
import type { Jurisdiction } from '../../lib/rules/types';
import { JURISDICTION_IDS, getRegulatorInfo, type JurisdictionId } from '../../lib/regulatoryProfile';

type JurisdictionOption = { id: Jurisdiction; label: string; shortLabel: string; flag: string; description: string };

const FLAG_BY_JURISDICTION: Record<JurisdictionId, string> = {
  nigeria: 'NG',
  usa: 'US',
  europe: 'EU',
  pan_african: 'AF',
};

/**
 * Build the jurisdiction options with regulator labels tailored to the
 * company's industry (chosen at signup) — e.g. Financial Services → CBN/SEC.
 */
function buildJurisdictionOptions(industryType: string | null | undefined): JurisdictionOption[] {
  const options: JurisdictionOption[] = JURISDICTION_IDS.map((id) => {
    const info = getRegulatorInfo(industryType, id);
    return {
      id,
      label: info.label,
      shortLabel: info.short,
      flag: FLAG_BY_JURISDICTION[id],
      description: info.description,
    };
  });
  options.push({
    id: 'all',
    label: 'All Jurisdictions',
    shortLabel: 'ALL',
    flag: 'GL',
    description: 'Comparison matrix across all markets',
  });
  return options;
}

const FLAG_COLORS: Record<string, string> = {
  NG: 'bg-[#008751]',
  US: 'bg-[#3C3B6E]',
  EU: 'bg-[#003399]',
  AF: 'bg-[#D4A843]',
  GL: 'bg-[var(--color-surface-alt)]',
};

interface JurisdictionSelectorProps {
  compact?: boolean;
}

export default function JurisdictionSelector({ compact = false }: JurisdictionSelectorProps) {
  const { selectedJurisdiction, setJurisdiction } = useJurisdictionStore();
  const { profile } = useAuth();
  const industryType = (profile as any)?.industry_type as string | null | undefined;
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const jurisdictionOptions = useMemo(() => buildJurisdictionOptions(industryType), [industryType]);
  const current = jurisdictionOptions.find((j) => j.id === selectedJurisdiction) || jurisdictionOptions[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (compact) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-accent)] transition-all text-sm shadow-sm"
        >
          <span className={`w-5 h-5 rounded-full ${FLAG_COLORS[current.flag]} flex items-center justify-center text-white text-[10px] font-bold`}>
            {current.flag}
          </span>
          <span className="font-medium text-[var(--color-text-primary)]">{current.shortLabel}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-[var(--color-text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute top-full right-0 mt-1.5 w-72 bg-[var(--color-surface)] rounded-xl shadow-xl border border-[var(--color-border)] z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
            <div className="p-2 border-b border-[var(--color-border)]">
              <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider px-2 py-1">Select Jurisdiction</p>
            </div>
            <div className="p-1.5">
              {jurisdictionOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    setJurisdiction(option.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${selectedJurisdiction === option.id
                    ? 'bg-[var(--color-accent-soft)] border border-[var(--color-accent)] border-opacity-20'
                    : 'hover:bg-[var(--color-surface-alt)]'
                    }`}
                >
                  <span className={`w-7 h-7 rounded-full ${FLAG_COLORS[option.flag]} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                    {option.flag}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${selectedJurisdiction === option.id ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]'}`}>
                      {option.label}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)] truncate">{option.description}</p>
                  </div>
                  {selectedJurisdiction === option.id && (
                    <div className="w-2 h-2 rounded-full bg-[var(--color-accent)] flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)]">
        <Globe className="w-5 h-5 text-[var(--color-accent)]" />
        <span className="text-sm font-semibold text-[var(--color-text-primary)] tracking-wide">Regulatory Jurisdiction</span>
      </div>
      <div className="p-4 flex flex-wrap gap-2.5">
        {jurisdictionOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => setJurisdiction(option.id)}
            className={`group flex items-center gap-2.5 px-4 py-2.5 rounded-xl transition-all text-sm font-medium ${selectedJurisdiction === option.id
              ? 'bg-behance-blue text-white shadow-md shadow-behance-blue/20'
              : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-behance-blue hover:text-white hover:bg-[var(--color-surface-alt)]'
              }`}
          >
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${selectedJurisdiction === option.id
              ? 'bg-white/20 text-white'
              : option.id === 'all'
                ? 'bg-[var(--color-border)] text-[var(--color-text-primary)]'
                : `${FLAG_COLORS[option.flag]} text-white`
              }`}>
              {option.flag}
            </span>
            <span>{option.shortLabel}</span>
          </button>
        ))}
      </div>
      <div className="px-6 py-3.5 bg-[var(--color-surface-alt)] border-t border-[var(--color-border)]">
        <p className="text-xs text-[var(--color-text-secondary)]">
          <span className="font-medium text-[var(--color-text-primary)]">{current.label}</span>
          {' — '}
          {current.description}
        </p>
      </div>
    </div>
  );
}

