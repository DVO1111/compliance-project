import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    type License,
    fetchLicenses,
    getLicenseStatus,
    getStatusColor,
    getDaysUntilExpiry,
    deleteLicense,
} from '../../lib/licenseService';
import {
    Plus, FileKey, AlertTriangle, Clock, CheckCircle2,
    ShieldCheck, Search, Trash2, Loader2, CalendarClock, ListChecks,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import LicenseUploadModal from './LicenseUploadModal';
import LicenseDetailModal from './LicenseDetailModal';

export default function LicenseVaultPage() {
    const { profile } = useAuth();
    const [licenses, setLicenses] = useState<License[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'active' | 'expiring' | 'expired'>('all');
    const [showUpload, setShowUpload] = useState(false);
    const [selectedLicense, setSelectedLicense] = useState<License | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadLicenses = async () => {
        if (!profile?.company_id) return;
        setLoading(true);
        try {
            const data = await fetchLicenses(profile.company_id);
            setLicenses(data);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load licenses. The licenses table may not be set up yet.');
        }
        setLoading(false);
    };

    useEffect(() => {
        loadLicenses();
    }, [profile?.company_id]);

    const stats = useMemo(() => {
        const total = licenses.length;
        let active = 0, expiring = 0, expired = 0;
        licenses.forEach(l => {
            const s = getLicenseStatus(l.expiry_date);
            if (s === 'active') active++;
            else if (s === 'expiring') expiring++;
            else expired++;
        });
        return { total, active, expiring, expired };
    }, [licenses]);

    const filtered = useMemo(() => {
        let out = licenses;
        if (filter !== 'all') {
            out = out.filter(l => {
                const s = getLicenseStatus(l.expiry_date);
                return s === filter || (filter === 'active' && l.status === 'renewed');
            });
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            out = out.filter(l =>
                l.product_name.toLowerCase().includes(q) ||
                l.nafdac_reg_number.toLowerCase().includes(q) ||
                l.category.toLowerCase().includes(q)
            );
        }
        return out;
    }, [licenses, filter, search]);

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this license and its tasks? This cannot be undone.')) return;
        setDeletingId(id);
        try {
            await deleteLicense(id, profile?.company_id ?? undefined, profile?.id ?? undefined);
            setLicenses(prev => prev.filter(l => l.id !== id));
        } catch { }
        setDeletingId(null);
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                        <FileKey className="w-7 h-7 text-[#004A99]" />
                        License & Permit Vault
                    </h1>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                        Track NAFDAC certificates, monitor expiry dates, and auto-generate renewal task lists
                    </p>
                </div>
                <button
                    onClick={() => setShowUpload(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-accent)] text-white rounded-xl text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Add License
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon={ShieldCheck} label="Total Licenses" value={stats.total} color="text-[#004A99]" bg="bg-[var(--color-info-soft)]" />
                <StatCard icon={CheckCircle2} label="Active" value={stats.active} color="text-[var(--color-success)]" bg="bg-[var(--color-success-soft)]" />
                <StatCard icon={AlertTriangle} label="Expiring Soon" value={stats.expiring} color="text-[var(--color-warning)]" bg="bg-[var(--color-warning-soft)]" pulse={stats.expiring > 0} />
                <StatCard icon={Clock} label="Expired" value={stats.expired} color="text-[var(--color-danger)]" bg="bg-[var(--color-danger-soft)]" />
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by product name, reg number, or category…"
                        className="w-full pl-9 pr-3 py-2.5 border border-[var(--color-border)] rounded-xl text-sm focus:ring-2 focus:ring-[#004A99] focus:border-transparent outline-none"
                    />
                </div>
                <div className="flex gap-1.5">
                    {(['all', 'active', 'expiring', 'expired'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${filter === f ? 'bg-[var(--color-accent)] text-white border-[#004A99]' : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]'
                                }`}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}{f !== 'all' && ` (${stats[f]})`}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 text-[#004A99] animate-spin" />
                </div>
            ) : error ? (
                <div className="bg-[var(--color-warning-soft)] border border-[var(--color-warning)]/20 rounded-xl p-6 text-center">
                    <AlertTriangle className="w-8 h-8 text-[var(--color-warning)] mx-auto mb-3" />
                    <p className="text-sm font-medium text-[var(--color-warning)]">{error}</p>
                    <p className="text-xs text-[var(--color-warning)] mt-1">Run the license_vault_migration.sql to set up the required tables.</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-12 text-center">
                    <FileKey className="w-12 h-12 text-[var(--color-text-tertiary)] mx-auto mb-3" />
                    <p className="text-sm font-medium text-[var(--color-text-secondary)]">
                        {licenses.length === 0 ? 'No licenses added yet' : 'No licenses match your filter'}
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                        {licenses.length === 0 ? 'Upload your first NAFDAC certificate to get started.' : 'Try adjusting your search or filter.'}
                    </p>
                    {licenses.length === 0 && (
                        <button
                            onClick={() => setShowUpload(true)}
                            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#004A99] bg-[var(--color-info-soft)] border border-[var(--color-info)]/20 rounded-lg hover:bg-[var(--color-info-soft)] transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add First License
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((license, i) => {
                        const status = getLicenseStatus(license.expiry_date);
                        const colors = getStatusColor(status);
                        const daysLeft = getDaysUntilExpiry(license.expiry_date);
                        const isDeleting = deletingId === license.id;

                        return (
                            <motion.div
                                key={license.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.04 }}
                                onClick={() => setSelectedLicense(license)}
                                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 hover:shadow-md hover:border-[#004A99]/30 transition-all cursor-pointer group relative"
                            >
                                {/* Status Badge */}
                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${colors.bg} ${colors.text} ${colors.border} border mb-3`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-[var(--color-success)]' : status === 'expiring' ? 'bg-[var(--color-warning)] animate-pulse' : 'bg-[var(--color-danger)]'
                                        }`} />
                                    {license.status === 'renewed' ? 'Renewed' : status === 'active' ? 'Active' : status === 'expiring' ? 'Expiring Soon' : 'Expired'}
                                </div>

                                <h3 className="text-sm font-bold text-[var(--color-text-primary)] group-hover:text-[#004A99] transition-colors line-clamp-2">
                                    {license.product_name}
                                </h3>
                                <p className="text-xs text-[var(--color-text-secondary)] mt-1 font-mono">{license.nafdac_reg_number || '—'}</p>

                                <div className="mt-3 space-y-1.5">
                                    <div className="flex items-center gap-2 text-xs">
                                        <CalendarClock className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
                                        <span className="text-[var(--color-text-secondary)]">
                                            Expires: {new Date(license.expiry_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                        <ListChecks className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
                                        <span className={`font-medium ${status === 'expiring' ? 'text-[var(--color-warning)]' : daysLeft <= 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-secondary)]'
                                            }`}>
                                            {daysLeft > 0 ? `${daysLeft} days remaining` : `Expired ${Math.abs(daysLeft)} days ago`}
                                        </span>
                                    </div>
                                </div>

                                {/* Category tag */}
                                <div className="mt-3 flex items-center justify-between">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] bg-[var(--color-surface-alt)] px-2 py-0.5 rounded">
                                        {license.category}
                                    </span>
                                    <button
                                        onClick={e => { e.stopPropagation(); handleDelete(license.id); }}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-all"
                                        title="Delete license"
                                    >
                                        {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    </button>
                                </div>

                                {/* Expiry progress ring */}
                                {status === 'expiring' && (
                                    <div className="absolute top-4 right-4">
                                        <svg className="w-8 h-8" viewBox="0 0 32 32">
                                            <circle cx="16" cy="16" r="13" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                                            <circle cx="16" cy="16" r="13" fill="none" stroke="#f59e0b" strokeWidth="3"
                                                strokeDasharray={`${Math.max(0, (daysLeft / 180) * 81.7)} 81.7`}
                                                strokeLinecap="round" transform="rotate(-90 16 16)" />
                                        </svg>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* Modals */}
            <AnimatePresence>
                {showUpload && (
                    <LicenseUploadModal
                        onClose={() => setShowUpload(false)}
                        onCreated={() => { setShowUpload(false); loadLicenses(); }}
                    />
                )}
                {selectedLicense && (
                    <LicenseDetailModal
                        license={selectedLicense}
                        onClose={() => setSelectedLicense(null)}
                        onUpdated={() => { setSelectedLicense(null); loadLicenses(); }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

/* ── Stat Card ── */
function StatCard({ icon: Icon, label, value, color, bg, pulse }: {
    icon: any; label: string; value: number; color: string; bg: string; pulse?: boolean;
}) {
    return (
        <div className={`${bg} rounded-xl p-4 border border-transparent`}>
            <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${color} ${pulse ? 'animate-pulse' : ''}`} />
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
        </div>
    );
}
