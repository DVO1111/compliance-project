import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    getVendors,
    getVendorRiskProfile,
    upsertVendorRiskProfile,
    getVendorDocuments,
    linkVendorDocument,
    unlinkVendorDocument,
    getVendorQuestionnaires,
    createQuestionnaire,
    updateQuestionnaireStatus,
    type Vendor,
    type VendorRiskProfile,
    type VendorDocument,
    type VendorQuestionnaire,
    type VendorRiskLevel,
    type DataAccessLevel,
    type SecurityReviewStatus,
    type VendorDocumentType,
    type QuestionnaireType,
    type QuestionnaireStatus,
    RISK_LEVELS,
    SECURITY_REVIEW_STATUSES,
    DOC_TYPES,
    QUESTIONNAIRE_TYPES,
} from '../../lib/vendorService';
import { supabase } from '../../lib/supabase';
import {
    ArrowLeft,
    Building2,
    Shield,
    FileText,
    ClipboardList,
    ExternalLink,
    Calendar,
    Plus,
    X,
    Search,
    Check,
    Link2,
    Trash2,
    User,
    Globe,
    Activity,
    Save,
} from 'lucide-react';

type Tab = 'overview' | 'risk' | 'documents' | 'questionnaires';

interface Props {
    vendorId: string | null;
    onBack: () => void;
}

