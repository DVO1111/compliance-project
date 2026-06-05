import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Plus, RefreshCw, ChevronRight, ChevronDown,
  AlertTriangle, Info, Shield, Globe, Edit2, ToggleLeft,
  ToggleRight, Search, Filter, X, Check, Layers,
} from 'lucide-react';
import {
  getAllFrameworks, getControlsForFramework, createFramework, updateFramework,
  createControl, toggleControl, refreshCache,
  type FrameworkRow, type ControlRow,
} from '../../lib/frameworkLibraryService';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function severityBadge(s: string) {
  if (s === 'Red')
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger)] border border-[var(--color-danger)]/30">Red</span>;
  if (s === 'Yellow')
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-warning-soft)] text-[var(--color-warning)] border border-[var(--color-warning)]/30">Yellow</span>;
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-info-soft)] text-[var(--color-info)] border border-[var(--color-info)]/30">Info</span>;
}

function typeBadge(t: string) {
  if (t === 'pattern_rule')
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">Pattern</span>;
  if (t === 'caveat_rule')
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">Caveat</span>;
  return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-surface-alt)] dash-text-secondary">Policy</span>;
}

const JURISDICTION_LABELS: Record<string, string> = {
  nigeria: 'Nigeria',
  usa: 'USA',
  europe: 'Europe',
  pan_african: 'Pan-African',
  who: 'WHO / Global',
  global: 'Global',
};

/* ── Add Framework Modal ─────────────────────────────────────────────────── */

function AddFrameworkModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    code: '', name: '', short_name: '', jurisdiction: 'nigeria',
    regulatory_body: '', version: '', description: '', sort_order: 99,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.code || !form.name || !form.regulatory_body) {
      setError('Code, name, and regulatory body are required.');
      return;
    }
    setSaving(true);
    const result = await createFramework({ ...form, is_active: true });
    setSaving(false);
    if (!result) { setError('Save failed — check for duplicate code.'); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="dash-card border dash-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b dash-border">
          <h3 className="font-bold dash-text">Add Framework</h3>
          <button onClick={onClose}><X size={18} className="dash-text-tertiary" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold dash-text-secondary uppercase tracking-wide">Code *</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="e.g. nafdac_gmp" className="mt-1 w-full px-3 py-2 text-sm rounded-xl border dash-border dash-card dash-text focus:outline-none focus:border-[var(--color-accent)]" />
            </div>
            <div>
              <label className="text-xs font-semibold dash-text-secondary uppercase tracking-wide">Short name *</label>
              <input value={form.short_name} onChange={e => setForm(f => ({ ...f, short_name: e.target.value }))}
                placeholder="e.g. NAFDAC GMP" className="mt-1 w-full px-3 py-2 text-sm rounded-xl border dash-border dash-card dash-text focus:outline-none focus:border-[var(--color-accent)]" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold dash-text-secondary uppercase tracking-wide">Full name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. NAFDAC Good Manufacturing Practice Guidelines" className="mt-1 w-full px-3 py-2 text-sm rounded-xl border dash-border dash-card dash-text focus:outline-none focus:border-[var(--color-accent)]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold dash-text-secondary uppercase tracking-wide">Jurisdiction</label>
              <select value={form.jurisdiction} onChange={e => setForm(f => ({ ...f, jurisdiction: e.target.value }))}
                className="mt-1 w-full px-3 py-2 text-sm rounded-xl border dash-border dash-card dash-text focus:outline-none">
                {Object.entries(JURISDICTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold dash-text-secondary uppercase tracking-wide">Regulatory body *</label>
              <input value={form.regulatory_body} onChange={e => setForm(f => ({ ...f, regulatory_body: e.target.value }))}
                placeholder="e.g. NAFDAC" className="mt-1 w-full px-3 py-2 text-sm rounded-xl border dash-border dash-card dash-text focus:outline-none focus:border-[var(--color-accent)]" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold dash-text-secondary uppercase tracking-wide">Version / Year</label>
            <input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
              placeholder="e.g. 2024" className="mt-1 w-full px-3 py-2 text-sm rounded-xl border dash-border dash-card dash-text focus:outline-none focus:border-[var(--color-accent)]" />
          </div>
          <div>
            <label className="text-xs font-semibold dash-text-secondary uppercase tracking-wide">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3} className="mt-1 w-full px-3 py-2 text-sm rounded-xl border dash-border dash-card dash-text focus:outline-none focus:border-[var(--color-accent)] resize-none" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-6 border-t dash-border">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border dash-border dash-card dash-text hover:border-[var(--color-accent)] transition-colors">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm rounded-xl font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Framework'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Add Control Modal ───────────────────────────────────────────────────── */

function AddControlModal({
  frameworkId,
  frameworkJurisdiction,
  onClose,
  onSaved,
}: {
  frameworkId: string;
  frameworkJurisdiction: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    control_code: '', title: '', description: '',
    control_type: 'pattern_rule' as 'pattern_rule' | 'caveat_rule' | 'policy_control',
    severity: 'Yellow' as 'Red' | 'Yellow' | 'Info',
    regulation_cited: '', category: '', jurisdiction: frameworkJurisdiction,
    pattern_source: '', pattern_flags: 'gi',
    suggestion_template: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.control_code || !form.title || !form.regulation_cited || !form.suggestion_template) {
      setError('Code, title, regulation citation, and suggestion template are required.');
      return;
    }
    if (form.control_type === 'pattern_rule' && !form.pattern_source) {
      setError('Pattern source is required for pattern rules.');
      return;
    }
    setSaving(true);
    const result = await createControl({
      framework_id: frameworkId,
      section_id: null,
      control_code: form.control_code,
      title: form.title,
      description: form.description || form.title,
      control_type: form.control_type,
      severity: form.severity,
      regulation_cited: form.regulation_cited,
      category: form.category || null,
      jurisdiction: form.jurisdiction || null,
      pattern_source: form.control_type === 'pattern_rule' ? form.pattern_source : null,
      pattern_flags: form.pattern_flags || 'gi',
      suggestion_template: form.suggestion_template,
      trigger_patterns: null,
      required_phrases: null,
      platforms: null,
      audiences: null,
      is_active: true,
    });
    setSaving(false);
    if (!result) { setError('Save failed — check for duplicate control code.'); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="dash-card border dash-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b dash-border">
          <h3 className="font-bold dash-text">Add Control / Rule</h3>
          <button onClick={onClose}><X size={18} className="dash-text-tertiary" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold dash-text-secondary uppercase tracking-wide">Control code *</label>
              <input value={form.control_code} onChange={e => setForm(f => ({ ...f, control_code: e.target.value }))}
                placeholder="e.g. NAFDAC-GMP-001" className="mt-1 w-full px-3 py-2 text-sm rounded-xl border dash-border dash-card dash-text focus:outline-none focus:border-[var(--color-accent)]" />
            </div>
            <div>
              <label className="text-xs font-semibold dash-text-secondary uppercase tracking-wide">Type</label>
              <select value={form.control_type} onChange={e => setForm(f => ({ ...f, control_type: e.target.value as typeof form.control_type }))}
                className="mt-1 w-full px-3 py-2 text-sm rounded-xl border dash-border dash-card dash-text focus:outline-none">
                <option value="pattern_rule">Pattern rule (regex)</option>
                <option value="caveat_rule">Caveat rule (required phrase)</option>
                <option value="policy_control">Policy control</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold dash-text-secondary uppercase tracking-wide">Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Short description of what this rule checks" className="mt-1 w-full px-3 py-2 text-sm rounded-xl border dash-border dash-card dash-text focus:outline-none focus:border-[var(--color-accent)]" />
          </div>
          <div>
            <label className="text-xs font-semibold dash-text-secondary uppercase tracking-wide">Regulation cited *</label>
            <input value={form.regulation_cited} onChange={e => setForm(f => ({ ...f, regulation_cited: e.target.value }))}
              placeholder="e.g. NAFDAC GMP Guidelines 2024, Section 4.1" className="mt-1 w-full px-3 py-2 text-sm rounded-xl border dash-border dash-card dash-text focus:outline-none focus:border-[var(--color-accent)]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold dash-text-secondary uppercase tracking-wide">Severity</label>
              <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value as typeof form.severity }))}
                className="mt-1 w-full px-3 py-2 text-sm rounded-xl border dash-border dash-card dash-text focus:outline-none">
                <option value="Red">Red (critical)</option>
                <option value="Yellow">Yellow (warning)</option>
                <option value="Info">Info</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold dash-text-secondary uppercase tracking-wide">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="mt-1 w-full px-3 py-2 text-sm rounded-xl border dash-border dash-card dash-text focus:outline-none">
                <option value="">— select —</option>
                <option value="product_violation">Product violation</option>
                <option value="advertising_violation">Advertising violation</option>
                <option value="professional_ethics_violation">Professional ethics</option>
              </select>
            </div>
          </div>
          {form.control_type === 'pattern_rule' && (
            <div className="space-y-3 p-4 rounded-xl bg-[var(--color-surface-alt)] border dash-border">
              <p className="text-xs font-semibold dash-text-secondary uppercase tracking-wide">Pattern rule configuration</p>
              <div>
                <label className="text-xs dash-text-secondary">Regex pattern (no delimiters or flags)</label>
                <input value={form.pattern_source} onChange={e => setForm(f => ({ ...f, pattern_source: e.target.value }))}
                  placeholder="e.g. \b(cure[sd]?|curing)\b" className="mt-1 w-full px-3 py-2 text-sm font-mono rounded-xl border dash-border dash-card dash-text focus:outline-none focus:border-[var(--color-accent)]" />
              </div>
              <div>
                <label className="text-xs dash-text-secondary">Flags</label>
                <input value={form.pattern_flags} onChange={e => setForm(f => ({ ...f, pattern_flags: e.target.value }))}
                  className="mt-1 w-32 px-3 py-2 text-sm font-mono rounded-xl border dash-border dash-card dash-text focus:outline-none focus:border-[var(--color-accent)]" />
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold dash-text-secondary uppercase tracking-wide">
              Suggestion template * <span className="normal-case font-normal">(use <code className="bg-[var(--color-surface-alt)] px-1 rounded">{'{matched}'}</code> for the flagged text)</span>
            </label>
            <textarea value={form.suggestion_template} onChange={e => setForm(f => ({ ...f, suggestion_template: e.target.value }))}
              placeholder={`e.g. Replace "{matched}" with "indicated for management of"`}
              rows={3} className="mt-1 w-full px-3 py-2 text-sm rounded-xl border dash-border dash-card dash-text focus:outline-none focus:border-[var(--color-accent)] resize-none" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-6 border-t dash-border">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border dash-border dash-card dash-text hover:border-[var(--color-accent)] transition-colors">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm rounded-xl font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Control'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Control Row ─────────────────────────────────────────────────────────── */

function ControlItem({ control, onToggle }: { control: ControlRow; onToggle: (id: string, active: boolean) => void }) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    await onToggle(control.id, !control.is_active);
    setToggling(false);
  };

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${control.is_active ? 'dash-border bg-[var(--color-surface-alt)]' : 'border-dashed border-[var(--color-border)] opacity-50'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-xs font-mono font-bold dash-text-secondary">{control.control_code}</span>
          {severityBadge(control.severity)}
          {typeBadge(control.control_type)}
        </div>
        <p className="text-sm font-medium dash-text leading-snug">{control.title}</p>
        <p className="text-xs dash-text-tertiary mt-0.5 leading-relaxed">{control.regulation_cited}</p>
        {control.pattern_source && (
          <p className="text-[10px] font-mono dash-text-tertiary mt-1 bg-[var(--color-surface)] px-2 py-0.5 rounded inline-block">
            /{control.pattern_source}/{control.pattern_flags}
          </p>
        )}
      </div>
      <button
        onClick={handleToggle}
        disabled={toggling}
        title={control.is_active ? 'Disable this control' : 'Enable this control'}
        className="flex-shrink-0 transition-colors"
      >
        {control.is_active
          ? <ToggleRight size={20} className="text-[var(--color-success)]" />
          : <ToggleLeft size={20} className="dash-text-tertiary" />
        }
      </button>
    </div>
  );
}

