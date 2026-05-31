import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Radio,
  AlertTriangle,
  ChevronDown,
  Archive,
  Pill,
  Stethoscope,
  Sparkles,
  Apple,
  FlaskConical,
  Package,
  X,
} from 'lucide-react';
import type { Database } from '../../lib/database.types';
import { useJurisdictionStore } from '../../stores/jurisdictionStore';
import type { Jurisdiction } from '../../lib/rules/types';

type CircularRow = Database['public']['Tables']['regulatory_circulars']['Row'];
type Circular = CircularRow & { document_type?: string; topics?: string[] };

const PRODUCT_CATEGORIES = ['Drugs', 'Medical Devices', 'Cosmetics', 'Food & Supplements', 'Biologics', 'OTC Products'] as const;
type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

const CATEGORY_ICONS: Record<ProductCategory, typeof Pill> = {
  'Drugs': Pill,
  'Medical Devices': Stethoscope,
  'Cosmetics': Sparkles,
  'Food & Supplements': Apple,
  'Biologics': FlaskConical,
  'OTC Products': Package,
};

const SOURCE_COLORS: Record<string, string> = {
  NAFDAC: 'bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/20',
  FDA: 'bg-[var(--color-info-soft)] text-[var(--color-info)] border-[var(--color-info)]/20',
  WHO: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning)]/20',
  MDCN: 'bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/20',
  PCN: 'bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/20',
  NMCN: 'bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/20',
  FTC: 'bg-[var(--color-info-soft)] text-[var(--color-info)] border-[var(--color-info)]/20',
  EMA: 'bg-[var(--color-purple)]/10 text-[var(--color-purple)] border-[var(--color-purple)]/20',
  MHRA: 'bg-[var(--color-purple)]/10 text-[var(--color-purple)] border-[var(--color-purple)]/20',
  AMA: 'bg-slate-100 text-[var(--color-text-primary)] border-[var(--color-border)]',
};

const SEVERITY_STYLES: Record<string, string> = {
  high: 'bg-[var(--color-danger-soft)] border-[var(--color-danger)]/20 text-[var(--color-danger)]',
  medium: 'bg-[var(--color-warning-soft)] border-[var(--color-warning)]/20 text-[var(--color-warning)]',
  low: 'bg-[var(--color-success-soft)] border-[var(--color-success)]/20 text-[var(--color-success)]',
};

const DOC_TYPE_STYLES: Record<string, string> = {
  circular: 'dash-surface-alt dash-text border-[var(--color-border)]',
  guideline: 'bg-[var(--color-info)]/10 text-[var(--color-info)] border-blue-500/20',
  advisory: 'bg-[var(--color-purple)]/10 text-[var(--color-purple)] border-indigo-500/20',
  enforcement: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-red-500/20',
  news: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-amber-500/20',
  policy_update: 'bg-[var(--color-success)]/10 text-[var(--color-success)] border-emerald-500/20',
};

interface RegulatoryIntelligenceWidgetProps {
  onNavigateToArchive?: () => void;
}

function getJurisdictionFilter(selected: Jurisdiction) {
  if (selected === 'all') return null;
  return [selected, 'all'];
}

