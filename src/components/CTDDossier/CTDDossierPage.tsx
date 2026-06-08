// src/components/CTDDossier/CTDDossierPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    FileStack, Plus, X, ChevronDown, ChevronRight,
    CheckCircle, Clock, AlertTriangle, Calendar,
    Loader2, Trash2, BookOpen, BarChart3, Layers,
    Circle, MinusCircle, XCircle,
} from 'lucide-react';
import {
    getDossiers, createDossier, updateDossierStatus, deleteDossier,
    getModuleProgress, updateModuleProgress,
    getDocuments, updateDocumentStatus,
    calcReadinessScore, getDaysUntilSubmission, getSubmissionUrgency,
    APPLICATION_TYPE_LABELS, DOSSIER_STATUS_LABELS, DOSSIER_STATUS_COLORS,
    MODULE_NAMES, MODULE_DESCRIPTIONS,
    type CTDDossier, type CTDModuleProgress, type CTDDocument,
    type DossierStatus, type ModuleStatus, type DocumentStatus, type ApplicationType,
} from '../../lib/ctdDossierService';
import { getSubmissionsForDossier, STATUS_LABELS as SUB_STATUS_LABELS, STATUS_COLORS as SUB_STATUS_COLORS, type RegulatorySubmission } from '../../lib/regulatoryAffairsService';
import NewSubmissionModal from '../RegulatoryAffairs/NewSubmissionModal';

/* ── Constants ──────────────────────────────────────────────────────────────── */

const DOSAGE_FORMS = [
    'Tablet', 'Capsule', 'Oral Solution / Syrup', 'Injection (Solution)',
    'Injection (Suspension)', 'Cream / Ointment', 'Suppository',
    'Inhaler', 'Nasal Spray', 'Eye / Ear Drops', 'Powder for Reconstitution', 'Other',
];

const STATUS_FLOW: DossierStatus[] = [
    'preparation', 'screening', 'screening_cleared', 'under_review', 'approved',
];

const DOC_STATUS_ICONS: Record<DocumentStatus, React.ReactNode> = {
    missing:        <Circle className="w-4 h-4 text-[var(--color-text-tertiary)]" />,
    draft:          <Clock className="w-4 h-4 text-[var(--color-warning)]" />,
    complete:       <CheckCircle className="w-4 h-4 text-[var(--color-success)]" />,
    not_applicable: <MinusCircle className="w-4 h-4 text-[var(--color-text-tertiary)]" />,
};

const MODULE_STATUS_COLORS: Record<ModuleStatus, string> = {
    not_started:    'bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)]',
    in_progress:    'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    complete:       'bg-[var(--color-success-soft)] text-[var(--color-success)]',
    not_applicable: 'bg-[var(--color-surface-alt)] text-[var(--color-text-tertiary)]',
};

