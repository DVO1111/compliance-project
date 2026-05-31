import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    type License,
    type RenewalTask,
    fetchRenewalTasks,
    toggleTask,
    updateLicenseStatus,
    generateAndSaveRenewalTasks,
    getLicenseStatus,
    getStatusColor,
    getDaysUntilExpiry,
} from '../../lib/licenseService';
import {
    X, Calendar, Building2, Hash, Tag, FileText, Clock,
    CheckCircle, RefreshCw, Loader2, ListChecks,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import RenewalTaskList from './RenewalTaskList';

interface Props {
    license: License;
    onClose: () => void;
    onUpdated: () => void;
}

export default function LicenseDetailModal({ license, onClose, onUpdated }: Props) {
    const { user } = useAuth();
    const [tasks, setTasks] = useState<RenewalTask[]>([]);
    const [loadingTasks, setLoadingTasks] = useState(true);
    const [generatingTasks, setGeneratingTasks] = useState(false);
    const [markingRenewed, setMarkingRenewed] = useState(false);
    const [activeSection, setActiveSection] = useState<'details' | 'tasks'>('details');
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const status = getLicenseStatus(license.expiry_date);
    const colors = getStatusColor(status);
    const daysLeft = getDaysUntilExpiry(license.expiry_date);

    const showToast = (t: typeof toast) => {
        setToast(t);
        setTimeout(() => setToast(null), 3500);
    };

    useEffect(() => {
        loadTasks();
    }, [license.id]);

    const loadTasks = async () => {
        setLoadingTasks(true);
        try {
            const data = await fetchRenewalTasks(license.id);
            setTasks(data);
        } catch {
            // Tasks table may not exist
        }
        setLoadingTasks(false);
    };

    const handleToggleTask = async (taskId: string, completed: boolean) => {
        if (!user) return;
        await toggleTask(taskId, completed, user.id);
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_completed: completed, completed_at: completed ? new Date().toISOString() : null } : t));
    };

    const handleGenerateTasks = async () => {
        setGeneratingTasks(true);
        try {
            await generateAndSaveRenewalTasks(license.id, license.expiry_date);
            await loadTasks();
            showToast({ type: 'success', message: 'Renewal tasks generated!' });
        } catch {
            showToast({ type: 'error', message: 'Failed to generate tasks.' });
        }
        setGeneratingTasks(false);
    };

    const handleMarkRenewed = async () => {
        setMarkingRenewed(true);
        try {
            await updateLicenseStatus(license.id, 'renewed', 'completed');
            showToast({ type: 'success', message: 'License marked as renewed.' });
            onUpdated();
        } catch {
            showToast({ type: 'error', message: 'Failed to update license.' });
        }
        setMarkingRenewed(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-[var(--color-surface)] rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-[#004A99] to-[#0066cc] px-6 py-4 flex items-center justify-between">
                    <div>
                        <h3 className="text-white font-semibold text-lg">{license.product_name}</h3>
                        <p className="text-white/70 text-sm">{license.nafdac_reg_number || 'No registration number'}</p>
                    </div>
                    <button onClick={onClose} className="p-1 text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
                </div>

                {/* Toast */}
                <AnimatePresence>
                    {toast && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className={`mx-4 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${toast.type === 'success' ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'}`}>
                            {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <X className="w-4 h-4" />}
                            {toast.message}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Section Tabs */}
                <div className="flex border-b border-[var(--color-border)] px-6">
                    {(['details', 'tasks'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setActiveSection(s)}
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeSection === s
                                    ? 'border-[#004A99] text-[#004A99]'
                                    : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-secondary)]'
                                }`}
                        >
                            {s === 'details' ? 'Certificate Details' : `Renewal Tasks (${tasks.filter(t => !t.is_completed).length})`}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="overflow-y-auto flex-1 p-6">
                    {activeSection === 'details' && (
                        <div className="space-y-4">
                            {/* Status Banner */}
                            <div className={`flex items-center justify-between p-4 rounded-xl border ${colors.bg} ${colors.border}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-3 h-3 rounded-full ${status === 'active' ? 'bg-[var(--color-success)]' : status === 'expiring' ? 'bg-[var(--color-warning)] animate-pulse' : 'bg-[var(--color-danger)]'
                                        }`} />
                                    <div>
                                        <p className={`text-sm font-semibold ${colors.text}`}>
                                            {license.status === 'renewed' ? 'Renewed' : status === 'active' ? 'Active' : status === 'expiring' ? 'Expiring Soon' : 'Expired'}
                                        </p>
                                        <p className={`text-xs ${colors.text} opacity-75`}>
                                            {daysLeft > 0 ? `${daysLeft} days remaining` : `Expired ${Math.abs(daysLeft)} days ago`}
                                        </p>
                                    </div>
                                </div>
                                {status === 'expiring' && license.status !== 'renewed' && (
                                    <button
                                        onClick={handleMarkRenewed}
                                        disabled={markingRenewed}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-success)] rounded-lg hover:bg-[var(--color-success)] transition-colors disabled:opacity-50"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${markingRenewed ? 'animate-spin' : ''}`} />
                                        {markingRenewed ? 'Updating…' : 'Mark as Renewed'}
                                    </button>
                                )}
                            </div>

                            {/* Info Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <InfoRow icon={Tag} label="Category" value={license.category} />
                                <InfoRow icon={Building2} label="Issuing Authority" value={license.issuing_authority} />
                                <InfoRow icon={Calendar} label="Issue Date" value={license.issue_date ? new Date(license.issue_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'} />
                                <InfoRow icon={Calendar} label="Expiry Date" value={new Date(license.expiry_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })} />
                                <InfoRow icon={Hash} label="Reg. Number" value={license.nafdac_reg_number || '—'} />
                                <InfoRow icon={Clock} label="Renewal Status" value={license.renewal_status === 'completed' ? 'Completed' : license.renewal_status === 'in_progress' ? 'In Progress' : 'Not Started'} />
                            </div>

                            {license.notes && (
                                <div className="bg-[var(--color-surface-alt)] rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <FileText className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                                        <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase">Notes</p>
                                    </div>
                                    <p className="text-sm text-[var(--color-text-secondary)]">{license.notes}</p>
                                </div>
                            )}

                            {/* Timeline */}
                            <div>
                                <h4 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-3">Renewal Timeline</h4>
                                <div className="relative pl-6 space-y-4 border-l-2 border-[var(--color-border)]">
                                    {[
                                        { label: 'Certificate Issued', date: license.issue_date, done: true },
                                        { label: 'Renewal Window Opens (6 months)', date: (() => { const d = new Date(license.expiry_date); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10); })(), done: daysLeft <= 180 },
                                        { label: 'Dossier Submission Deadline', date: (() => { const d = new Date(license.expiry_date); d.setMonth(d.getMonth() - 2); return d.toISOString().slice(0, 10); })(), done: daysLeft <= 60 },
                                        { label: 'Expiry Date', date: license.expiry_date, done: daysLeft <= 0 },
                                    ].map((m, i) => (
                                        <div key={i} className="relative">
                                            <div className={`absolute -left-[25px] w-3 h-3 rounded-full border-2 ${m.done ? 'bg-[var(--color-accent)] border-[#004A99]' : 'bg-[var(--color-surface)] border-[var(--color-border)]'}`} />
                                            <p className="text-sm font-medium text-[var(--color-text-primary)]">{m.label}</p>
                                            <p className="text-xs text-[var(--color-text-secondary)]">{m.date ? new Date(m.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeSection === 'tasks' && (
                        <div>
                            {loadingTasks ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-6 h-6 text-[#004A99] animate-spin" />
                                </div>
                            ) : tasks.length === 0 ? (
                                <div className="text-center py-8 space-y-3">
                                    <ListChecks className="w-10 h-10 text-[var(--color-text-tertiary)] mx-auto" />
                                    <p className="text-sm text-[var(--color-text-secondary)]">No renewal tasks generated yet.</p>
                                    {status === 'expiring' && (
                                        <button
                                            onClick={handleGenerateTasks}
                                            disabled={generatingTasks}
                                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
                                        >
                                            <RefreshCw className={`w-4 h-4 ${generatingTasks ? 'animate-spin' : ''}`} />
                                            {generatingTasks ? 'Generating…' : 'Generate 2026 NAFDAC Renewal Tasks'}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <RenewalTaskList tasks={tasks} onToggle={handleToggleTask} />
                            )}
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
    return (
        <div className="flex items-start gap-2.5 bg-[var(--color-surface-alt)] rounded-lg p-3">
            <Icon className="w-4 h-4 text-[var(--color-text-tertiary)] mt-0.5 shrink-0" />
            <div>
                <p className="text-xs text-[var(--color-text-secondary)] font-medium">{label}</p>
                <p className="text-sm text-[var(--color-text-primary)]">{value}</p>
            </div>
        </div>
    );
}