export default function VendorDetailPage({ vendorId, onBack }: Props) {
    const { profile } = useAuth();
    const companyId = (profile as any)?.company_id;
    const userId = profile?.id ?? '';

    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [riskProfile, setRiskProfile] = useState<VendorRiskProfile | null>(null);
    const [documents, setDocuments] = useState<VendorDocument[]>([]);
    const [questionnaires, setQuestionnaires] = useState<VendorQuestionnaire[]>([]);
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [loading, setLoading] = useState(true);

    // Risk profile form
    const [rpScore, setRpScore] = useState(0);
    const [rpTier, setRpTier] = useState<VendorRiskLevel>('medium');
    const [rpAccess, setRpAccess] = useState<DataAccessLevel>('none');
    const [rpReviewStatus, setRpReviewStatus] = useState<SecurityReviewStatus>('pending');
    const [rpLastReview, setRpLastReview] = useState('');
    const [rpNextReview, setRpNextReview] = useState('');
    const [rpSaving, setRpSaving] = useState(false);

    // Doc picker
    const [showDocPicker, setShowDocPicker] = useState(false);
    const [docType, setDocType] = useState<VendorDocumentType>('other');
    const [archiveItems, setArchiveItems] = useState<any[]>([]);
    const [archiveSearch, setArchiveSearch] = useState('');
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [linkingSaving, setLinkingSaving] = useState(false);

    // Questionnaire form
    const [showQForm, setShowQForm] = useState(false);
    const [qType, setQType] = useState<QuestionnaireType>('security');

    const load = useCallback(async () => {
        if (!companyId || !vendorId) return;
        setLoading(true);
        const vendors = await getVendors(companyId);
        const v = vendors.find(x => x.id === vendorId) ?? null;
        setVendor(v);

        if (v) {
            const [rp, docs, qs] = await Promise.all([
                getVendorRiskProfile(v.id),
                getVendorDocuments(v.id),
                getVendorQuestionnaires(v.id),
            ]);
            setRiskProfile(rp);
            setDocuments(docs);
            setQuestionnaires(qs);

            // Populate risk form
            if (rp) {
                setRpScore(rp.risk_score);
                setRpTier(rp.risk_tier);
                setRpAccess(rp.data_access_level);
                setRpReviewStatus(rp.security_review_status);
                setRpLastReview(rp.last_review_date ? rp.last_review_date.split('T')[0] : '');
                setRpNextReview(rp.next_review_date ? rp.next_review_date.split('T')[0] : '');
            }
        }
        setLoading(false);
    }, [companyId, vendorId]);

    useEffect(() => { load(); }, [load]);

    // ─── Risk Profile Save ──────────────────────────────────────────────
    const saveRiskProfile = async () => {
        if (!vendorId) return;
        setRpSaving(true);
        await upsertVendorRiskProfile(vendorId, {
            risk_score: rpScore,
            risk_tier: rpTier,
            data_access_level: rpAccess,
            security_review_status: rpReviewStatus,
            last_review_date: rpLastReview || null,
            next_review_date: rpNextReview || null,
        });
        await load();
        setRpSaving(false);
    };

    // ─── Document Linking ───────────────────────────────────────────────
    const openDocPicker = async () => {
        setShowDocPicker(true);
        setSelectedDocId(null);
        setArchiveSearch('');
        if (!companyId) return;
        const { data } = await (supabase as any)
            .from('content_submissions')
            .select('id, title, platform, status, created_at')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false })
            .limit(200);
        setArchiveItems(data ?? []);
    };

    const handleLinkDoc = async () => {
        if (!vendorId || !selectedDocId) return;
        setLinkingSaving(true);
        await linkVendorDocument(companyId, vendorId, selectedDocId, docType, userId);
        setShowDocPicker(false);
        await load();
        setLinkingSaving(false);
    };

    const handleUnlinkDoc = async (docId: string) => {
        await unlinkVendorDocument(docId);
        await load();
    };

    // ─── Questionnaires ─────────────────────────────────────────────────
    const handleSendQ = async () => {
        if (!vendorId) return;
        await createQuestionnaire(vendorId, qType);
        setShowQForm(false);
        await load();
    };

    const handleQStatusChange = async (id: string, status: QuestionnaireStatus) => {
        await updateQuestionnaireStatus(id, status);
        await load();
    };

    // ─── Helpers ────────────────────────────────────────────────────────
    const riskColor = (level: VendorRiskLevel) =>
        RISK_LEVELS.find(r => r.id === level)?.color ?? '#888';

    const reviewBadge = (status: string) => {
        const colors: Record<string, string> = {
            pending: 'rgba(245,158,11,0.15)', in_progress: 'rgba(59,130,246,0.15)',
            completed: 'rgba(34,197,94,0.15)', overdue: 'rgba(239,68,68,0.15)',
        };
        const textColors: Record<string, string> = {
            pending: '#f59e0b', in_progress: '#3b82f6', completed: '#22c55e', overdue: '#ef4444',
        };
        return (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold capitalize"
                style={{ background: colors[status] || colors.pending, color: textColors[status] || textColors.pending }}>
                {status.replace(/_/g, ' ')}
            </span>
        );
    };

    const tabs: { id: Tab; label: string; icon: typeof Building2 }[] = [
        { id: 'overview', label: 'Overview', icon: Building2 },
        { id: 'risk', label: 'Risk Profile', icon: Shield },
        { id: 'documents', label: 'Security Documents', icon: FileText },
        { id: 'questionnaires', label: 'Questionnaires', icon: ClipboardList },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: 'var(--color-accent)' }} />
            </div>
        );
    }

    if (!vendor) {
        return (
            <div className="space-y-4">
                <button onClick={onBack} className="flex items-center gap-2 text-sm dash-text-secondary hover:dash-text transition-colors">
                    <ArrowLeft size={16} /> Back to Vendors
                </button>
                <p className="dash-text-tertiary">Vendor not found.</p>
            </div>
        );
    }

    const existingDocIds = documents.map(d => d.submission_id);
    const filteredArchive = archiveItems.filter((item: any) =>
        !existingDocIds.includes(item.id) &&
        (archiveSearch === '' || item.title?.toLowerCase().includes(archiveSearch.toLowerCase()))
    );

    return (
        <div className="space-y-6 animate-in fade-in">
            {/* Back + Header */}
            <button onClick={onBack} className="flex items-center gap-2 text-sm dash-text-secondary hover:dash-text transition-colors">
                <ArrowLeft size={16} /> Back to Vendors
            </button>

            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white text-lg shadow-md"
                    style={{ background: riskColor(vendor.risk_level) }}>
                    {vendor.name.charAt(0).toUpperCase()}
                </div>
                <div>
                    <h1 className="text-2xl font-bold dash-text">{vendor.name}</h1>
                    <div className="flex items-center gap-3 mt-1">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize bg-[var(--color-surface-alt)] dash-text">{vendor.category}</span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold capitalize" style={{ background: `${riskColor(vendor.risk_level)}20`, color: riskColor(vendor.risk_level) }}>
                            <Shield size={10} className="inline mr-1" style={{ verticalAlign: '-1px' }} />
                            {vendor.risk_level}
                        </span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-[var(--color-surface-alt)] p-1 rounded-xl w-fit">
                {tabs.map(t => {
                    const Icon = t.icon;
                    return (
                        <button key={t.id} onClick={() => setActiveTab(t.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === t.id ? 'bg-[var(--color-surface)] shadow-sm dash-text' : 'dash-text-tertiary hover:dash-text-secondary'}`}>
                            <Icon size={15} />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {/* ─── Tab: Overview ────────────────────────────────────────────── */}
            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="dash-card border dash-border rounded-2xl p-5 shadow-sm space-y-4">
                        <h3 className="text-sm font-bold dash-text uppercase tracking-wider">General Info</h3>
                        <div className="space-y-3">
                            <InfoRow icon={Building2} label="Name" value={vendor.name} />
                            <InfoRow icon={Activity} label="Category" value={vendor.category} />
                            <InfoRow icon={Shield} label="Risk Level" value={vendor.risk_level} />
                            <InfoRow icon={Activity} label="Status" value={vendor.status} />
                        </div>
                    </div>
                    <div className="dash-card border dash-border rounded-2xl p-5 shadow-sm space-y-4">
                        <h3 className="text-sm font-bold dash-text uppercase tracking-wider">Contact & Details</h3>
                        <div className="space-y-3">
                            <InfoRow icon={Globe} label="Website" value={vendor.website || '—'} />
                            <InfoRow icon={User} label="Primary Contact" value={vendor.primary_contact || '—'} />
                            <InfoRow icon={Calendar} label="Created" value={new Date(vendor.created_at).toLocaleDateString()} />
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Tab: Risk Profile ────────────────────────────────────────── */}
            {activeTab === 'risk' && (
                <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm space-y-5">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold dash-text uppercase tracking-wider">Risk Profile</h3>
                        <button onClick={saveRiskProfile} disabled={rpSaving}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50 transition-all"
                            style={{ background: 'var(--color-accent)' }}>
                            <Save size={14} />
                            {rpSaving ? 'Saving…' : 'Save'}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Risk Score (0–100)</label>
                            <input type="number" min={0} max={100} value={rpScore} onChange={e => setRpScore(+e.target.value)}
                                className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none focus:ring-1"
                                style={{ '--tw-ring-color': 'var(--color-accent)' } as any} />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Risk Tier</label>
                            <select value={rpTier} onChange={e => setRpTier(e.target.value as VendorRiskLevel)}
                                className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none">
                                {RISK_LEVELS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Data Access Level</label>
                            <select value={rpAccess} onChange={e => setRpAccess(e.target.value as DataAccessLevel)}
                                className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none">
                                <option value="none">None</option>
                                <option value="limited">Limited</option>
                                <option value="moderate">Moderate</option>
                                <option value="full">Full</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Security Review Status</label>
                            <select value={rpReviewStatus} onChange={e => setRpReviewStatus(e.target.value as SecurityReviewStatus)}
                                className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none">
                                {SECURITY_REVIEW_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Last Review Date</label>
                            <input type="date" value={rpLastReview} onChange={e => setRpLastReview(e.target.value)}
                                className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none focus:ring-1"
                                style={{ '--tw-ring-color': 'var(--color-accent)' } as any} />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Next Review Date</label>
                            <input type="date" value={rpNextReview} onChange={e => setRpNextReview(e.target.value)}
                                className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none focus:ring-1"
                                style={{ '--tw-ring-color': 'var(--color-accent)' } as any} />
                        </div>
                    </div>

                    {/* Current status display */}
                    {riskProfile && (
                        <div className="flex items-center gap-4 pt-3 border-t dash-border">
                            <span className="text-xs dash-text-tertiary">Current:</span>
                            {reviewBadge(riskProfile.security_review_status)}
                            <span className="text-xs dash-text-secondary">Score: <strong>{riskProfile.risk_score}</strong></span>
                            <span className="text-xs dash-text-secondary">Tier: <strong className="capitalize">{riskProfile.risk_tier}</strong></span>
                        </div>
                    )}
                </div>
            )}

            {/* ─── Tab: Security Documents ──────────────────────────────────── */}
            {activeTab === 'documents' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold dash-text uppercase tracking-wider">Security Documents</h3>
                        <button onClick={openDocPicker}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-md transition-all"
                            style={{ background: 'var(--color-accent)' }}>
                            <Link2 size={14} />
                            Link Document
                        </button>
                    </div>

                    <div className="dash-card border dash-border rounded-2xl shadow-sm overflow-hidden">
                        {documents.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                                <FileText size={36} className="dash-text-tertiary" />
                                <p className="dash-text-tertiary text-sm">No documents linked yet</p>
                                <p className="text-xs dash-text-tertiary">Link security documents from the Archive</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b dash-border">
                                        <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider dash-text-tertiary">Document</th>
                                        <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider dash-text-tertiary">Type</th>
                                        <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider dash-text-tertiary">Linked On</th>
                                        <th className="w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {documents.map(d => (
                                        <tr key={d.id} className="border-b dash-border hover:bg-[var(--color-surface-alt)] transition-colors">
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-2">
                                                    <FileText size={14} className="dash-accent" />
                                                    <span className="text-sm font-medium dash-text">{d.submission?.title || 'Unknown'}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--color-surface-alt)] dash-text uppercase">
                                                    {DOC_TYPES.find(t => t.id === d.document_type)?.label || d.document_type}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-xs dash-text-secondary">
                                                {new Date(d.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-5 py-3">
                                                <button onClick={() => handleUnlinkDoc(d.id)}
                                                    className="p-1.5 rounded-lg hover:bg-[var(--color-danger-soft)] text-[var(--color-danger)] transition-colors" title="Remove">
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* ─── Tab: Questionnaires ──────────────────────────────────────── */}
            {activeTab === 'questionnaires' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold dash-text uppercase tracking-wider">Questionnaires</h3>
                        <button onClick={() => setShowQForm(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-md transition-all"
                            style={{ background: 'var(--color-accent)' }}>
                            <Plus size={14} />
                            Send Questionnaire
                        </button>
                    </div>

                    <div className="space-y-3">
                        {questionnaires.length === 0 ? (
                            <div className="dash-card border dash-border rounded-2xl p-12 flex flex-col items-center justify-center gap-3 shadow-sm">
                                <ClipboardList size={36} className="dash-text-tertiary" />
                                <p className="dash-text-tertiary text-sm">No questionnaires sent yet</p>
                            </div>
                        ) : questionnaires.map(q => (
                            <div key={q.id} className="dash-card border dash-border rounded-2xl p-4 shadow-sm flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-alt)] flex items-center justify-center">
                                        <ClipboardList size={18} className="dash-accent" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold dash-text capitalize">
                                            {QUESTIONNAIRE_TYPES.find(t => t.id === q.questionnaire_type)?.label || q.questionnaire_type}
                                        </p>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            {q.sent_at && <span className="text-xs dash-text-tertiary">Sent: {new Date(q.sent_at).toLocaleDateString()}</span>}
                                            {q.completed_at && <span className="text-xs dash-text-tertiary">Completed: {new Date(q.completed_at).toLocaleDateString()}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {reviewBadge(q.status)}
                                    {q.status !== 'completed' && (
                                        <select value={q.status} onChange={e => handleQStatusChange(q.id, e.target.value as QuestionnaireStatus)}
                                            className="bg-[var(--color-surface-alt)] border dash-border rounded-lg px-2 py-1 text-xs dash-text focus:outline-none">
                                            <option value="draft">Draft</option>
                                            <option value="sent">Sent</option>
                                            <option value="in_progress">In Progress</option>
                                            <option value="completed">Completed</option>
                                            <option value="overdue">Overdue</option>
                                        </select>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ─── Document Picker Modal ─────────────────────────────────────── */}
            {showDocPicker && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-[var(--color-surface)] border dash-border rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-5 animate-in zoom-in-95 max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold dash-text flex items-center gap-2">
                                <Link2 size={18} className="dash-accent" />
                                Link Document from Archive
                            </h2>
                            <button onClick={() => setShowDocPicker(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] transition-colors">
                                <X size={18} className="dash-text-tertiary" />
                            </button>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Document Type</label>
                            <select value={docType} onChange={e => setDocType(e.target.value as VendorDocumentType)}
                                className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none">
                                {DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                        </div>

                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
                            <input type="text" value={archiveSearch} onChange={e => setArchiveSearch(e.target.value)}
                                placeholder="Search archive documents..."
                                className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl pl-10 pr-4 py-2 text-sm dash-text placeholder:dash-text-tertiary focus:outline-none focus:ring-1"
                                style={{ '--tw-ring-color': 'var(--color-accent)' } as any} />
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                            {filteredArchive.length === 0 ? (
                                <p className="text-center text-sm dash-text-tertiary py-8">
                                    {archiveItems.length === 0 ? 'No archive documents found' : 'No matching documents'}
                                </p>
                            ) : filteredArchive.slice(0, 50).map((item: any) => (
                                <button key={item.id} onClick={() => setSelectedDocId(selectedDocId === item.id ? null : item.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${selectedDocId === item.id ? 'bg-[var(--color-accent)]/10 ring-1' : 'hover:bg-[var(--color-surface-alt)]'}`}
                                    style={selectedDocId === item.id ? { '--tw-ring-color': 'var(--color-accent)' } as any : undefined}>
                                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${selectedDocId === item.id ? 'border-[var(--color-accent)] bg-[var(--color-accent)]' : 'dash-border'}`}>
                                        {selectedDocId === item.id && <Check size={12} className="text-white" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium dash-text truncate">{item.title}</p>
                                        <p className="text-xs dash-text-tertiary">{item.platform} · {new Date(item.created_at).toLocaleDateString()}</p>
                                    </div>
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2 border-t dash-border">
                            <button onClick={() => setShowDocPicker(false)} className="px-4 py-2 rounded-xl text-sm font-medium dash-text-secondary hover:bg-[var(--color-surface-alt)] transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleLinkDoc} disabled={!selectedDocId || linkingSaving}
                                className="px-5 py-2 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50 transition-all"
                                style={{ background: 'var(--color-accent)' }}>
                                {linkingSaving ? 'Linking…' : 'Link Document'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Questionnaire Form Modal ──────────────────────────────────── */}
            {showQForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-[var(--color-surface)] border dash-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 animate-in zoom-in-95">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold dash-text">Send Questionnaire</h2>
                            <button onClick={() => setShowQForm(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] transition-colors">
                                <X size={18} className="dash-text-tertiary" />
                            </button>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Questionnaire Type</label>
                            <select value={qType} onChange={e => setQType(e.target.value as QuestionnaireType)}
                                className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none">
                                {QUESTIONNAIRE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button onClick={() => setShowQForm(false)} className="px-4 py-2 rounded-xl text-sm font-medium dash-text-secondary hover:bg-[var(--color-surface-alt)] transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSendQ}
                                className="px-5 py-2 rounded-xl text-sm font-semibold text-white shadow-md transition-all"
                                style={{ background: 'var(--color-accent)' }}>
                                Send Questionnaire
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Helper Component ─────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
    return (
        <div className="flex items-center gap-3">
            <Icon size={15} className="dash-text-tertiary flex-shrink-0" />
            <span className="text-xs font-medium dash-text-tertiary w-28">{label}</span>
            <span className="text-sm dash-text capitalize">{value}</span>
        </div>
    );
}