function ReadinessRing({ score }: { score: number }) {
    const color = score >= 80 ? 'var(--color-success)' : score >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
    return (
        <div className="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-border)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
                    strokeDasharray={`${score} ${100 - score}`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold dash-text">{score}%</span>
        </div>
    );
}

/* ── Main component ─────────────────────────────────────────────────────────── */

export default function CTDDossierPage() {
    const { user, profile } = useAuth();
    const companyId = (profile as any)?.company_id as string | undefined;

    const [tab, setTab] = useState<'dossiers' | 'tracker' | 'calendar'>('dossiers');
    const [dossiers, setDossiers] = useState<CTDDossier[]>([]);
    const [loading, setLoading] = useState(true);

    // Module tracker state
    const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null);
    const [modules, setModules] = useState<CTDModuleProgress[]>([]);
    const [documents, setDocuments] = useState<CTDDocument[]>([]);
    const [expandedModule, setExpandedModule] = useState<number | null>(null);
    const [trackerLoading, setTrackerLoading] = useState(false);

    // New dossier modal
    const [showNewModal, setShowNewModal] = useState(false);
    const [form, setForm] = useState({
        product_name: '',
        active_ingredient: '',
        dosage_form: 'Tablet',
        strength: '',
        nafdac_number: '',
        application_type: 'new_registration' as ApplicationType,
        target_submission_date: '',
        dossier_reference: '',
        notes: '',
    });
    const [saving, setSaving] = useState(false);

    // Status update
    const [statusModal, setStatusModal] = useState<CTDDossier | null>(null);
    const [newStatus, setNewStatus] = useState<DossierStatus>('preparation');
    const [statusDate, setStatusDate] = useState('');

    // NAPAMS submission linking
    const [linkedSubmissions, setLinkedSubmissions] = useState<Record<string, RegulatorySubmission[]>>({});
    const [napamsModalDossier, setNapamsModalDossier] = useState<CTDDossier | null>(null);

    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const doss = await getDossiers(companyId);
        setDossiers(doss);
        // Fetch linked submissions for all dossiers in parallel
        const entries = await Promise.all(
            doss.map(async d => [d.id, await getSubmissionsForDossier(d.id, companyId)] as [string, RegulatorySubmission[]])
        );
        setLinkedSubmissions(Object.fromEntries(entries));
        setLoading(false);
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    const loadTracker = useCallback(async (dossierId: string) => {
        setTrackerLoading(true);
        const [mods, docs] = await Promise.all([
            getModuleProgress(dossierId),
            getDocuments(dossierId),
        ]);
        setModules(mods);
        setDocuments(docs);
        setTrackerLoading(false);
    }, []);

    useEffect(() => {
        if (selectedDossierId) loadTracker(selectedDossierId);
    }, [selectedDossierId, loadTracker]);

    const handleCreate = async () => {
        if (!companyId || !user || !form.product_name.trim() || !form.dosage_form) return;
        setSaving(true);
        const result = await createDossier({
            company_id: companyId,
            product_name: form.product_name.trim(),
            active_ingredient: form.active_ingredient.trim() || null,
            dosage_form: form.dosage_form,
            strength: form.strength.trim() || null,
            nafdac_number: form.nafdac_number.trim() || null,
            application_type: form.application_type,
            status: 'preparation',
            target_submission_date: form.target_submission_date || null,
            submission_date: null,
            screening_date: null,
            screening_clearance_date: null,
            expected_approval_date: null,
            dossier_reference: form.dossier_reference.trim() || null,
            notes: form.notes.trim() || null,
            created_by: user.id,
        }, user.id);
        setSaving(false);
        if (result) {
            setShowNewModal(false);
            setForm({ product_name: '', active_ingredient: '', dosage_form: 'Tablet', strength: '', nafdac_number: '', application_type: 'new_registration', target_submission_date: '', dossier_reference: '', notes: '' });
            await load();
        }
    };

    const handleDelete = async (dossier: CTDDossier) => {
        if (!confirm(`Delete dossier for "${dossier.product_name}"? This cannot be undone.`)) return;
        if (!companyId || !user) return;
        await deleteDossier(dossier.id, companyId, user.id);
        await load();
    };

    const openStatusModal = (dossier: CTDDossier) => {
        setStatusModal(dossier);
        setNewStatus(dossier.status);
        setStatusDate('');
    };

    const handleStatusUpdate = async () => {
        if (!statusModal || !companyId || !user) return;
        const dateField: Partial<Record<keyof CTDDossier, string>> = {};
        if (newStatus === 'screening')          dateField.screening_date = statusDate || new Date().toISOString().split('T')[0];
        if (newStatus === 'screening_cleared')  dateField.screening_clearance_date = statusDate || new Date().toISOString().split('T')[0];
        if (newStatus === 'under_review')       dateField.submission_date = statusDate || new Date().toISOString().split('T')[0];
        if (newStatus === 'approved')           dateField.expected_approval_date = statusDate || new Date().toISOString().split('T')[0];
        await updateDossierStatus(statusModal.id, newStatus, dateField as any, companyId, user.id);
        setStatusModal(null);
        await load();
        if (selectedDossierId === statusModal.id) loadTracker(statusModal.id);
    };

    const handleModuleUpdate = async (mod: CTDModuleProgress, status: ModuleStatus, pct: number) => {
        await updateModuleProgress(mod.id, status, pct, mod.notes);
        if (selectedDossierId) loadTracker(selectedDossierId);
    };

    const handleDocStatus = async (doc: CTDDocument, status: DocumentStatus) => {
        await updateDocumentStatus(doc.id, status, doc.notes);
        if (selectedDossierId) loadTracker(selectedDossierId);
        // Recalculate module pct from documents
        const moduleId = modules.find(m => m.module_number === doc.module_number)?.id;
        if (!moduleId) return;
        const moduleDocs = documents.map(d => d.id === doc.id ? { ...d, status } : d)
            .filter(d => d.module_number === doc.module_number && d.status !== 'not_applicable');
        const complete = moduleDocs.filter(d => d.status === 'complete').length;
        const pct = moduleDocs.length === 0 ? 0 : Math.round((complete / moduleDocs.length) * 100);
        const modStatus: ModuleStatus = pct === 100 ? 'complete' : pct > 0 ? 'in_progress' : 'not_started';
        await updateModuleProgress(moduleId, modStatus, pct, null);
        if (selectedDossierId) loadTracker(selectedDossierId);
    };

    const selectedDossier = dossiers.find(d => d.id === selectedDossierId);
    const readinessScore = calcReadinessScore(modules);

    // Stats
    const stats = {
        total:       dossiers.length,
        preparation: dossiers.filter(d => d.status === 'preparation').length,
        inFlight:    dossiers.filter(d => ['screening', 'screening_cleared', 'under_review'].includes(d.status)).length,
        approved:    dossiers.filter(d => d.status === 'approved').length,
        urgent:      dossiers.filter(d => getSubmissionUrgency(getDaysUntilSubmission(d.target_submission_date)) === 'urgent').length,
    };

    // Calendar entries: dossiers with upcoming dates
    const calendarItems = dossiers
        .flatMap(d => {
            const items: { dossier: CTDDossier; label: string; date: string }[] = [];
            if (d.target_submission_date) items.push({ dossier: d, label: 'Target Submission', date: d.target_submission_date });
            if (d.expected_approval_date) items.push({ dossier: d, label: 'Expected Approval', date: d.expected_approval_date });
            if (d.screening_date)         items.push({ dossier: d, label: 'Screening Submitted', date: d.screening_date });
            if (d.screening_clearance_date) items.push({ dossier: d, label: 'Screening Cleared', date: d.screening_clearance_date });
            return items;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (!companyId) {
        return (
            <div className="text-center py-16">
                <FileStack className="w-10 h-10 text-[var(--color-text-tertiary)] mx-auto mb-3" />
                <p className="text-sm text-[var(--color-text-secondary)]">Company not set. Please complete onboarding.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                            <FileStack className="w-5 h-5 dash-accent" />
                        </div>
                        <h2 className="text-2xl font-bold dash-text">CTD Dossier Tracker</h2>
                    </div>
                    <p className="dash-text-secondary text-sm ml-12">NAFDAC Common Technical Document preparation & submission pipeline</p>
                </div>
                <button onClick={() => setShowNewModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 transition">
                    <Plus className="w-4 h-4" />New Dossier
                </button>
            </div>

            {/* Urgent deadline banner */}
            {stats.urgent > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--color-warning-soft)] border border-[var(--color-warning)]/30">
                    <AlertTriangle className="w-4 h-4 text-[var(--color-warning)] shrink-0" />
                    <p className="text-sm font-medium text-[var(--color-warning)]">
                        {stats.urgent} dossier{stats.urgent > 1 ? 's' : ''} with submission deadline under 30 days
                    </p>
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                    { label: 'Total Dossiers',   value: stats.total,       color: 'dash-text' },
                    { label: 'In Preparation',   value: stats.preparation, color: 'dash-text' },
                    { label: 'In Review / Filed', value: stats.inFlight,   color: 'text-[var(--color-info)]' },
                    { label: 'Approved',         value: stats.approved,    color: 'text-[var(--color-success)]' },
                    { label: 'Deadline < 30d',   value: stats.urgent,      color: 'text-[var(--color-warning)]' },
                ].map(s => (
                    <div key={s.label} className="dash-card rounded-xl p-4 border border-[var(--color-border)]">
                        <p className="text-[11px] dash-text-tertiary">{s.label}</p>
                        <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 flex-wrap">
                {([
                    ['dossiers', 'Dossiers', BookOpen],
                    ['tracker', 'Module Tracker', Layers],
                    ['calendar', 'Submission Calendar', Calendar],
                ] as const).map(([key, label, Icon]) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition ${tab === key ? 'bg-[var(--color-accent)] text-white' : 'dash-card border border-[var(--color-border)] dash-text-secondary hover:dash-text'}`}>
                        <Icon className="w-3.5 h-3.5" />{label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin dash-accent" /></div>
            ) : (
                <>
                    {/* ── Dossiers Tab ───────────────────────────────────────────────────── */}
                    {tab === 'dossiers' && (
                        <div className="dash-card rounded-2xl border border-[var(--color-border)] overflow-hidden">
                            {dossiers.length === 0 ? (
                                <div className="text-center py-20 px-4">
                                    <FileStack className="w-10 h-10 dash-text-tertiary mx-auto mb-3" />
                                    <p className="font-semibold dash-text mb-1">No dossiers yet</p>
                                    <p className="text-sm dash-text-secondary mb-4">Start by creating a CTD dossier for each product registration application.</p>
                                    <button onClick={() => setShowNewModal(true)} className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--color-accent)] text-white hover:opacity-90 transition">
                                        Create First Dossier
                                    </button>
                                </div>
                            ) : (
                                <div className="divide-y divide-[var(--color-border)]">
                                    {dossiers.map(dossier => {
                                        const days = getDaysUntilSubmission(dossier.target_submission_date);
                                        const urgency = getSubmissionUrgency(days);
                                        const urgencyColors = {
                                            overdue: 'text-[var(--color-danger)]',
                                            urgent:  'text-[var(--color-warning)]',
                                            warning: 'text-[var(--color-info)]',
                                            safe:    'dash-text-tertiary',
                                        };
                                        return (
                                            <div key={dossier.id} className="px-5 py-4 flex items-center gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                                        <p className="font-semibold dash-text text-sm">{dossier.product_name}</p>
                                                        {dossier.strength && <span className="text-xs dash-text-tertiary">· {dossier.strength}</span>}
                                                        {dossier.dossier_reference && (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--color-surface-alt)] dash-text-tertiary">{dossier.dossier_reference}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs dash-text-tertiary flex-wrap">
                                                        <span>{dossier.dosage_form}</span>
                                                        {dossier.active_ingredient && <span>· {dossier.active_ingredient}</span>}
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${DOSSIER_STATUS_COLORS[dossier.status]}`}>
                                                            {DOSSIER_STATUS_LABELS[dossier.status]}
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded-full bg-[var(--color-surface-alt)] text-[10px] font-medium dash-text-secondary">
                                                            {APPLICATION_TYPE_LABELS[dossier.application_type]}
                                                        </span>
                                                        {days !== null && (
                                                            <span className={`font-medium ${urgencyColors[urgency]}`}>
                                                                {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d to submission`}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                                                    {/* NAPAMS submission status / create button */}
                                                    {(() => {
                                                        const subs = linkedSubmissions[dossier.id] ?? [];
                                                        const latest = subs[0];
                                                        const canCreate = ['screening_cleared', 'under_review', 'approved'].includes(dossier.status);
                                                        if (latest) {
                                                            const colorClass = SUB_STATUS_COLORS[latest.current_status] ?? 'text-gray-600 bg-gray-100';
                                                            return (
                                                                <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${colorClass}`}>
                                                                    NAPAMS: {SUB_STATUS_LABELS[latest.current_status]}
                                                                </span>
                                                            );
                                                        }
                                                        if (canCreate) {
                                                            return (
                                                                <button onClick={() => setNapamsModalDossier(dossier)}
                                                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition">
                                                                    <Plus className="w-3 h-3" />NAPAMS Application
                                                                </button>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                    <button
                                                        onClick={() => { setSelectedDossierId(dossier.id); setTab('tracker'); }}
                                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-border)] dash-text-secondary hover:dash-text transition">
                                                        <BarChart3 className="w-3.5 h-3.5" />Tracker
                                                    </button>
                                                    <button onClick={() => openStatusModal(dossier)}
                                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-border)] dash-text-secondary hover:dash-text transition">
                                                        <ChevronDown className="w-3.5 h-3.5" />Status
                                                    </button>
                                                    <button onClick={() => handleDelete(dossier)}
                                                        className="p-1.5 rounded-lg hover:bg-[var(--color-danger-soft)] text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Module Tracker Tab ──────────────────────────────────────────────── */}
                    {tab === 'tracker' && (
                        <div className="space-y-4">
                            {/* Dossier selector */}
                            <div className="flex items-center gap-3 flex-wrap">
                                <label className="text-xs font-semibold dash-text-secondary">Dossier:</label>
                                <select
                                    value={selectedDossierId ?? ''}
                                    onChange={e => setSelectedDossierId(e.target.value || null)}
                                    className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text min-w-[260px]">
                                    <option value="">— select a dossier —</option>
                                    {dossiers.map(d => (
                                        <option key={d.id} value={d.id}>{d.product_name} — {APPLICATION_TYPE_LABELS[d.application_type]}</option>
                                    ))}
                                </select>
                            </div>

                            {!selectedDossierId ? (
                                <div className="dash-card rounded-2xl border border-[var(--color-border)] text-center py-16">
                                    <Layers className="w-10 h-10 dash-text-tertiary mx-auto mb-3" />
                                    <p className="dash-text-secondary text-sm">Select a dossier above to track its CTD module completion.</p>
                                </div>
                            ) : trackerLoading ? (
                                <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin dash-accent" /></div>
                            ) : (
                                <>
                                    {/* Readiness overview */}
                                    <div className="dash-card rounded-2xl border border-[var(--color-border)] p-5 flex items-center gap-5">
                                        <ReadinessRing score={readinessScore} />
                                        <div>
                                            <p className="font-bold dash-text text-base">{selectedDossier?.product_name}</p>
                                            <p className="text-xs dash-text-tertiary mt-0.5">{selectedDossier?.dosage_form} · {APPLICATION_TYPE_LABELS[selectedDossier?.application_type ?? 'new_registration']}</p>
                                            <p className="text-sm dash-text-secondary mt-1">
                                                Overall readiness: <span className="font-bold">{readinessScore}%</span>
                                                {selectedDossier?.target_submission_date && (
                                                    <span className="ml-3 dash-text-tertiary">Target: {new Date(selectedDossier.target_submission_date).toLocaleDateString()}</span>
                                                )}
                                            </p>
                                        </div>
                                        <div className="ml-auto">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${DOSSIER_STATUS_COLORS[selectedDossier?.status ?? 'preparation']}`}>
                                                {DOSSIER_STATUS_LABELS[selectedDossier?.status ?? 'preparation']}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Module accordion */}
                                    <div className="space-y-2">
                                        {modules.map(mod => {
                                            const isNA = mod.status === 'not_applicable';
                                            const moduleDocs = documents.filter(d => d.module_number === mod.module_number);
                                            const isExpanded = expandedModule === mod.module_number;

                                            return (
                                                <div key={mod.id} className="dash-card rounded-xl border border-[var(--color-border)] overflow-hidden">
                                                    {/* Module header */}
                                                    <div
                                                        className={`px-5 py-4 flex items-center gap-4 ${!isNA ? 'cursor-pointer hover:bg-[var(--color-surface-alt)]/50' : ''} transition`}
                                                        onClick={() => !isNA && setExpandedModule(isExpanded ? null : mod.module_number)}>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-semibold dash-text text-sm">{MODULE_NAMES[mod.module_number]}</span>
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${MODULE_STATUS_COLORS[mod.status]}`}>
                                                                    {mod.status.replace(/_/g, ' ')}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs dash-text-tertiary mt-0.5">{MODULE_DESCRIPTIONS[mod.module_number]}</p>
                                                        </div>
                                                        {!isNA && (
                                                            <div className="flex items-center gap-3 shrink-0">
                                                                {/* Inline progress bar */}
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-24 h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
                                                                        <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${mod.completion_pct}%` }} />
                                                                    </div>
                                                                    <span className="text-xs dash-text-secondary font-medium">{mod.completion_pct}%</span>
                                                                </div>
                                                                {/* Module-level status override */}
                                                                <select
                                                                    value={mod.status}
                                                                    onChange={e => handleModuleUpdate(mod, e.target.value as ModuleStatus, mod.completion_pct)}
                                                                    onClick={e => e.stopPropagation()}
                                                                    className="border border-[var(--color-border)] rounded-lg px-2 py-1 text-xs dash-surface dash-text">
                                                                    <option value="not_started">Not Started</option>
                                                                    <option value="in_progress">In Progress</option>
                                                                    <option value="complete">Complete</option>
                                                                    <option value="not_applicable">N/A</option>
                                                                </select>
                                                                {isExpanded ? <ChevronDown className="w-4 h-4 dash-text-tertiary" /> : <ChevronRight className="w-4 h-4 dash-text-tertiary" />}
                                                            </div>
                                                        )}
                                                        {isNA && <span className="text-xs dash-text-tertiary italic">Not required for this application type</span>}
                                                    </div>

                                                    {/* Document checklist */}
                                                    {isExpanded && !isNA && (
                                                        <div className="border-t border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                                                            {moduleDocs.map(doc => (
                                                                <div key={doc.id} className="px-5 py-3 flex items-center gap-3">
                                                                    <div className="shrink-0">{DOC_STATUS_ICONS[doc.status]}</div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <span className="text-sm dash-text">{doc.document_name}</span>
                                                                        {doc.is_required && <span className="ml-2 text-[10px] text-[var(--color-danger)] font-semibold">REQUIRED</span>}
                                                                    </div>
                                                                    <select
                                                                        value={doc.status}
                                                                        onChange={e => handleDocStatus(doc, e.target.value as DocumentStatus)}
                                                                        className="border border-[var(--color-border)] rounded-lg px-2 py-1 text-xs dash-surface dash-text shrink-0">
                                                                        <option value="missing">Missing</option>
                                                                        <option value="draft">Draft</option>
                                                                        <option value="complete">Complete</option>
                                                                        <option value="not_applicable">N/A</option>
                                                                    </select>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── Calendar Tab ────────────────────────────────────────────────────── */}
                    {tab === 'calendar' && (
                        <div className="dash-card rounded-2xl border border-[var(--color-border)] overflow-hidden">
                            <div className="px-5 py-3 border-b border-[var(--color-border)]">
                                <h3 className="font-semibold dash-text flex items-center gap-2">
                                    <Calendar className="w-4 h-4 dash-accent" />Submission Timeline
                                </h3>
                            </div>
                            {calendarItems.length === 0 ? (
                                <div className="text-center py-16">
                                    <Calendar className="w-8 h-8 dash-text-tertiary mx-auto mb-2" />
                                    <p className="text-sm dash-text-secondary">No submission dates recorded yet.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-[var(--color-border)]">
                                    {calendarItems.map((item, idx) => {
                                        const d = new Date(item.date);
                                        const isPast = d < new Date();
                                        const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
                                        return (
                                            <div key={idx} className={`px-5 py-4 flex items-center gap-4 ${isPast ? 'opacity-60' : ''}`}>
                                                <div className="w-14 shrink-0 text-center">
                                                    <p className="text-lg font-bold dash-text">{d.getDate()}</p>
                                                    <p className="text-[10px] dash-text-tertiary uppercase">{d.toLocaleString('default', { month: 'short' })} {d.getFullYear()}</p>
                                                </div>
                                                <div className="w-px h-10 bg-[var(--color-border)] shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold dash-text text-sm">{item.dossier.product_name}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--color-accent-soft)] dash-accent">{item.label}</span>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${DOSSIER_STATUS_COLORS[item.dossier.status]}`}>{DOSSIER_STATUS_LABELS[item.dossier.status]}</span>
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    {isPast ? (
                                                        <span className="text-xs dash-text-tertiary">Passed</span>
                                                    ) : (
                                                        <span className={`text-sm font-bold ${days < 30 ? 'text-[var(--color-warning)]' : 'dash-text-secondary'}`}>
                                                            {days}d
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ── New Dossier Modal ──────────────────────────────────────────────── */}
            {showNewModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="dash-card rounded-2xl max-w-xl w-full overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
                            <h3 className="font-bold dash-text">New CTD Dossier</h3>
                            <button onClick={() => setShowNewModal(false)} className="p-1 hover:bg-[var(--color-surface-alt)] rounded-lg"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="text-xs font-semibold dash-text-secondary block mb-1">Product Name *</label>
                                    <input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                                        placeholder="e.g. Amoxicillin 500mg Capsules" className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold dash-text-secondary block mb-1">Active Ingredient</label>
                                    <input value={form.active_ingredient} onChange={e => setForm(f => ({ ...f, active_ingredient: e.target.value }))}
                                        placeholder="INN name" className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold dash-text-secondary block mb-1">Strength</label>
                                    <input value={form.strength} onChange={e => setForm(f => ({ ...f, strength: e.target.value }))}
                                        placeholder="e.g. 500mg" className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold dash-text-secondary block mb-1">Dosage Form *</label>
                                    <select value={form.dosage_form} onChange={e => setForm(f => ({ ...f, dosage_form: e.target.value }))}
                                        className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text">
                                        {DOSAGE_FORMS.map(df => <option key={df} value={df}>{df}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold dash-text-secondary block mb-1">Application Type *</label>
                                    <select value={form.application_type} onChange={e => setForm(f => ({ ...f, application_type: e.target.value as ApplicationType }))}
                                        className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text">
                                        {Object.entries(APPLICATION_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold dash-text-secondary block mb-1">NAFDAC Reg. No. (renewals)</label>
                                    <input value={form.nafdac_number} onChange={e => setForm(f => ({ ...f, nafdac_number: e.target.value }))}
                                        placeholder="e.g. A1-0000L" className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold dash-text-secondary block mb-1">Target Submission Date</label>
                                    <input type="date" value={form.target_submission_date} onChange={e => setForm(f => ({ ...f, target_submission_date: e.target.value }))}
                                        className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold dash-text-secondary block mb-1">Internal Reference</label>
                                    <input value={form.dossier_reference} onChange={e => setForm(f => ({ ...f, dossier_reference: e.target.value }))}
                                        placeholder="e.g. DOS-2026-001" className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text" />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-xs font-semibold dash-text-secondary block mb-1">Notes</label>
                                    <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                                        className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text resize-none" />
                                </div>
                            </div>
                            <div className="text-xs dash-text-tertiary bg-[var(--color-info-soft)] rounded-lg px-3 py-2">
                                Module checklist will be auto-seeded based on application type (e.g. Module 4 is marked N/A for generics and renewals).
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-[var(--color-border)] shrink-0">
                            <button onClick={handleCreate} disabled={saving || !form.product_name.trim()}
                                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50 transition">
                                {saving ? 'Creating…' : 'Create Dossier & Seed Checklist'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── NAPAMS Application Modal (linked from dossier) ─────────────────── */}
            {napamsModalDossier && companyId && user && (
                <NewSubmissionModal
                    companyId={companyId}
                    userId={user.id}
                    onClose={() => setNapamsModalDossier(null)}
                    onCreated={() => { setNapamsModalDossier(null); load(); }}
                    dossiers={dossiers}
                    preselectedDossierId={napamsModalDossier.id}
                />
            )}

            {/* ── Status Update Modal ────────────────────────────────────────────── */}
            {statusModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="dash-card rounded-2xl max-w-md w-full overflow-hidden">
                        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
                            <h3 className="font-bold dash-text">Update Dossier Status</h3>
                            <button onClick={() => setStatusModal(null)} className="p-1 hover:bg-[var(--color-surface-alt)] rounded-lg"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm font-semibold dash-text">{statusModal.product_name}</p>
                            <div>
                                <label className="text-xs font-semibold dash-text-secondary block mb-1">New Status</label>
                                <div className="space-y-2">
                                    {STATUS_FLOW.map(s => (
                                        <label key={s} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${newStatus === s ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]' : 'border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]'}`}>
                                            <input type="radio" name="status" value={s} checked={newStatus === s} onChange={() => setNewStatus(s)} className="accent-[var(--color-accent)]" />
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${DOSSIER_STATUS_COLORS[s]}`}>{DOSSIER_STATUS_LABELS[s]}</span>
                                        </label>
                                    ))}
                                    {(['rejected', 'withdrawn'] as DossierStatus[]).map(s => (
                                        <label key={s} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${newStatus === s ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]' : 'border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]'}`}>
                                            <input type="radio" name="status" value={s} checked={newStatus === s} onChange={() => setNewStatus(s)} className="accent-[var(--color-accent)]" />
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${DOSSIER_STATUS_COLORS[s]}`}>{DOSSIER_STATUS_LABELS[s]}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold dash-text-secondary block mb-1">Date (optional, defaults to today)</label>
                                <input type="date" value={statusDate} onChange={e => setStatusDate(e.target.value)}
                                    className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text" />
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-[var(--color-border)] flex gap-3">
                            <button onClick={() => setStatusModal(null)} className="flex-1 py-2 rounded-lg text-sm border border-[var(--color-border)] dash-text-secondary hover:dash-text transition">Cancel</button>
                            <button onClick={handleStatusUpdate} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 transition">Update Status</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
