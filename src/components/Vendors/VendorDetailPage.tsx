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
    getCarrierProfile,
    upsertCarrierProfile,
    getVendorContracts,
    addVendorContract,
    updateVendorContract,
    deleteVendorContract,
    type Vendor,
    type VendorRiskProfile,
    type VendorCarrierProfile,
    type VendorDocument,
    type VendorQuestionnaire,
    type VendorContract,
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
    CARRIER_SHIPPING_MODES,
    CARRIER_LAST_MILE_AREAS,
    CARRIER_ROUTE_KEYS,
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
    Truck,
    FileSignature,
    AlertTriangle,
} from 'lucide-react';

type Tab = 'overview' | 'risk' | 'documents' | 'questionnaires' | 'carrier' | 'contracts';

interface Props {
    vendorId: string | null;
    onBack: () => void;
}

export default function VendorDetailPage({ vendorId, onBack }: Props) {
    const { profile } = useAuth();
    const companyId = (profile as any)?.company_id;
    const userId = profile?.id ?? '';
    const industryType = (profile as any)?.industry_type as string | undefined;
    const isLogisticsProfile = industryType?.trim().toLowerCase() === 'logistics & courier';

    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [riskProfile, setRiskProfile] = useState<VendorRiskProfile | null>(null);
    const [carrierProfile, setCarrierProfile] = useState<VendorCarrierProfile | null>(null);
    const [documents, setDocuments] = useState<VendorDocument[]>([]);
    const [questionnaires, setQuestionnaires] = useState<VendorQuestionnaire[]>([]);
    const [contracts, setContracts] = useState<VendorContract[]>([]);
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [loading, setLoading] = useState(true);

    // Contract form
    const [showContractForm, setShowContractForm] = useState(false);
    const [editingContract, setEditingContract] = useState<VendorContract | null>(null);
    const [contractSaving, setContractSaving] = useState(false);
    const [cTitle, setCTitle] = useState('');
    const [cValue, setCValue] = useState('');
    const [cCurrency, setCCurrency] = useState('USD');
    const [cStart, setCStart] = useState('');
    const [cExpiry, setCExpiry] = useState('');
    const [cAutoRenewal, setCAutoRenewal] = useState(false);
    const [cNotice, setCNotice] = useState('');
    const [cSla, setCsla] = useState('');
    const [cBreachPenalty, setCBreachPenalty] = useState(false);
    const [cNotes, setCNotes] = useState('');

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

    // Carrier profile form
    const [cpShippingModes, setCpShippingModes] = useState<string[]>([]);
    const [cpRoutes, setCpRoutes] = useState<Record<string, boolean>>({});
    const [cpLastMile, setCpLastMile] = useState<string[]>([]);
    const [cpOtdRate, setCpOtdRate] = useState('');
    const [cpDamageRate, setCpDamageRate] = useState('');
    const [cpLicenceType, setCpLicenceType] = useState('');
    const [cpInsuranceGbp, setCpInsuranceGbp] = useState('');
    const [cpInsuranceExpiry, setCpInsuranceExpiry] = useState('');
    const [cpAntiB, setCpAntiB] = useState(false);
    const [cpDdCompleted, setCpDdCompleted] = useState(false);
    const [cpDdDate, setCpDdDate] = useState('');
    const [cpNotes, setCpNotes] = useState('');
    const [cpSaving, setCpSaving] = useState(false);

    const load = useCallback(async () => {
        if (!companyId || !vendorId) return;
        setLoading(true);
        const vendors = await getVendors(companyId);
        const v = vendors.find(x => x.id === vendorId) ?? null;
        setVendor(v);

        if (v) {
            const [rp, docs, qs, cp, cnts] = await Promise.all([
                getVendorRiskProfile(v.id),
                getVendorDocuments(v.id),
                getVendorQuestionnaires(v.id),
                isLogisticsProfile ? getCarrierProfile(v.id) : Promise.resolve(null),
                getVendorContracts(v.id),
            ]);
            setRiskProfile(rp);
            setDocuments(docs);
            setQuestionnaires(qs);
            setCarrierProfile(cp);
            setContracts(cnts);

            // Populate risk form
            if (rp) {
                setRpScore(rp.risk_score);
                setRpTier(rp.risk_tier);
                setRpAccess(rp.data_access_level);
                setRpReviewStatus(rp.security_review_status);
                setRpLastReview(rp.last_review_date ? rp.last_review_date.split('T')[0] : '');
                setRpNextReview(rp.next_review_date ? rp.next_review_date.split('T')[0] : '');
            }

            // Populate carrier form
            if (cp) {
                setCpShippingModes(cp.shipping_modes ?? []);
                setCpRoutes(cp.route_coverage ?? {});
                setCpLastMile(cp.last_mile_areas ?? []);
                setCpOtdRate(cp.on_time_delivery_rate != null ? String(cp.on_time_delivery_rate) : '');
                setCpDamageRate(cp.damage_rate != null ? String(cp.damage_rate) : '');
                setCpLicenceType(cp.carrier_licence_type ?? '');
                setCpInsuranceGbp(cp.insurance_coverage_gbp != null ? String(cp.insurance_coverage_gbp) : '');
                setCpInsuranceExpiry(cp.insurance_expiry ?? '');
                setCpAntiB(cp.anti_bribery_ack);
                setCpDdCompleted(cp.due_diligence_completed);
                setCpDdDate(cp.last_due_diligence_date ?? '');
                setCpNotes(cp.notes ?? '');
            }
        }
        setLoading(false);
    }, [companyId, vendorId, isLogisticsProfile]);

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
        }, companyId, userId);
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
        await unlinkVendorDocument(docId, companyId || '', userId);
        await load();
    };

    // ─── Questionnaires ─────────────────────────────────────────────────
    const handleSendQ = async () => {
        if (!vendorId || !companyId) return;
        await createQuestionnaire(vendorId, qType, companyId, userId);
        setShowQForm(false);
        await load();
    };

    const handleQStatusChange = async (id: string, status: QuestionnaireStatus) => {
        await updateQuestionnaireStatus(id, status, companyId || '', userId);
        await load();
    };

    const saveCarrierProfile = async () => {
        if (!vendorId) return;
        setCpSaving(true);
        await upsertCarrierProfile(vendorId, {
            shipping_modes: cpShippingModes,
            route_coverage: cpRoutes,
            last_mile_areas: cpLastMile,
            on_time_delivery_rate: cpOtdRate !== '' ? parseFloat(cpOtdRate) : null,
            damage_rate: cpDamageRate !== '' ? parseFloat(cpDamageRate) : null,
            carrier_licence_type: cpLicenceType || null,
            insurance_coverage_gbp: cpInsuranceGbp !== '' ? parseFloat(cpInsuranceGbp) : null,
            insurance_expiry: cpInsuranceExpiry || null,
            anti_bribery_ack: cpAntiB,
            due_diligence_completed: cpDdCompleted,
            last_due_diligence_date: cpDdDate || null,
            notes: cpNotes || null,
        });
        await load();
        setCpSaving(false);
    };

    const toggleMulti = (arr: string[], val: string, set: (v: string[]) => void) => {
        set(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
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

    const openContractForm = (contract?: VendorContract) => {
        if (contract) {
            setEditingContract(contract);
            setCTitle(contract.title);
            setCValue(contract.contract_value != null ? String(contract.contract_value) : '');
            setCCurrency(contract.currency);
            setCStart(contract.start_date ? contract.start_date.split('T')[0] : '');
            setCExpiry(contract.expiry_date ? contract.expiry_date.split('T')[0] : '');
            setCAutoRenewal(contract.auto_renewal);
            setCNotice(contract.notice_period_days != null ? String(contract.notice_period_days) : '');
            setCsla(contract.sla_uptime_pct != null ? String(contract.sla_uptime_pct) : '');
            setCBreachPenalty(contract.breach_penalty_clause);
            setCNotes(contract.notes ?? '');
        } else {
            setEditingContract(null);
            setCTitle(''); setCValue(''); setCCurrency('USD'); setCStart(''); setCExpiry('');
            setCAutoRenewal(false); setCNotice(''); setCsla(''); setCBreachPenalty(false); setCNotes('');
        }
        setShowContractForm(true);
    };

    const handleSaveContract = async () => {
        if (!vendorId || !companyId || !cTitle.trim()) return;
        setContractSaving(true);
        const payload = {
            title: cTitle.trim(),
            contract_value: cValue !== '' ? parseFloat(cValue) : null,
            currency: cCurrency,
            start_date: cStart || null,
            expiry_date: cExpiry || null,
            auto_renewal: cAutoRenewal,
            notice_period_days: cNotice !== '' ? parseInt(cNotice, 10) : null,
            sla_uptime_pct: cSla !== '' ? parseFloat(cSla) : null,
            breach_penalty_clause: cBreachPenalty,
            notes: cNotes || null,
        };
        if (editingContract) {
            await updateVendorContract(companyId, userId, editingContract.id, payload);
        } else {
            await addVendorContract(companyId, vendorId, userId, payload);
        }
        setShowContractForm(false);
        await load();
        setContractSaving(false);
    };

    const handleDeleteContract = async (contractId: string) => {
        if (!window.confirm('Delete this contract record?')) return;
        await deleteVendorContract(companyId, userId, contractId);
        await load();
    };

    const contractStatusColor = (status: string) => {
        const map: Record<string, string> = {
            active: '#22c55e', expiring_soon: '#f59e0b', expired: '#ef4444', terminated: '#6b7280'
        };
        return map[status] ?? '#888';
    };

    const tabs: { id: Tab; label: string; icon: typeof Building2 }[] = [
        { id: 'overview', label: 'Overview', icon: Building2 },
        { id: 'risk', label: 'Risk Profile', icon: Shield },
        ...(isLogisticsProfile ? [{ id: 'carrier' as Tab, label: 'Carrier Details', icon: Truck }] : []),
        { id: 'documents', label: 'Security Documents', icon: FileText },
        { id: 'questionnaires', label: 'Questionnaires', icon: ClipboardList },
        { id: 'contracts', label: 'Contracts', icon: FileSignature },
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

            {/* ─── Tab: Carrier Details ─────────────────────────────────────── */}
            {activeTab === 'carrier' && isLogisticsProfile && (
                <div className="space-y-5">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold dash-text uppercase tracking-wider">Carrier Profile</h3>
                        <button onClick={saveCarrierProfile} disabled={cpSaving}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50 transition-all"
                            style={{ background: 'var(--color-accent)' }}>
                            <Save size={14} />{cpSaving ? 'Saving…' : 'Save'}
                        </button>
                    </div>

                    {/* Shipping Modes */}
                    <div className="dash-card border dash-border rounded-2xl p-5 shadow-sm space-y-3">
                        <p className="text-xs font-semibold dash-text-secondary uppercase tracking-wider">Shipping Modes</p>
                        <div className="flex flex-wrap gap-2">
                            {CARRIER_SHIPPING_MODES.map(m => (
                                <button key={m} onClick={() => toggleMulti(cpShippingModes, m, setCpShippingModes)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${cpShippingModes.includes(m) ? 'text-white border-transparent' : 'dash-text-secondary dash-border hover:dash-text'}`}
                                    style={cpShippingModes.includes(m) ? { background: 'var(--color-accent)', borderColor: 'var(--color-accent)' } : {}}>
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Route Coverage */}
                    <div className="dash-card border dash-border rounded-2xl p-5 shadow-sm space-y-3">
                        <p className="text-xs font-semibold dash-text-secondary uppercase tracking-wider">Route Coverage</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {CARRIER_ROUTE_KEYS.map(({ key, label }) => (
                                <label key={key} className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!cpRoutes[key]}
                                        onChange={e => setCpRoutes(prev => ({ ...prev, [key]: e.target.checked }))}
                                        className="rounded" />
                                    <span className="text-sm dash-text">{label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Last-Mile Areas */}
                    <div className="dash-card border dash-border rounded-2xl p-5 shadow-sm space-y-3">
                        <p className="text-xs font-semibold dash-text-secondary uppercase tracking-wider">Last-Mile Areas</p>
                        <div className="flex flex-wrap gap-2">
                            {CARRIER_LAST_MILE_AREAS.map(a => (
                                <button key={a} onClick={() => toggleMulti(cpLastMile, a, setCpLastMile)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${cpLastMile.includes(a) ? 'text-white border-transparent' : 'dash-text-secondary dash-border hover:dash-text'}`}
                                    style={cpLastMile.includes(a) ? { background: 'var(--color-accent)', borderColor: 'var(--color-accent)' } : {}}>
                                    {a}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Performance & Insurance */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="dash-card border dash-border rounded-2xl p-5 shadow-sm space-y-4">
                            <p className="text-xs font-semibold dash-text-secondary uppercase tracking-wider">Performance</p>
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5">On-Time Delivery Rate (%)</label>
                                <input type="number" min={0} max={100} step={0.1} value={cpOtdRate}
                                    onChange={e => setCpOtdRate(e.target.value)}
                                    placeholder="e.g. 94.5"
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none focus:ring-1"
                                    style={{ '--tw-ring-color': 'var(--color-accent)' } as any} />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Damage Rate (%)</label>
                                <input type="number" min={0} max={100} step={0.01} value={cpDamageRate}
                                    onChange={e => setCpDamageRate(e.target.value)}
                                    placeholder="e.g. 0.3"
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none focus:ring-1"
                                    style={{ '--tw-ring-color': 'var(--color-accent)' } as any} />
                            </div>
                        </div>
                        <div className="dash-card border dash-border rounded-2xl p-5 shadow-sm space-y-4">
                            <p className="text-xs font-semibold dash-text-secondary uppercase tracking-wider">Insurance & Licence</p>
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Carrier Licence Type</label>
                                <input type="text" value={cpLicenceType} onChange={e => setCpLicenceType(e.target.value)}
                                    placeholder="e.g. NCS_agent, NCAA_approved"
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none focus:ring-1"
                                    style={{ '--tw-ring-color': 'var(--color-accent)' } as any} />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Insurance Coverage (£)</label>
                                <input type="number" min={0} value={cpInsuranceGbp} onChange={e => setCpInsuranceGbp(e.target.value)}
                                    placeholder="e.g. 1000000"
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none focus:ring-1"
                                    style={{ '--tw-ring-color': 'var(--color-accent)' } as any} />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Insurance Expiry</label>
                                <input type="date" value={cpInsuranceExpiry} onChange={e => setCpInsuranceExpiry(e.target.value)}
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none" />
                            </div>
                        </div>
                    </div>

                    {/* Due Diligence */}
                    <div className="dash-card border dash-border rounded-2xl p-5 shadow-sm space-y-4">
                        <p className="text-xs font-semibold dash-text-secondary uppercase tracking-wider">Due Diligence</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input type="checkbox" checked={cpAntiB} onChange={e => setCpAntiB(e.target.checked)} className="rounded w-4 h-4" />
                                <span className="text-sm dash-text">Anti-bribery acknowledgement received</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input type="checkbox" checked={cpDdCompleted} onChange={e => setCpDdCompleted(e.target.checked)} className="rounded w-4 h-4" />
                                <span className="text-sm dash-text">Due diligence completed</span>
                            </label>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Last Due Diligence Date</label>
                            <input type="date" value={cpDdDate} onChange={e => setCpDdDate(e.target.value)}
                                className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Notes</label>
                            <textarea value={cpNotes} onChange={e => setCpNotes(e.target.value)} rows={3}
                                placeholder="Any additional notes about this carrier…"
                                className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none resize-none" />
                        </div>
                    </div>
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

            {/* ─── Tab: Contracts ───────────────────────────────────────────── */}
            {activeTab === 'contracts' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold dash-text uppercase tracking-wider">Vendor Contracts</h3>
                        <button onClick={() => openContractForm()}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-md transition-all"
                            style={{ background: 'var(--color-accent)' }}>
                            <Plus size={14} />
                            Add Contract
                        </button>
                    </div>

                    {contracts.length === 0 ? (
                        <div className="dash-card border dash-border rounded-2xl p-12 flex flex-col items-center justify-center gap-3 shadow-sm">
                            <FileSignature size={36} className="dash-text-tertiary" />
                            <p className="dash-text-tertiary text-sm">No contracts added yet</p>
                            <p className="text-xs dash-text-tertiary">Track agreement terms, SLAs, and expiry risk</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {contracts.map(c => {
                                const riskColor = c.risk_score >= 70 ? '#ef4444' : c.risk_score >= 40 ? '#f59e0b' : '#22c55e';
                                return (
                                    <div key={c.id} className="dash-card border dash-border rounded-2xl p-5 shadow-sm">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-4 min-w-0">
                                                <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
                                                    style={{ background: `${contractStatusColor(c.status)}20` }}>
                                                    <FileSignature size={18} style={{ color: contractStatusColor(c.status) }} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold dash-text">{c.title}</p>
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase capitalize"
                                                            style={{ background: `${contractStatusColor(c.status)}20`, color: contractStatusColor(c.status) }}>
                                                            {c.status.replace(/_/g, ' ')}
                                                        </span>
                                                        {c.contract_value != null && (
                                                            <span className="text-xs dash-text-secondary">
                                                                {c.currency} {c.contract_value.toLocaleString()}
                                                            </span>
                                                        )}
                                                        {c.expiry_date && (
                                                            <span className="text-xs dash-text-secondary flex items-center gap-1">
                                                                <Calendar size={11} />
                                                                Expires {new Date(c.expiry_date).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                        {c.status === 'expiring_soon' && (
                                                            <span className="flex items-center gap-1 text-amber-500 text-[10px] font-bold">
                                                                <AlertTriangle size={11} /> Expiring soon
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2">
                                                        {c.sla_uptime_pct != null && (
                                                            <span className="text-[10px] dash-text-tertiary">SLA: {c.sla_uptime_pct}% uptime</span>
                                                        )}
                                                        {c.auto_renewal && (
                                                            <span className="text-[10px] dash-text-tertiary">Auto-renewal</span>
                                                        )}
                                                        {c.breach_penalty_clause && (
                                                            <span className="text-[10px] text-emerald-600">Breach penalty clause</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 flex-shrink-0">
                                                <div className="text-right">
                                                    <div className="text-[10px] dash-text-tertiary uppercase font-bold">Risk Score</div>
                                                    <div className="text-lg font-bold" style={{ color: riskColor }}>{c.risk_score}</div>
                                                </div>
                                                <button onClick={() => openContractForm(c)}
                                                    className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] dash-text-tertiary transition-colors">
                                                    <Save size={14} />
                                                </button>
                                                <button onClick={() => handleDeleteContract(c.id)}
                                                    className="p-1.5 rounded-lg hover:bg-[var(--color-danger-soft)] text-[var(--color-danger)] transition-colors">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        {c.notes && (
                                            <p className="mt-3 pt-3 border-t dash-border text-xs dash-text-tertiary">{c.notes}</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ─── Contract Form Modal ───────────────────────────────────────── */}
            {showContractForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-[var(--color-surface)] border dash-border rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-5 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold dash-text flex items-center gap-2">
                                <FileSignature size={18} className="dash-accent" />
                                {editingContract ? 'Edit Contract' : 'Add Contract'}
                            </h2>
                            <button onClick={() => setShowContractForm(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] transition-colors">
                                <X size={18} className="dash-text-tertiary" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Contract Title *</label>
                                <input type="text" value={cTitle} onChange={e => setCTitle(e.target.value)}
                                    placeholder="e.g. Annual SaaS Agreement 2026"
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none focus:ring-1"
                                    style={{ '--tw-ring-color': 'var(--color-accent)' } as any} />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Contract Value</label>
                                <input type="number" min={0} value={cValue} onChange={e => setCValue(e.target.value)}
                                    placeholder="e.g. 50000"
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Currency</label>
                                <select value={cCurrency} onChange={e => setCCurrency(e.target.value)}
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none">
                                    {['USD', 'GBP', 'EUR', 'NGN'].map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Start Date</label>
                                <input type="date" value={cStart} onChange={e => setCStart(e.target.value)}
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Expiry Date</label>
                                <input type="date" value={cExpiry} onChange={e => setCExpiry(e.target.value)}
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5">SLA Uptime (%)</label>
                                <input type="number" min={0} max={100} step={0.1} value={cSla} onChange={e => setCsla(e.target.value)}
                                    placeholder="e.g. 99.9"
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Notice Period (days)</label>
                                <input type="number" min={0} value={cNotice} onChange={e => setCNotice(e.target.value)}
                                    placeholder="e.g. 30"
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none" />
                            </div>
                            <div className="flex items-center gap-3 col-span-1">
                                <input type="checkbox" id="autoRenewal" checked={cAutoRenewal} onChange={e => setCAutoRenewal(e.target.checked)} className="rounded w-4 h-4" />
                                <label htmlFor="autoRenewal" className="text-sm dash-text cursor-pointer">Auto-renewal</label>
                            </div>
                            <div className="flex items-center gap-3 col-span-1">
                                <input type="checkbox" id="breachPenalty" checked={cBreachPenalty} onChange={e => setCBreachPenalty(e.target.checked)} className="rounded w-4 h-4" />
                                <label htmlFor="breachPenalty" className="text-sm dash-text cursor-pointer">Breach penalty clause</label>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Notes</label>
                                <textarea value={cNotes} onChange={e => setCNotes(e.target.value)} rows={2}
                                    placeholder="Key contract terms, risks or obligations…"
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none resize-none" />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2 border-t dash-border">
                            <button onClick={() => setShowContractForm(false)} className="px-4 py-2 rounded-xl text-sm font-medium dash-text-secondary hover:bg-[var(--color-surface-alt)] transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSaveContract} disabled={!cTitle.trim() || contractSaving}
                                className="px-5 py-2 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50 transition-all"
                                style={{ background: 'var(--color-accent)' }}>
                                {contractSaving ? 'Saving…' : editingContract ? 'Update Contract' : 'Add Contract'}
                            </button>
                        </div>
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