/* ── Framework Panel ─────────────────────────────────────────────────────── */

function FrameworkPanel({ framework, onAddControl, onControlToggle }: {
  framework: FrameworkRow;
  onAddControl: (fw: FrameworkRow) => void;
  onControlToggle: (id: string, active: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [controls, setControls] = useState<ControlRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    if (controls.length > 0) return;
    setLoading(true);
    const rows = await getControlsForFramework(framework.id);
    setControls(rows);
    setLoading(false);
  };

  const toggle = () => {
    setExpanded(e => !e);
    if (!expanded) load();
  };

  const handleControlToggle = async (id: string, active: boolean) => {
    await onControlToggle(id, active);
    setControls(cs => cs.map(c => c.id === id ? { ...c, is_active: active } : c));
  };

  const filtered = search
    ? controls.filter(c =>
        c.control_code.toLowerCase().includes(search.toLowerCase()) ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.regulation_cited.toLowerCase().includes(search.toLowerCase())
      )
    : controls;

  const activeCount  = controls.filter(c => c.is_active).length;
  const totalCount   = controls.length;

  return (
    <div className="dash-card border dash-border rounded-2xl overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-start gap-4 p-5 hover:bg-[var(--color-surface-alt)] transition-colors text-left"
      >
        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)] flex-shrink-0 mt-0.5">
          <BookOpen size={16} className="text-[var(--color-accent)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold dash-text">{framework.short_name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-surface-alt)] dash-text-secondary border dash-border font-medium">
              {JURISDICTION_LABELS[framework.jurisdiction] ?? framework.jurisdiction}
            </span>
            {!framework.is_active && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger)] border border-[var(--color-danger)]/30">Inactive</span>
            )}
          </div>
          <p className="text-sm dash-text-secondary mt-0.5 leading-snug truncate">{framework.name}</p>
          {expanded && totalCount > 0 && (
            <p className="text-xs dash-text-tertiary mt-1">{activeCount} of {totalCount} controls active</p>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center gap-3">
          {!expanded && totalCount > 0 && (
            <span className="text-xs font-semibold dash-text-tertiary">{activeCount}/{totalCount}</span>
          )}
          {expanded ? <ChevronDown size={16} className="dash-text-tertiary" /> : <ChevronRight size={16} className="dash-text-tertiary" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t dash-border">
          {/* Controls toolbar */}
          <div className="flex items-center gap-3 px-5 py-3 bg-[var(--color-surface-alt)]">
            <div className="flex-1 relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 dash-text-tertiary" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search controls…"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border dash-border dash-card dash-text focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>
            <button
              onClick={() => onAddControl(framework)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
            >
              <Plus size={12} /> Add Control
            </button>
          </div>

          <div className="p-4 space-y-2">
            {loading && <p className="text-sm dash-text-tertiary text-center py-4">Loading controls…</p>}
            {!loading && filtered.length === 0 && (
              <p className="text-sm dash-text-tertiary text-center py-6">
                {search ? 'No controls match your search.' : 'No controls yet — add the first one.'}
              </p>
            )}
            {filtered.map(c => (
              <ControlItem key={c.id} control={c} onToggle={handleControlToggle} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function FrameworkLibraryPage() {
  const [frameworks, setFrameworks] = useState<FrameworkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddFramework, setShowAddFramework] = useState(false);
  const [addControlFor, setAddControlFor] = useState<FrameworkRow | null>(null);
  const [filterJurisdiction, setFilterJurisdiction] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await getAllFrameworks();
    setFrameworks(rows);
    setLoading(false);
  }, []);

  const handleRefreshCache = async () => {
    setRefreshing(true);
    await refreshCache();
    setRefreshing(false);
  };

  useEffect(() => { load(); }, [load]);

  const handleControlToggle = async (id: string, active: boolean) => {
    await toggleControl(id, active);
  };

  const jurisdictions = ['all', ...Array.from(new Set(frameworks.map(f => f.jurisdiction)))];

  const filtered = frameworks.filter(f => {
    const matchJur = filterJurisdiction === 'all' || f.jurisdiction === filterJurisdiction;
    const matchSearch = !search || f.short_name.toLowerCase().includes(search.toLowerCase()) || f.name.toLowerCase().includes(search.toLowerCase());
    return matchJur && matchSearch;
  });

  // Summary stats
  const totalFrameworks = frameworks.length;
  const activeFrameworks = frameworks.filter(f => f.is_active).length;

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
              <Layers size={20} className="text-[var(--color-accent)]" />
            </div>
            <h2 className="text-2xl font-bold dash-text">Framework Library</h2>
          </div>
          <p className="text-sm dash-text-secondary ml-12">
            Pre-encoded regulatory frameworks — add new regulators and edit rules without a code deploy
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleRefreshCache}
            disabled={refreshing}
            title="Reload compliance engine cache from DB"
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border dash-border dash-card hover:border-[var(--color-accent)] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh cache
          </button>
          <button
            onClick={() => setShowAddFramework(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
          >
            <Plus size={14} /> Add Framework
          </button>
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total frameworks', value: totalFrameworks, icon: BookOpen, color: 'text-[var(--color-accent)]', bg: 'bg-[var(--color-accent-soft)]' },
          { label: 'Active frameworks', value: activeFrameworks, icon: Check, color: 'text-[var(--color-success)]', bg: 'bg-[var(--color-success-soft)]' },
          { label: 'Jurisdictions covered', value: new Set(frameworks.map(f => f.jurisdiction)).size, icon: Globe, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' },
          { label: 'Last cache refresh', value: 'Live', icon: Shield, color: 'text-[var(--color-info)]', bg: 'bg-[var(--color-info-soft)]' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="dash-card border dash-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${bg}`}>
                <Icon size={14} className={color} />
              </div>
              <span className="text-xs dash-text-secondary">{label}</span>
            </div>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 dash-text-tertiary" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search frameworks…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border dash-border dash-card dash-text focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={13} className="dash-text-tertiary" />
          {jurisdictions.map(j => (
            <button
              key={j}
              onClick={() => setFilterJurisdiction(j)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${filterJurisdiction === j ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]' : 'dash-border dash-card dash-text hover:border-[var(--color-accent)]'}`}
            >
              {j === 'all' ? 'All' : JURISDICTION_LABELS[j] ?? j}
            </button>
          ))}
        </div>
      </div>

      {/* ── Framework list ──────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-[var(--color-surface-alt)] animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="dash-card border dash-border rounded-2xl p-12 text-center">
          <BookOpen size={32} className="dash-text-tertiary mx-auto mb-3" />
          <p className="dash-text font-semibold">No frameworks found</p>
          <p className="text-sm dash-text-tertiary mt-1">Add the first framework or run the DB migration to bootstrap from existing rules.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(fw => (
            <FrameworkPanel
              key={fw.id}
              framework={fw}
              onAddControl={setAddControlFor}
              onControlToggle={handleControlToggle}
            />
          ))}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────── */}
      {showAddFramework && (
        <AddFrameworkModal
          onClose={() => setShowAddFramework(false)}
          onSaved={load}
        />
      )}
      {addControlFor && (
        <AddControlModal
          frameworkId={addControlFor.id}
          frameworkJurisdiction={addControlFor.jurisdiction}
          onClose={() => setAddControlFor(null)}
          onSaved={() => {
            // Expanding the framework panel will re-load controls automatically
          }}
        />
      )}
    </div>
  );
}
