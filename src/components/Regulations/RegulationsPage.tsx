import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  BookOpen, ExternalLink, Calendar, AlertCircle, Cpu, X,
  CheckCircle2, Loader2, Sparkles, Pill, Microscope, FlaskConical,
  Megaphone, ScrollText, FolderOpen, ArrowRight, Shield, Clock,
  Hash, ChevronRight, Search, Database,
} from 'lucide-react';
import { syncRegulations, type SyncProgress, type SyncPhase } from '../../lib/regulationsSyncService';
import { isAutoSyncEnabled, startAutoSync, stopAutoSync, getLastSyncedAt, getTimeAgo } from '../../lib/regulationAutoSyncService';

/* ── Types ────────────────────────────────────────────────────────────── */

type Regulation = {
  id: string;
  title: string;
  source: string;
  category: 'pharma' | 'medical_devices' | 'clinical_trials' | 'marketing' | 'general';
  content: string;
  source_url: string | null;
  version: string;
  effective_date: string | null;
  last_crawled: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/* ── Category config ─────────────────────────────────────────────────── */

const CATEGORY_CONFIG: Record<string, {
  label: string;
  icon: typeof Pill;
  gradient: string;
  iconBg: string;
  badgeBg: string;
  badgeText: string;
  description: string;
}> = {
  pharma: {
    label: 'Pharmaceutical',
    icon: Pill,
    gradient: 'from-[var(--color-info)]/10 to-[var(--color-info)]/5',
    iconBg: 'bg-[var(--color-info)]/15 text-[var(--color-info)] dark:text-[var(--color-info)]',
    badgeBg: 'bg-[var(--color-info-soft)] dark:bg-blue-900/40',
    badgeText: 'text-[var(--color-info)] dark:text-[var(--color-info)]',
    description: 'Drug approvals, labeling & advertising standards',
  },
  medical_devices: {
    label: 'Medical Devices',
    icon: Microscope,
    gradient: 'from-emerald-500/10 to-emerald-600/5',
    iconBg: 'bg-[var(--color-success)]/15 text-[var(--color-success)] dark:text-[var(--color-success)]',
    badgeBg: 'bg-[var(--color-success-soft)] dark:bg-emerald-900/40',
    badgeText: 'text-[var(--color-success)] dark:text-emerald-300',
    description: 'Device classification, registration & safety',
  },
  clinical_trials: {
    label: 'Clinical Trials',
    icon: FlaskConical,
    gradient: 'from-violet-500/10 to-violet-600/5',
    iconBg: 'bg-[var(--color-purple)]/15 text-[var(--color-purple)] dark:text-violet-400',
    badgeBg: 'bg-violet-100 dark:bg-violet-900/40',
    badgeText: 'text-violet-700 dark:text-violet-300',
    description: 'Trial protocols, ethics & reporting',
  },
  marketing: {
    label: 'Marketing',
    icon: Megaphone,
    gradient: 'from-amber-500/10 to-amber-600/5',
    iconBg: 'bg-[var(--color-warning)]/15 text-[var(--color-warning)] dark:text-[var(--color-warning)]',
    badgeBg: 'bg-[var(--color-warning-soft)] dark:bg-amber-900/40',
    badgeText: 'text-[var(--color-warning)] dark:text-amber-300',
    description: 'Promotional claims, DTC ads & digital content',
  },
  general: {
    label: 'General',
    icon: ScrollText,
    gradient: 'from-slate-500/10 to-slate-600/5',
    iconBg: 'bg-slate-500/15 text-[var(--color-text-secondary)] dark:text-[var(--color-text-tertiary)]',
    badgeBg: 'bg-slate-100 dark:bg-slate-900/40',
    badgeText: 'text-slate-700 dark:text-[var(--color-text-tertiary)]',
    description: 'Cross-cutting compliance & governance',
  },
};

const PHASE_LABELS: Record<SyncPhase, string> = {
  idle: 'Ready',
  extracting: 'Extracting citations from rule engine…',
  enriching: 'AI generating regulation content…',
  persisting: 'Saving to regulations ledger…',
  done: 'Sync complete!',
  error: 'Error occurred',
};

/* ── Component ───────────────────────────────────────────────────────── */

export default function RegulationsPage() {
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedRegulation, setSelectedRegulation] = useState<Regulation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync state
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [autoSyncOn, setAutoSyncOn] = useState(isAutoSyncEnabled());
  const [lastSynced, setLastSynced] = useState(getLastSyncedAt());

  const loadRegulations = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('regulations')
      .select('*')
      .eq('is_active', true)
      .order('effective_date', { ascending: false });

    if (!error && data) {
      setRegulations(data as Regulation[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRegulations();
  }, [loadRegulations]);

  const toggleAutoSync = useCallback(() => {
    if (autoSyncOn) {
      stopAutoSync();
      setAutoSyncOn(false);
    } else {
      startAutoSync(3600000, undefined, () => {
        setLastSynced(getLastSyncedAt());
        loadRegulations();
      });
      setAutoSyncOn(true);
    }
  }, [autoSyncOn, loadRegulations]);

  /* ── Sync ──────────────────────────────────────────────────────────── */

  const handleSync = useCallback(async () => {
    setShowSyncModal(true);
    setSyncProgress({
      phase: 'extracting',
      total: 0,
      completed: 0,
      currentItem: 'Starting…',
      log: [],
    });

    const result = await syncRegulations((progress) => {
      setSyncProgress({ ...progress });
    });

    // Try to reload from Supabase first
    const { data } = await (supabase as any)
      .from('regulations')
      .select('*')
      .eq('is_active', true)
      .order('effective_date', { ascending: false });

    if (data && data.length > 0) {
      setRegulations(data as Regulation[]);
    } else if (result.records.length > 0) {
      // Supabase persist failed (RLS issue), use AI-generated records directly
      const now = new Date().toISOString();
      setRegulations(
        result.records.map((r, i) => ({
          id: `local-${i}`,
          title: r.title,
          source: r.source,
          category: r.category,
          content: r.content,
          source_url: r.source_url,
          version: r.version,
          effective_date: r.effective_date,
          is_active: true,
          last_crawled: now,
          created_at: now,
          updated_at: now,
        }))
      );
    }
  }, []);

  const closeSyncModal = useCallback(() => {
    if (syncProgress?.phase === 'enriching' || syncProgress?.phase === 'persisting') return;
    setShowSyncModal(false);
    setSyncProgress(null);
  }, [syncProgress]);

  /* ── Computed data ─────────────────────────────────────────────────── */

  const categoryStats = useMemo(() => {
    const stats: Record<string, { count: number; lastUpdated: string }> = {};
    regulations.forEach((reg) => {
      if (!stats[reg.category]) {
        stats[reg.category] = { count: 0, lastUpdated: reg.last_crawled || reg.updated_at };
      }
      stats[reg.category].count++;
      const regDate = reg.last_crawled || reg.updated_at;
      if (new Date(regDate) > new Date(stats[reg.category].lastUpdated)) {
        stats[reg.category].lastUpdated = regDate;
      }
    });
    return stats;
  }, [regulations]);

  const filteredRegulations = useMemo(() => {
    let list = regulations;
    if (selectedCategory) {
      list = list.filter((r) => r.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.source.toLowerCase().includes(q) ||
          r.content.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 30);
  }, [regulations, selectedCategory, searchQuery]);

  const totalCount = regulations.length;

  /* ── Loading skeleton ──────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-start justify-between">
          <div>
            <div className="h-8 w-56 rounded-lg bg-[var(--color-surface-alt)] animate-pulse mb-2" />
            <div className="h-4 w-80 rounded bg-[var(--color-surface-alt)] animate-pulse" />
          </div>
          <div className="h-10 w-44 rounded-xl bg-[var(--color-surface-alt)] animate-pulse" />
        </div>
        {/* Cards skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-[var(--color-surface-alt)] animate-pulse" />
          ))}
        </div>
        {/* List skeleton */}
        <div className="dash-card rounded-2xl p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-[var(--color-surface-alt)] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────────────────────── */

  const categoryKeys = Object.keys(CATEGORY_CONFIG);

  return (
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
              <Database className="w-5 h-5 dash-accent" />
            </div>
            <h2 className="text-2xl font-bold dash-text">Regulations Ledger</h2>
          </div>
          <p className="dash-text-secondary text-sm ml-12">
            {totalCount} active regulations across {Object.keys(categoryStats).length} categories
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Auto-Sync Toggle */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--color-border)] dash-card">
            <button onClick={toggleAutoSync}
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${autoSyncOn ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]'}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-[var(--color-surface)] shadow transform transition-transform mt-0.5 ${autoSyncOn ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'}`} />
            </button>
            <div className="text-xs">
              <span className="font-semibold dash-text">Auto-Sync</span>
              {autoSyncOn && <span className="ml-1.5 inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" /><span className="dash-text-tertiary">{getTimeAgo(lastSynced)}</span></span>}
            </div>
          </div>
          <button
            onClick={handleSync}
            disabled={syncProgress?.phase === 'enriching' || syncProgress?.phase === 'persisting'}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white
                       bg-gradient-to-r from-[var(--color-accent)] to-[color-mix(in_srgb,var(--color-accent),#000_20%)]
                       hover:shadow-lg hover:shadow-[var(--color-accent-soft)] transition-all duration-200
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            AI Sync
          </button>
        </div>
      </div>

      {/* ═══ Category Folder Cards ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {categoryKeys.map((catKey) => {
          const cfg = CATEGORY_CONFIG[catKey];
          const stats = categoryStats[catKey];
          const count = stats?.count || 0;
          const Icon = cfg.icon;
          const isActive = selectedCategory === catKey;

          return (
            <button
              key={catKey}
              onClick={() => setSelectedCategory(isActive ? null : catKey)}
              className={`group relative rounded-2xl p-5 text-left transition-all duration-200
                border-2 overflow-hidden
                ${isActive
                  ? 'border-[var(--color-accent)] shadow-lg shadow-[var(--color-accent-soft)] scale-[1.02]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-accent)] hover:shadow-md'
                }
                dash-card`}
            >
              {/* Gradient accent background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${cfg.gradient} pointer-events-none`} />

              <div className="relative">
                {/* Icon */}
                <div className={`inline-flex p-2.5 rounded-xl ${cfg.iconBg} mb-3`}>
                  <Icon className="w-5 h-5" />
                </div>

                {/* Title */}
                <h3 className="font-semibold dash-text text-sm leading-tight mb-1">
                  {cfg.label}
                </h3>

                {/* Count */}
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold dash-text tabular-nums">{count}</span>
                  <ChevronRight
                    className={`w-4 h-4 transition-transform duration-200
                      ${isActive ? 'rotate-90 dash-accent' : 'dash-text-tertiary group-hover:translate-x-0.5'}`}
                  />
                </div>

                {/* Description */}
                <p className="text-[10px] dash-text-tertiary mt-1 leading-tight line-clamp-2">
                  {cfg.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ═══ Regulation List Section ═══ */}
      <div className="dash-card rounded-2xl overflow-hidden">
        {/* List header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-5 h-5 dash-accent" />
            <h3 className="font-semibold dash-text">
              {selectedCategory ? CATEGORY_CONFIG[selectedCategory]?.label : 'All'} Regulations
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--color-accent-soft)] dash-accent tabular-nums">
              {filteredRegulations.length}{filteredRegulations.length === 30 ? '+' : ''}
            </span>
            {selectedCategory && (
              <button
                onClick={() => setSelectedCategory(null)}
                className="text-xs dash-text-tertiary hover:dash-accent transition flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search regulations…"
              className="pl-9 pr-4 py-2 rounded-lg border border-[var(--color-border)] text-sm
                         dash-surface dash-text placeholder:text-[var(--color-text-tertiary)]
                         focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent
                         w-56 transition"
            />
          </div>
        </div>

        {/* List body */}
        {filteredRegulations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="p-4 rounded-2xl bg-[var(--color-surface-alt)] mb-4">
              <BookOpen className="w-8 h-8 dash-text-tertiary" />
            </div>
            <p className="font-medium dash-text mb-1">No regulations found</p>
            <p className="text-sm dash-text-tertiary text-center max-w-sm">
              {regulations.length === 0
                ? 'Click "AI Sync Regulations" above to extract and populate the ledger from the compliance engine.'
                : 'Try adjusting your search or removing the category filter.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {filteredRegulations.map((reg, index) => {
              const cfg = CATEGORY_CONFIG[reg.category] || CATEGORY_CONFIG.general;
              const Icon = cfg.icon;

              return (
                <button
                  key={reg.id}
                  onClick={() => setSelectedRegulation(reg)}
                  className="w-full text-left px-6 py-4 flex items-start gap-4 transition-colors
                             hover:bg-[var(--color-surface-alt)] group"
                >
                  {/* Rank / icon */}
                  <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0 w-8">
                    <span className="text-[10px] font-bold dash-text-tertiary tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className={`p-1.5 rounded-lg ${cfg.iconBg}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <h4 className="font-semibold dash-text text-sm leading-snug group-hover:text-[var(--color-accent)] transition-colors">
                        {reg.title}
                      </h4>
                      <ArrowRight className="w-4 h-4 dash-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                    </div>

                    <p className="text-xs dash-text-secondary line-clamp-1 mb-2">
                      {reg.content}
                    </p>

                    {/* Meta row */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${cfg.badgeBg} ${cfg.badgeText}`}>
                        {cfg.label}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] dash-text-tertiary">
                        <Shield className="w-3 h-3" />
                        {reg.source}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] dash-text-tertiary">
                        <Hash className="w-3 h-3" />
                        v{reg.version}
                      </span>
                      {reg.effective_date && (
                        <span className="flex items-center gap-1 text-[10px] dash-text-tertiary">
                          <Calendar className="w-3 h-3" />
                          {new Date(reg.effective_date).toLocaleDateString()}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[10px] dash-text-tertiary">
                        <Clock className="w-3 h-3" />
                        Synced {new Date(reg.last_crawled || reg.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Show-more hint */}
        {filteredRegulations.length === 30 && (
          <div className="px-6 py-3 border-t border-[var(--color-border)] text-center">
            <p className="text-xs dash-text-tertiary">
              Showing top 30 results. Use search or category filters to narrow down.
            </p>
          </div>
        )}
      </div>

      {/* ═══ Detail Modal ════════════════════════════════════════════════ */}
      {selectedRegulation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="dash-card rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="sticky top-0 dash-surface border-b border-[var(--color-border)] p-6 flex items-start justify-between rounded-t-2xl z-10">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className={`p-3 rounded-xl shrink-0 ${CATEGORY_CONFIG[selectedRegulation.category]?.iconBg || 'bg-slate-500/15'}`}>
                  {(() => {
                    const CatIcon = CATEGORY_CONFIG[selectedRegulation.category]?.icon || ScrollText;
                    return <CatIcon className="w-6 h-6" />;
                  })()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold dash-text leading-snug">{selectedRegulation.title}</h3>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-sm dash-text-secondary">{selectedRegulation.source}</span>
                    <span className="text-xs dash-text-tertiary">Version {selectedRegulation.version}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedRegulation(null)}
                className="p-1.5 rounded-lg dash-text-secondary hover:bg-[var(--color-surface-alt)] transition ml-3 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-5">
              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const cfg = CATEGORY_CONFIG[selectedRegulation.category] || CATEGORY_CONFIG.general;
                  return (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${cfg.badgeBg} ${cfg.badgeText}`}>
                      {(() => { const I = cfg.icon; return <I className="w-3 h-3" />; })()}
                      {cfg.label}
                    </span>
                  );
                })()}
                {selectedRegulation.effective_date && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[var(--color-surface-alt)] dash-text-secondary">
                    <Calendar className="w-3 h-3" />
                    Effective {new Date(selectedRegulation.effective_date).toLocaleDateString()}
                  </span>
                )}
                {selectedRegulation.source_url && (
                  <a
                    href={selectedRegulation.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium
                               bg-[var(--color-accent-soft)] dash-accent hover:underline transition"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View source
                  </a>
                )}
              </div>

              {/* Content */}
              <div>
                <h4 className="text-sm font-semibold dash-text mb-2 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 dash-accent" />
                  Regulation Content
                </h4>
                <div className="rounded-xl bg-[var(--color-surface-alt)] p-5 border border-[var(--color-border)]">
                  <p className="dash-text-secondary whitespace-pre-wrap leading-relaxed text-sm">
                    {selectedRegulation.content}
                  </p>
                </div>
              </div>

              {/* Info banner */}
              <div className="flex items-start gap-3 rounded-xl bg-[var(--color-info-soft)] dark:bg-blue-950/20 border border-[var(--color-info)]/20 dark:border-blue-800/40 p-4">
                <AlertCircle className="w-5 h-5 text-[var(--color-info)] shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium dash-text mb-0.5">Verification</p>
                  <p className="dash-text-secondary text-xs">
                    Last synced {new Date(selectedRegulation.last_crawled || selectedRegulation.updated_at).toLocaleDateString()}.
                    All compliance analyses use this verified version.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Sync Progress Modal ═════════════════════════════════════════ */}
      {showSyncModal && syncProgress && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="dash-card rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${syncProgress.phase === 'done'
                  ? 'bg-[var(--color-success-soft)] dark:bg-green-900/30'
                  : syncProgress.phase === 'error'
                    ? 'bg-[var(--color-danger-soft)] dark:bg-[var(--color-danger)]/30'
                    : 'bg-[var(--color-accent-soft)]'
                  }`}>
                  {syncProgress.phase === 'done' ? (
                    <CheckCircle2 className="w-5 h-5 text-[var(--color-success)]" />
                  ) : syncProgress.phase === 'error' ? (
                    <AlertCircle className="w-5 h-5 text-[var(--color-danger)]" />
                  ) : (
                    <Cpu className="w-5 h-5 dash-accent animate-pulse" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold dash-text">AI Regulation Sync</h3>
                  <p className="text-xs dash-text-tertiary">
                    {PHASE_LABELS[syncProgress.phase]}
                  </p>
                </div>
              </div>
              <button
                onClick={closeSyncModal}
                disabled={syncProgress.phase === 'enriching' || syncProgress.phase === 'persisting' || syncProgress.phase === 'extracting'}
                className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] transition dash-text-secondary
                           disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Progress bar */}
            {syncProgress.total > 0 && (
              <div className="px-6 pt-4">
                <div className="flex items-center justify-between text-xs dash-text-secondary mb-2">
                  <span className="truncate mr-4">{syncProgress.currentItem}</span>
                  <span className="tabular-nums font-medium shrink-0">
                    {syncProgress.completed}/{syncProgress.total}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--color-surface-alt)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300 ease-out"
                    style={{
                      width: `${Math.round((syncProgress.completed / syncProgress.total) * 100)}%`,
                      background: syncProgress.phase === 'done'
                        ? '#16a34a'
                        : syncProgress.phase === 'error'
                          ? '#dc2626'
                          : 'var(--color-accent)',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Log */}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              <div className="space-y-1.5 font-mono text-xs">
                {syncProgress.log.map((line, i) => (
                  <div
                    key={i}
                    className={`leading-relaxed ${line.startsWith('✓') ? 'text-[var(--color-success)] dark:text-[var(--color-success)]' :
                      line.startsWith('✗') ? 'text-[var(--color-danger)] dark:text-[var(--color-danger)]' :
                        line.startsWith('✅') ? 'text-[var(--color-success)] dark:text-[var(--color-success)] font-semibold' :
                          line.startsWith('↳') ? 'dash-text-tertiary' :
                            'dash-text-secondary'
                      }`}
                  >
                    {line}
                  </div>
                ))}
                {(syncProgress.phase === 'enriching' || syncProgress.phase === 'persisting') && (
                  <div className="flex items-center gap-2 dash-text-tertiary">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>{syncProgress.currentItem}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            {(syncProgress.phase === 'done' || syncProgress.phase === 'error') && (
              <div className="px-6 py-4 border-t border-[var(--color-border)]">
                <button
                  onClick={closeSyncModal}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white
                             bg-[var(--color-accent)] hover:opacity-90 transition"
                >
                  Close
                </button>
              </div>
            )}

            {/* Error banner */}
            {syncProgress.error && (
              <div className="px-6 pb-4">
                <div className="bg-[var(--color-danger-soft)] dark:bg-red-950/30 border border-[var(--color-danger)]/20 dark:border-red-800 rounded-lg p-3 text-sm text-[var(--color-danger)] dark:text-[var(--color-danger)]">
                  {syncProgress.error}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
