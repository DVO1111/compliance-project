import { useState, useEffect } from "react";
import {
    Search,
    ShieldCheck,
    MapPin,
    Scale,
    ExternalLink,
    Users,
    CheckCircle2,
    Clock
} from "lucide-react";
import {
    fetchVerifiedPartners,
    LegalPartnerProfile,
    MarketplaceConnection,
    fetchCompanyConnections,
    updateAutoAssign
} from "../../lib/legalMarketplaceService";
import { useAuth } from "../../contexts/AuthContext";
import PartnerDetailsModal from "./PartnerDetailsModal";
import { logger } from '../../lib/logger';

export default function LegalMarketplacePage() {
    const { profile } = useAuth();
    const [partners, setPartners] = useState<LegalPartnerProfile[]>([]);
    const [connections, setConnections] = useState<MarketplaceConnection[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedPartner, setSelectedPartner] = useState<LegalPartnerProfile | null>(null);
    const [filterSpecialty, setFilterSpecialty] = useState("All");
    const [view, setView] = useState<'browse' | 'network'>('browse');

    useEffect(() => {
        loadPartners();
        if (profile?.organization_id) {
            loadConnections();
        }
    }, [profile?.organization_id]);

    async function loadPartners() {
        try {
            setLoading(true);
            const data = await fetchVerifiedPartners();
            setPartners(data);
        } catch (err) {
            logger.error("Failed to load partners:", err);
        } finally {
            setLoading(false);
        }
    }

    async function loadConnections() {
        try {
            if (!profile?.organization_id) return;
            const data = await fetchCompanyConnections(profile.organization_id);
            setConnections(data);
        } catch (err) {
            logger.error("Failed to load connections:", err);
        }
    }

    async function handleAutoAssignChange(connId: string, freq: any) {
        try {
            await updateAutoAssign(connId, freq);
            loadConnections();
        } catch (err) {
            logger.error("Failed to update auto-assign:", err);
        }
    }

    const filteredPartners = partners.filter(p => {
        const matchesSearch = p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.firm_name?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSpecialty = filterSpecialty === "All" || p.specialties.includes(filterSpecialty);
        return matchesSearch && matchesSpecialty;
    });

    const allSpecialties = ["All", ...new Set(partners.flatMap(p => p.specialties))];

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-3xl font-bold dash-text mb-2">Compliance Counsel Marketplace</h1>
                    <p className="dash-text-secondary">Connect with verified external legal professionals and compliance firms.</p>
                </div>
                <div className="flex p-1 rounded-2xl dash-card">
                    <button
                        onClick={() => setView('browse')}
                        className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${view === 'browse' ? 'bg-[var(--color-success)] text-white shadow-lg' : 'dash-text-tertiary hover:dash-text'}`}
                    >
                        Browse Partners
                    </button>
                    <button
                        onClick={() => setView('network')}
                        className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${view === 'network' ? 'bg-[var(--color-success)] text-white shadow-lg' : 'dash-text-tertiary hover:dash-text'}`}
                    >
                        My Network {connections.length > 0 && <span className="ml-1 opacity-60">({connections.length})</span>}
                    </button>
                </div>
            </div>

            {view === 'browse' ? (
                <>
                    {/* Search & Filters */}
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 dash-text-tertiary" />
                            <input
                                type="text"
                                placeholder="Search by name, firm, or expertise..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full rounded-2xl pl-12 pr-4 py-4 dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-success)] dash-card"
                            />
                        </div>
                        <div className="flex gap-2">
                            <select
                                value={filterSpecialty}
                                onChange={e => setFilterSpecialty(e.target.value)}
                                className="rounded-2xl px-6 py-4 dash-text focus:outline-none transition-colors cursor-pointer dash-card"
                            >
                                {allSpecialties.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Partners Grid */}
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[1, 2, 3].map(i => <div key={i} className="h-80 dash-card animate-pulse rounded-3xl" />)}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredPartners.map(partner => (
                                <div key={partner.id} className="dash-card rounded-3xl p-6 hover:border-[var(--color-success)] transition-all group cursor-pointer" onClick={() => setSelectedPartner(partner)}>
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="w-16 h-16 rounded-2xl overflow-hidden bg-[var(--color-success)]/20">
                                            <img src={partner.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(partner.full_name || "")}&background=random`} className="w-full h-full object-cover" alt={partner.full_name} />
                                        </div>
                                        <div className="flex gap-1.5">
                                            <span className="bg-[var(--color-success)]/10 text-[var(--color-success)] px-3 py-1 rounded-full text-xs font-bold border border-[var(--color-success)]/20 flex items-center gap-1">
                                                <ShieldCheck className="w-3 h-3" /> Verified
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-xl font-bold dash-text group-hover:text-[var(--color-success)] transition-colors line-clamp-1">{partner.full_name}</h3>
                                        {partner.firm_name && <p className="dash-text-secondary text-sm mb-2">{partner.firm_name}</p>}
                                        <div className="flex items-center gap-2 dash-text-tertiary text-xs mb-4">
                                            <MapPin className="w-3 h-3" /> {partner.jurisdictions.join(", ")}
                                        </div>

                                        <div className="flex flex-wrap gap-1.5 mb-6">
                                            {partner.specialties.slice(0, 3).map(s => (
                                                <span key={s} className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider dash-text-secondary" style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>{s}</span>
                                            ))}
                                            {partner.specialties.length > 3 && <span className="dash-text-tertiary text-[10px] self-center">+{partner.specialties.length - 3} more</span>}
                                        </div>

                                        <div className="flex items-center justify-between pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                                            <div>
                                                <div className="text-[10px] dash-text-tertiary uppercase tracking-widest font-bold">Starting Rate</div>
                                                <div className="dash-text font-bold">${partner.hourly_rate}<span className="dash-text-tertiary font-medium font-sans">/hr</span></div>
                                            </div>
                                            <button className="btn-primary hover:scale-[1.02] transition-all px-4 py-2 rounded-xl text-[11px] font-bold flex items-center gap-2 shadow-lg shadow-[var(--color-success)]/10">
                                                Connect
                                                <ExternalLink className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!loading && filteredPartners.length === 0 && (
                        <div className="text-center py-20 dash-card rounded-3xl border-2 border-dashed" style={{ borderColor: 'var(--color-border)' }}>
                            <Scale className="w-12 h-12 dash-text-tertiary mx-auto mb-4" style={{ opacity: 0.3 }} />
                            <h3 className="text-xl font-bold dash-text mb-2">No partners found</h3>
                            <p className="dash-text-secondary">Try adjusting your search filters to find more professionals.</p>
                        </div>
                    )}
                </>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {connections.length === 0 && (
                            <div className="md:col-span-2 text-center py-20 dash-card rounded-3xl border-2 border-dashed" style={{ borderColor: 'var(--color-border)' }}>
                                <Users className="w-12 h-12 dash-text-tertiary mx-auto mb-4" style={{ opacity: 0.3 }} />
                                <h3 className="text-xl font-bold dash-text mb-2">No connected partners yet</h3>
                                <p className="dash-text-secondary mb-6">Browse the marketplace and request connections to build your legal network.</p>
                                <button onClick={() => setView('browse')} className="btn-primary px-8 py-3 rounded-2xl font-bold">Explore Marketplace</button>
                            </div>
                        )}
                        {connections.map(conn => (
                            <div key={conn.id} className="dash-card p-6 rounded-3xl hover:border-[var(--color-success)]/40 transition-all flex flex-col gap-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-2xl overflow-hidden" style={{ border: '2px solid var(--color-border)' }}>
                                            <img src={conn.partner_profile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(conn.partner_profile?.full_name || "")}&background=random`} className="w-full h-full object-cover" alt={conn.partner_profile?.full_name} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold dash-text">{conn.partner_profile?.full_name}</h3>
                                            <p className="dash-text-secondary text-xs">{conn.partner_profile?.firm_name || "Individual Consultant"}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] dash-text-tertiary uppercase tracking-widest font-bold mb-1">Status</div>
                                        <div className="text-[var(--color-success)] text-xs font-bold flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" /> Active Connection
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2 dash-text text-sm font-semibold">
                                            <Clock className="w-4 h-4 text-[var(--color-success)]" />
                                            Auto-Assignment
                                        </div>
                                        <div className="text-[10px] bg-[var(--color-success)]/10 text-[var(--color-success)] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Enabled</div>
                                    </div>
                                    <p className="dash-text-tertiary text-xs mb-4">Automatically assign this partner to your weekly or monthly legal review tasks.</p>
                                    <select
                                        value={conn.auto_assign_frequency}
                                        onChange={(e) => handleAutoAssignChange(conn.id, e.target.value as any)}
                                        className="w-full rounded-xl px-4 py-2.5 text-sm dash-text focus:outline-none" style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}
                                    >
                                        <option value="none">No Auto-Assign</option>
                                        <option value="on_demand">On Demand</option>
                                        <option value="monthly">Monthly Recurring</option>
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {selectedPartner && (
                <PartnerDetailsModal
                    partner={selectedPartner}
                    onClose={() => setSelectedPartner(null)}
                    companyId={profile?.organization_id || ""}
                />
            )}
        </div>
    );
}
