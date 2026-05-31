import { useState, useEffect } from "react";
import {
    ShieldCheck,
    XCircle,
    Clock,
    CheckCircle2,
    Search,
    AlertTriangle,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { LegalPartnerProfile } from "../../lib/legalMarketplaceService";
import { logger } from '../../lib/logger';

type ActionFeedback = { partnerId: string; status: 'verified' | 'rejected' | 'error'; message: string } | null;

export default function PartnerVerificationPage() {
    const [partners, setPartners] = useState<LegalPartnerProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [actionFeedback, setActionFeedback] = useState<ActionFeedback>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);

    useEffect(() => {
        loadPartners();
    }, []);

    async function loadPartners() {
        try {
            setLoading(true);
            const { data, error } = await (supabase
                .from('legal_partner_profiles')
                .select(`
          *,
          profiles:id (
            full_name,
            avatar_url
          )
        `) as any)
                .order('onboarded_at', { ascending: false });

            if (error) throw error;
            setPartners((data as any[]).map(d => ({
                ...d,
                full_name: d.profiles?.full_name,
                avatar_url: d.profiles?.avatar_url
            })));
        } catch (err) {
            logger.error("Failed to load partners:", err);
        } finally {
            setLoading(false);
        }
    }

    async function handleVerify(partnerId: string, status: 'verified' | 'rejected') {
        setProcessingId(partnerId);
        setActionFeedback(null);
        try {
            const { error } = await (supabase
                .from('legal_partner_profiles')
                .update({ verification_status: status } as any)
                .eq('id', partnerId));

            if (error) throw error;

            setActionFeedback({
                partnerId,
                status,
                message: status === 'verified'
                    ? 'Partner verified — they can now be discovered in the Legal Marketplace.'
                    : 'Application rejected — partner will not appear in the marketplace.',
            });
            loadPartners();

            // Auto-dismiss feedback after 5 seconds
            setTimeout(() => setActionFeedback(null), 5000);
        } catch (err: any) {
            logger.error("Failed to update status:", err);
            setActionFeedback({ partnerId, status: 'error', message: err?.message || 'Failed to update status. Please try again.' });
        } finally {
            setProcessingId(null);
        }
    }

    const filteredPartners = partners.filter(p =>
        p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.firm_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-8 pb-12">
            <div>
                <h1 className="text-3xl font-bold dash-text mb-2">Partner Verification</h1>
                <p className="dash-text-secondary">Review and verify external legal partner applications.</p>
            </div>

            {actionFeedback && (
                <div className={`flex items-start gap-3 px-5 py-4 rounded-2xl border text-sm font-medium ${
                    actionFeedback.status === 'verified'
                        ? 'bg-[var(--color-success-soft)] border-[var(--color-success)] text-[var(--color-success)]'
                        : actionFeedback.status === 'rejected'
                        ? 'bg-[var(--color-warning-soft)] border-[var(--color-warning)] text-[var(--color-warning)]'
                        : 'bg-[var(--color-danger-soft)] border-[var(--color-danger)] text-[var(--color-danger)]'
                }`}>
                    {actionFeedback.status === 'verified' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        : actionFeedback.status === 'rejected' ? <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        : <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                    <span>{actionFeedback.message}</span>
                </div>
            )}

            <div className="flex gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 dash-text-tertiary" />
                    <input
                        type="text"
                        placeholder="Search partners..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full rounded-2xl pl-12 pr-4 py-3 dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-success)] dash-card"
                    />
                </div>
            </div>

            <div className="dash-card rounded-3xl overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-alt)' }}>
                            <th className="px-6 py-4 text-left text-xs font-bold dash-text-tertiary uppercase tracking-widest">Partner</th>
                            <th className="px-6 py-4 text-left text-xs font-bold dash-text-tertiary uppercase tracking-widest">Type / Firm</th>
                            <th className="px-6 py-4 text-left text-xs font-bold dash-text-tertiary uppercase tracking-widest">Specialties</th>
                            <th className="px-6 py-4 text-left text-xs font-bold dash-text-tertiary uppercase tracking-widest">Status</th>
                            <th className="px-6 py-4 text-right text-xs font-bold dash-text-tertiary uppercase tracking-widest">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                        {loading ? (
                            <tr><td colSpan={5} className="px-6 py-12 text-center dash-text-tertiary">Loading partners...</td></tr>
                        ) : filteredPartners.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-12 text-center dash-text-tertiary">No applications found.</td></tr>
                        ) : (
                            filteredPartners.map(partner => (
                                <tr key={partner.id} className="hover:bg-[var(--color-hover-bg)] transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-[var(--color-success)]/20 overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                                                <img src={partner.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(partner.full_name || "")}&background=random`} className="w-full h-full object-cover" alt={partner.full_name} />
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold dash-text">{partner.full_name}</div>
                                                <div className="text-[10px] dash-text-tertiary uppercase tracking-wider">{partner.contact_email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm dash-text">{partner.partner_type === 'firm' ? 'Law Firm' : 'Individual'}</div>
                                        <div className="text-xs dash-text-tertiary">{partner.firm_name || 'N/A'}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {partner.specialties.slice(0, 2).map(s => (
                                                <span key={s} className="px-2 py-0.5 rounded text-[10px] dash-text-secondary" style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>{s}</span>
                                            ))}
                                            {partner.specialties.length > 2 && <span className="text-[10px] dash-text-tertiary">+{partner.specialties.length - 2}</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {partner.verification_status === 'verified' ? (
                                            <span className="flex items-center gap-1 text-[var(--color-success)] text-xs font-bold">
                                                <CheckCircle2 className="w-3 h-3" /> Verified
                                            </span>
                                        ) : partner.verification_status === 'rejected' ? (
                                            <span className="flex items-center gap-1 text-[var(--color-danger)] text-xs font-bold">
                                                <XCircle className="w-3 h-3" /> Rejected
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-[var(--color-warning)] text-xs font-bold">
                                                <Clock className="w-3 h-3" /> Pending Review
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-end gap-2">
                                            {partner.verification_status !== 'verified' && (
                                                <button
                                                    onClick={() => handleVerify(partner.id, 'verified')}
                                                    disabled={processingId === partner.id}
                                                    className="p-2 rounded-lg bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-[var(--color-success)] hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                    title="Verify Partner"
                                                >
                                                    <ShieldCheck className="w-4 h-4" />
                                                </button>
                                            )}
                                            {partner.verification_status !== 'rejected' && (
                                                <button
                                                    onClick={() => handleVerify(partner.id, 'rejected')}
                                                    disabled={processingId === partner.id}
                                                    className="p-2 rounded-lg bg-[var(--color-danger)]/10 text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                    title="Reject Application"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
