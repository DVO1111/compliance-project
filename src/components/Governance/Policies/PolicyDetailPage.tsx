import { useState, useEffect } from 'react';
import {
    ArrowLeft,
    History,
    Users,
    FileCheck,
    Shield,
    Calendar,
    Plus,
    Eye,
    CheckCircle2,
    Clock,
    AlertCircle,
    Send,
    UserCheck as UserCheckIcon
} from 'lucide-react';
import { policyService, Policy, PolicyVersion } from '../../../lib/governance/policyService';
import { useAuth } from '../../../contexts/AuthContext';
import AddVersionModal from './AddVersionModal';
import { logger } from '../../../lib/logger';

interface PolicyDetailPageProps {
    policyId: string | null;
    onBack: () => void;
}

export default function PolicyDetailPage({ policyId, onBack }: PolicyDetailPageProps) {
    const { user, profile } = useAuth();
    const [policy, setPolicy] = useState<Policy | null>(null);
    const [versions, setVersions] = useState<PolicyVersion[]>([]);
    const [acknowledgements, setAcknowledgements] = useState<any[]>([]);
    const [complianceStats, setComplianceStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showAddVersionModal, setShowAddVersionModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'versions' | 'compliance'>('versions');

    const fetchData = async () => {
        if (!policyId || !profile?.company_id) return;
        try {
            setLoading(true);
            const policies = await policyService.listPolicies(profile.company_id);
            const p = policies.find(p => p.id === policyId);
            if (p) {
                setPolicy(p);
                const [vData, aData, cData] = await Promise.all([
                    policyService.listPolicyVersions(policyId),
                    policyService.listPolicyAcknowledgements(policyId),
                    policyService.getAcknowledgementCompliance(policyId, profile.company_id)
                ]);
                setVersions(vData);
                setAcknowledgements(aData);
                setComplianceStats(cData);
            }
        } catch (error) {
            logger.error('Error fetching policy detail:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [policyId, profile?.company_id]);

    const handlePublish = async (versionId: string) => {
        if (!user) return;
        try {
            await policyService.publishPolicyVersion(profile?.company_id || '', user.id, versionId);
            fetchData();
        } catch (error) {
            logger.error('Failed to publish:', error);
        }
    };

    const handleSendReminder = async (userId: string) => {
        const publishedVer = versions.find(v => v.status === 'published');
        if (!publishedVer) return;
        try {
            await policyService.sendManualReminder(publishedVer.id, userId);
            alert('Reminder sent!');
        } catch (err) {
            logger.error('Failed to send reminder:', err);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-accent)]"></div>
            </div>
        );
    }

    if (!policy) {
        return (
            <div className="p-8 text-center space-y-4">
                <AlertCircle className="mx-auto text-[var(--color-danger)]" size={48} />
                <h2 className="text-xl font-bold dash-text">Policy Not Found</h2>
                <button onClick={onBack} className="dash-button-primary">Back to Policies</button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-sm dash-text-tertiary hover:dash-text-primary transition-colors"
            >
                <ArrowLeft size={16} />
                <span>Back to Policies</span>
            </button>

            <div className="flex flex-col md:flex-row justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <h1 className="text-3xl font-bold dash-text">{policy.title}</h1>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[var(--color-surface-alt)] border dash-border dash-text-tertiary">
                            {policy.category}
                        </span>
                    </div>
                    <p className="text-sm dash-text-secondary max-w-2xl">{policy.description}</p>
                </div>

                <div className="flex gap-3 h-fit">
                    <button
                        onClick={() => setShowAddVersionModal(true)}
                        className="dash-button-primary flex items-center gap-2"
                    >
                        <Plus size={18} />
                        <span>New Version</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="dash-card border dash-border rounded-2xl p-4 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
                        <History size={24} />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Versions</div>
                        <div className="text-2xl font-bold dash-text">{versions.length}</div>
                    </div>
                </div>
                <div className="dash-card border dash-border rounded-2xl p-4 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-green-500/10 text-green-500">
                        <Users size={24} />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Comp. Rate</div>
                        <div className="text-2xl font-bold dash-text">{complianceStats?.rate?.toFixed(0)}%</div>
                    </div>
                </div>
                <div className="dash-card border dash-border rounded-2xl p-4 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500">
                        <Clock size={24} />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Pending</div>
                        <div className="text-2xl font-bold dash-text">{complianceStats?.pending}</div>
                    </div>
                </div>
                <div className="dash-card border dash-border rounded-2xl p-4 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                        <Shield size={24} />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Status</div>
                        <div className="text-lg font-bold dash-text capitalize">{policy.status}</div>
                    </div>
                </div>
            </div>

            <div className="dash-card border dash-border rounded-2xl overflow-hidden">
                <div className="flex border-b dash-border">
                    <button
                        onClick={() => setActiveTab('versions')}
                        className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'versions' ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-transparent dash-text-tertiary hover:dash-text-primary'}`}
                    >
                        <Clock size={16} />
                        Version History
                    </button>
                    <button
                        onClick={() => setActiveTab('compliance')}
                        className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'compliance' ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-transparent dash-text-tertiary hover:dash-text-primary'}`}
                    >
                        <UserCheckIcon size={16} />
                        Compliance Tracking
                    </button>
                </div>

                <div className="p-6">
                    {activeTab === 'versions' ? (
                        <div className="space-y-4">
                            {versions.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="dash-text-tertiary text-[10px] font-bold uppercase tracking-widest border-b dash-border">
                                                <th className="pb-3 px-2">Version</th>
                                                <th className="pb-3 px-2">Status</th>
                                                <th className="pb-3 px-2">Requires Sign</th>
                                                <th className="pb-3 px-2">Effective Date</th>
                                                <th className="pb-3 px-2">Created</th>
                                                <th className="pb-3 px-2"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y dash-border">
                                            {versions.map(v => (
                                                <tr key={v.id} className="group hover:dash-surface-alt transition-colors">
                                                    <td className="py-4 px-2">
                                                        <div className="text-sm font-semibold dash-text">v{v.version_label}</div>
                                                    </td>
                                                    <td className="py-4 px-2">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${v.status === 'published'
                                                            ? 'bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success-border)]'
                                                            : v.status === 'archived'
                                                                ? 'bg-[var(--color-surface-alt)] text-gray-500 border-gray-300'
                                                                : 'bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning-border)]'
                                                            }`}>
                                                            {v.status}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-2">
                                                        {v.requires_ack ? (
                                                            <span className="text-xs text-[var(--color-accent)] font-medium flex items-center gap-1">
                                                                <CheckCircle2 size={12} /> Mandatory
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-gray-400">Optional</span>
                                                        )}
                                                    </td>
                                                    <td className="py-4 px-2 text-xs dash-text">
                                                        {v.effective_date ? new Date(v.effective_date).toLocaleDateString() : 'N/A'}
                                                    </td>
                                                    <td className="py-4 px-2 text-xs dash-text-tertiary">
                                                        {new Date(v.created_at).toLocaleDateString()}
                                                    </td>
                                                    <td className="py-4 px-2 text-right space-x-2">
                                                        {v.status === 'draft' && (
                                                            <button
                                                                onClick={() => handlePublish(v.id)}
                                                                className="px-3 py-1 rounded-lg bg-[var(--color-success)] text-white text-[10px] font-bold hover:opacity-90 transition-opacity"
                                                            >
                                                                Publish
                                                            </button>
                                                        )}
                                                        <button className="p-1 rounded-lg hover:dash-surface transition-colors dash-text-tertiary">
                                                            <Eye size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-12 space-y-2">
                                    <FileCheck size={48} className="mx-auto text-[var(--color-text-tertiary)] opacity-20" />
                                    <p className="dash-text-tertiary">No versions created yet.</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold dash-text uppercase tracking-wider">Employee Attestation Status</h3>
                                <div className="flex gap-2">
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-success)]">
                                        <div className="w-2 h-2 rounded-full bg-[var(--color-success)]" /> Signed
                                    </span>
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-warning)]">
                                        <div className="w-2 h-2 rounded-full bg-[var(--color-warning)]" /> Pending
                                    </span>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="dash-text-tertiary text-[10px] font-bold uppercase tracking-widest border-b dash-border">
                                            <th className="pb-3 px-2">Employee</th>
                                            <th className="pb-3 px-2">Status</th>
                                            <th className="pb-3 px-2">Signed At</th>
                                            <th className="pb-3 px-2 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y dash-border">
                                        {acknowledgements.map(ack => (
                                            <tr key={ack.id} className="group hover:dash-surface-alt transition-colors">
                                                <td className="py-4 px-2">
                                                    <div className="text-sm font-semibold dash-text">{ack.profiles?.full_name || 'Unknown User'}</div>
                                                    <div className="text-[10px] dash-text-tertiary">{ack.profiles?.email}</div>
                                                </td>
                                                <td className="py-4 px-2">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[var(--color-success-soft)] text-[var(--color-success)] border border-[var(--color-success-border)]">
                                                        Acknowledged
                                                    </span>
                                                </td>
                                                <td className="py-4 px-2 text-xs dash-text">
                                                    {new Date(ack.acknowledged_at).toLocaleString()}
                                                </td>
                                                <td className="py-4 px-2 text-right">
                                                    <button className="text-[var(--color-accent)] hover:underline text-xs font-bold">
                                                        View Log
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {complianceStats?.pending > 0 && (
                                            <tr className="bg-gray-50/50">
                                                <td colSpan={4} className="py-4 px-2 text-center text-xs dash-text-tertiary italic">
                                                    + {complianceStats.pending} other employees pending acknowledgement
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="pt-4 flex justify-end">
                                <button
                                    className="dash-button-primary flex items-center gap-2"
                                    onClick={() => alert('Sending bulk reminders...')}
                                >
                                    <Send size={16} />
                                    <span>Send Reminders to All Pending</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showAddVersionModal && (
                <AddVersionModal
                    policyId={policyId!}
                    onClose={() => setShowAddVersionModal(false)}
                    onSuccess={() => {
                        setShowAddVersionModal(false);
                        fetchData();
                    }}
                />
            )}
        </div>
    );
}
