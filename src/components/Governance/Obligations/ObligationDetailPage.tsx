import { useState, useEffect, useCallback } from 'react';
import {
    ArrowLeft,
    Scale,
    Shield,
    FileText,
    AlertTriangle,
    Building2,
    Plus,
    Trash2,
    ExternalLink,
    ChevronRight,
    Globe,
    Clock,
    User,
    Activity,
    CheckCircle2,
    CheckCircle,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import {
    getObligationDetail,
    updateObligation,
    linkObligationEntity,
    removeObligationLink,
    RegulatoryObligation
} from '../../../lib/governance/obligationService';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';

interface LinkTypeConfig {
    icon: any;
    label: string;
    table: string;
    displayField: string;
}

const LINK_CONFIGS: Record<string, LinkTypeConfig> = {
    control: { icon: Shield, label: 'Control', table: 'grc_controls', displayField: 'name' },
    policy: { icon: FileText, label: 'Policy', table: 'policies', displayField: 'title' },
    risk: { icon: AlertTriangle, label: 'Risk', table: 'risks', displayField: 'title' },
    vendor: { icon: Building2, label: 'Vendor', table: 'vendors', displayField: 'name' }
};

export default function ObligationDetailPage({ obligationId, onBack }: { obligationId: string; onBack: () => void }) {
    const { profile } = useAuth();
    const companyId = (profile as any)?.company_id;

    const [obligation, setObligation] = useState<RegulatoryObligation | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState<{ type: string } | null>(null);

    const loadData = useCallback(async () => {
        if (!companyId || !obligationId) return;
        setLoading(true);
        try {
            const data = await getObligationDetail(obligationId, companyId);
            setObligation(data);
        } catch (err) {
            logger.error('Failed to load obligation:', err);
        } finally {
            setLoading(false);
        }
    }, [companyId, obligationId]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleUpdateStatus = async (newStatus: any) => {
        if (!companyId || !obligation) return;
        try {
            const updated = await updateObligation(companyId, profile!.id, obligation.id, { status: newStatus });
            setObligation({ ...obligation, ...updated });
        } catch (err) {
            logger.error('Failed to update status:', err);
        }
    };

    const handleRemoveLink = async (linkId: string) => {
        if (!companyId) return;
        try {
            await removeObligationLink(linkId, profile!.id, companyId);
            loadData();
        } catch (err) {
            logger.error('Failed to remove link:', err);
        }
    };

    if (loading) return <div className="p-8 animate-pulse space-y-4">
        <div className="h-10 w-1/3 bg-[var(--color-surface-alt)] rounded-lg" />
        <div className="h-64 bg-[var(--color-surface-alt)] rounded-2xl" />
    </div>;

    if (!obligation) return <div className="p-8 text-center">Obligation not found.</div>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-[var(--color-surface-alt)] rounded-xl transition-colors dash-text-tertiary"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold dash-text">{obligation.title}</h1>
                            <StatusChip status={obligation.status} onClick={(s) => handleUpdateStatus(s)} />
                        </div>
                        <p className="text-sm dash-text-secondary mt-1 flex items-center gap-2">
                            <Globe size={14} /> Requirement for <span className="font-bold underline cursor-help text-blue-500">{obligation.regulation?.title || 'Unknown'}</span>
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button className="px-4 py-2 border dash-border rounded-xl text-sm font-semibold hover:bg-[var(--color-surface-alt)] transition-colors dash-text">
                        Edit Description
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Details */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-[var(--color-surface)] border dash-border rounded-2xl p-6 shadow-sm">
                        <h3 className="text-[10px] font-black uppercase tracking-widest dash-text-tertiary mb-4">Obligation Text</h3>
                        <p className="text-sm leading-relaxed dash-text whitespace-pre-wrap">{obligation.description}</p>
                    </div>

                    <div className="bg-[var(--color-surface)] border dash-border rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-[10px] font-black uppercase tracking-widest dash-text-tertiary">Operational Traceability</h3>
                            <div className="flex gap-2">
                                {Object.keys(LINK_CONFIGS).map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setShowLinkModal({ type })}
                                        className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-all dash-text-tertiary flex items-center gap-1.5 text-[10px] font-bold border border-transparent hover:border-blue-100"
                                    >
                                        <Plus size={12} /> {LINK_CONFIGS[type].label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            {obligation.links && obligation.links.length > 0 ? (
                                obligation.links.map(link => (
                                    <LinkedItem
                                        key={link.id}
                                        link={link}
                                        onRemove={() => handleRemoveLink(link.id)}
                                    />
                                ))
                            ) : (
                                <div className="text-center py-10 border-2 border-dashed dash-border rounded-xl opacity-30">
                                    <Activity size={32} className="mx-auto mb-2" />
                                    <p className="text-xs font-bold uppercase">No operational links identified</p>
                                    <p className="text-[10px] lowercase italic mt-1 font-normal">Map this obligation to a control or policy to show compliance</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Sidebar */}
                <div className="space-y-6">
                    <div className="bg-[var(--color-surface)] border dash-border rounded-2xl p-6 shadow-sm">
                        <h3 className="text-[10px] font-black uppercase tracking-widest dash-text-tertiary mb-6">Compliance Context</h3>
                        <div className="space-y-6">
                            <ContextItem label="Jurisdiction" value={obligation.jurisdiction} icon={<Globe size={14} />} />
                            <ContextItem label="Category" value={obligation.category} icon={<Activity size={14} />} />
                            <ContextItem label="Assigned Owner" value={obligation.owner?.full_name || 'Unassigned'} icon={<User size={14} />} />
                            <ContextItem label="Identified On" value={new Date(obligation.created_at).toLocaleDateString()} icon={<Clock size={14} />} />
                        </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center gap-3 text-blue-800 mb-2">
                            <Shield size={20} className="shrink-0" />
                            <h4 className="font-bold text-sm">Target Status</h4>
                        </div>
                        <p className="text-[11px] text-blue-700 leading-relaxed mb-4">
                            Obligations should move to <strong>Implemented</strong> once at least one satisfiable control is linked.
                        </p>
                        <button
                            onClick={() => handleUpdateStatus('implemented')}
                            disabled={obligation.status === 'implemented'}
                            className="w-full bg-blue-600 text-white rounded-xl py-2 text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                        >
                            {obligation.status === 'implemented' ? 'Compliance Established' : 'Mark as Implemented'}
                        </button>
                    </div>
                </div>
            </div>

            {showLinkModal && (
                <LinkSelectorModal
                    type={showLinkModal.type}
                    onClose={() => setShowLinkModal(null)}
                    onSelect={async (entityId: any) => {
                        await linkObligationEntity(companyId, profile!.id, obligation.id, showLinkModal.type as any, entityId);
                        loadData();
                        setShowLinkModal(null);
                    }}
                    companyId={companyId}
                />
            )}
        </div>
    );
}

function StatusChip({ status, onClick }: { status: string; onClick: (s: string) => void }) {
    const options = ['identified', 'implemented', 'monitored'];
    return (
        <div className="flex gap-1.5">
            {options.map(o => (
                <button
                    key={o}
                    onClick={() => onClick(o)}
                    className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border transition-all ${status === o
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-100'
                            : 'bg-[var(--color-surface-alt)] text-slate-500 border-transparent hover:border-slate-300'
                        }`}
                >
                    {o}
                </button>
            ))}
        </div>
    );
}

function ContextItem({ label, value, icon }: { label: string; value: string; icon: any }) {
    return (
        <div className="flex items-center justify-between group">
            <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-[var(--color-surface-alt)] dash-text-tertiary">
                    {icon}
                </div>
                <span className="text-[10px] font-bold uppercase dash-text-tertiary">{label}</span>
            </div>
            <span className="text-xs font-black dash-text uppercase">{value}</span>
        </div>
    );
}

function LinkedItem({ link, onRemove }: { link: any; onRemove: () => void }) {
    const config = LINK_CONFIGS[link.link_type];
    const Icon = config.icon;
    const [details, setDetails] = useState<any>(null);

    useEffect(() => {
        const fetchDetails = async () => {
            const { data } = await supabase
                .from(config.table as any)
                .select('*')
                .eq('id', link.linked_entity_id)
                .single();
            setDetails(data);
        };
        fetchDetails();
    }, [link, config]);

    return (
        <div className="p-3 rounded-xl border dash-border bg-[var(--color-bg)] hover:bg-[var(--color-surface-alt)] transition-all flex items-center justify-between group">
            <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-xl bg-white border dash-border shadow-sm dash-text-tertiary">
                    <Icon size={16} />
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase dash-text-tertiary">{config.label}</p>
                    <p className="text-sm font-bold dash-text group-hover:text-blue-500 transition-colors uppercase">
                        {details ? (details[config.displayField] || details.title || details.name) : 'Loading...'}
                    </p>
                </div>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="p-2 text-rose-500 opacity-0 group-hover:opacity-100 hover:bg-rose-50 rounded-lg transition-all"
            >
                <Trash2 size={14} />
            </button>
        </div>
    );
}

function LinkSelectorModal({ type, onClose, onSelect, companyId }: any) {
    const config = LINK_CONFIGS[type];
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const loadItems = async () => {
            setLoading(true);
            const { data } = await supabase
                .from(config.table as any)
                .select('*')
                .eq('company_id', companyId)
                .limit(20);
            setItems(data || []);
            setLoading(false);
        };
        loadItems();
    }, [type, companyId, config.table]);

    const filtered = items.filter(i =>
        (i[config.displayField] || i.title || i.name || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--color-bg)] w-full max-w-md rounded-2xl shadow-2xl border dash-border overflow-hidden">
                <div className="px-6 py-4 border-b dash-border bg-[var(--color-surface)] flex items-center justify-between">
                    <h2 className="text-sm font-bold dash-text uppercase tracking-widest flex items-center gap-2">
                        Link {config.label}
                    </h2>
                    <button onClick={onClose} className="dash-text-tertiary hover:dash-text">×</button>
                </div>
                <div className="p-4">
                    <input
                        className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-4 py-2 text-sm dash-text mb-4"
                        placeholder={`Search ${config.label.toLowerCase()}s...`}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                        {loading ? <div className="p-10 text-center animate-pulse">Loading...</div> :
                            filtered.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => onSelect(item.id)}
                                    className="w-full p-3 text-left rounded-xl hover:bg-[var(--color-surface-alt)] border border-transparent hover:border-blue-100 transition-all group"
                                >
                                    <p className="text-xs font-bold dash-text group-hover:text-blue-600 uppercase">
                                        {item[config.displayField] || item.title || item.name}
                                    </p>
                                </button>
                            ))
                        }
                    </div>
                </div>
            </div>
        </div>
    );
}