export default function RegulatoryIntelligenceWidget({ onNavigateToArchive }: RegulatoryIntelligenceWidgetProps) {
  const { profile } = useAuth();
  const { selectedJurisdiction } = useJurisdictionStore();

  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<Set<ProductCategory>>(() => {
    if (profile?.product_categories && profile.product_categories.length > 0) {
      const valid = profile.product_categories.filter((c) =>
        (PRODUCT_CATEGORIES as readonly string[]).includes(c)
      ) as ProductCategory[];
      if (valid.length > 0) return new Set(valid);
    }
    return new Set(PRODUCT_CATEGORIES);
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    loadCirculars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJurisdiction]);

  const loadCirculars = async () => {
    setLoading(true);

    let q = supabase
      .from('regulatory_circulars')
      .select('*')
      .eq('is_active', true);

    const jurFilter = getJurisdictionFilter(selectedJurisdiction);
    if (jurFilter) q = q.in('jurisdiction', jurFilter);

    const { data, error } = await q.order('published_date', { ascending: false });

    if (!error && data) {
      setCirculars(data);
    }
    setLoading(false);
  };

  const toggleCategory = (category: ProductCategory) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        if (next.size > 1) next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const filteredCirculars = circulars.filter((c) =>
    c.product_categories.some((cat) => selectedCategories.has(cat as ProductCategory))
  );

  return (
    <div className="dash-card overflow-hidden">
      <div className="p-6 border-b dash-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-behance-blue/10 rounded-xl flex items-center justify-center">
              <Radio className="w-5 h-5 text-behance-blue" />
            </div>
            <div>
              <h3 className="text-lg font-semibold dash-text">Regulatory Intelligence</h3>
              <p className="text-sm dash-text-secondary">
                Latest circulars, guidelines & advisories (filtered by jurisdiction)
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-behance-blue/10 text-behance-blue">
            <span className="w-1.5 h-1.5 bg-[var(--color-success)] rounded-full animate-pulse" />
            Live Feed
          </span>
        </div>

        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-4 py-2.5 border dash-border rounded-lg hover:border-[var(--color-border-hover)] transition-colors w-full sm:w-auto text-sm"
          >
            <span className="dash-text-secondary font-medium">Product Categories:</span>
            <span className="dash-text">
              {selectedCategories.size === PRODUCT_CATEGORIES.length
                ? 'All Categories'
                : Array.from(selectedCategories).join(', ')}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-[var(--color-text-tertiary)] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-1 w-64 dash-surface rounded-lg shadow-lg border dash-border py-2 z-20">
                {PRODUCT_CATEGORIES.map((category) => {
                  const Icon = CATEGORY_ICONS[category];
                  const isSelected = selectedCategories.has(category);
                  return (
                    <button
                      key={category}
                      onClick={() => toggleCategory(category)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isSelected
                          ? 'bg-behance-blue/10 text-behance-blue'
                          : 'dash-text-secondary hover:dash-surface-alt hover:text-white'
                        }`}
                    >
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-behance-blue border-behance-blue' : 'dash-border'
                          }`}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                            <path
                              d="M2 6l3 3 5-5"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      <Icon className="w-4 h-4" />
                      <span className="font-medium">{category}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="divide-y divide-[var(--color-border)] max-h-[520px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-behance-blue" />
          </div>
        ) : filteredCirculars.length === 0 ? (
          <div className="text-center py-16 px-6">
            <Radio className="w-10 h-10 dash-text-tertiary mx-auto mb-3" />
            <p className="dash-text-secondary font-medium">No updates match your filters</p>
            <p className="text-sm dash-text-tertiary mt-1">Adjust your category filters above</p>
          </div>
        ) : (
          filteredCirculars.map((circular) => (
            <CircularCard
              key={circular.id}
              circular={circular}
              onCheckArchive={onNavigateToArchive}
            />
          ))
        )}
      </div>

      {!loading && filteredCirculars.length > 0 && (
        <div className="px-6 py-3 dash-surface-alt border-t dash-border text-center">
          <p className="text-xs dash-text-secondary">
            Showing {filteredCirculars.length} of {circulars.length} active updates
          </p>
        </div>
      )}
    </div>
  );
}

function CircularCard({
  circular,
  onCheckArchive,
}: {
  circular: Circular;
  onCheckArchive?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sourceStyle = SOURCE_COLORS[circular.source] || 'dash-surface-alt dash-text dash-border';
  const severityStyle = SEVERITY_STYLES[circular.severity] || SEVERITY_STYLES.medium;

  const docType = (circular.document_type || 'circular').toLowerCase();
  const docStyle = DOC_TYPE_STYLES[docType] || DOC_TYPE_STYLES.circular;

  return (
    <div className="px-6 py-4 hover:dash-surface-alt transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${sourceStyle}`}>
              {circular.source}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${docStyle}`}>
              {docType.replace('_', ' ')}
            </span>
            <span className="text-xs dash-text-tertiary font-mono">{circular.circular_number}</span>
            {circular.severity === 'high' && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${severityStyle}`}>
                <AlertTriangle className="w-3 h-3" />
                High Impact
              </span>
            )}
          </div>

          <button onClick={() => setExpanded(!expanded)} className="text-left w-full group">
            <h4 className="text-sm font-semibold dash-text group-hover:text-behance-blue transition-colors leading-snug">
              {circular.title}
            </h4>
          </button>

          {expanded && (
            <div className="mt-3 space-y-3 animate-fade-in-up" style={{ animationDuration: '0.3s' }}>
              <p className="text-sm dash-text-secondary leading-relaxed">{circular.summary}</p>

              {!!circular.topics?.length && (
                <div className="flex flex-wrap items-center gap-2">
                  {circular.topics.slice(0, 6).map((t: string) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 text-slate-700 border border-[var(--color-border)] rounded text-xs font-medium"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {circular.product_categories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 px-2 py-0.5 dash-surface-alt border dash-border dash-text-secondary rounded text-xs font-medium"
                  >
                    {cat}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCheckArchive?.();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-behance-blue text-white text-xs font-medium rounded-lg hover:opacity-90 transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                  Check My Archive
                </button>
                <button
                  onClick={() => setExpanded(false)}
                  className="inline-flex items-center gap-1 px-2 py-1.5 dash-text-tertiary hover:dash-text-secondary text-xs transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Collapse
                </button>
              </div>
            </div>
          )}

          {!expanded && (
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
              {new Date(circular.published_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
