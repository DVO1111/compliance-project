import { useState, useEffect } from "react";
import {
    MessageSquare,
    Users,
    CheckCircle2,
    XCircle,
    Clock,
    Settings,
    Scale,
    ChevronRight,
    Building2
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import {
    fetchPartnerRequests,
    respondToRequest,
    MarketplaceRequest,
    LegalPartnerProfile
} from "../../lib/legalMarketplaceService";
import { supabase } from "../../lib/supabase";
import { logger } from '../../lib/logger';

export default function LegalPartnerDashboard({ onNavigateToMarketplace }: { onNavigateToMarketplace: () => void }) {
    const { user, profile } = useAuth();
    const [requests, setRequests] = useState<MarketplaceRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [partnerProfile, setPartnerProfile] = useState<LegalPartnerProfile | null>(null);
    const [activeTab, setActiveTab] = useState<'requests' | 'profile' | 'connections'>('requests');

    useEffect(() => {
        if (user) {
            loadData();
        }
    }, [user]);

    async function loadData() {
        const userId = user?.id;
        if (!userId) return;

        try {
            setLoading(true);
            const { data: profileData } = await (supabase
                .from('legal_partner_profiles')
                .select('*')
                .eq('id', userId)
                .single() as any);

            setPartnerProfile(profileData as any);

            const reqs = await fetchPartnerRequests(userId);
            setRequests(reqs);
        } catch (err) {
            logger.error("Failed to load dashboard data:", err);
        } finally {
            setLoading(false);
        }
    }

    async function handleResponse(requestId: string, status: 'accepted' | 'rejected') {
        const reply = window.prompt(`Message for the company (${status}):`);
        if (reply === null) return;

        try {
            await respondToRequest(requestId, status, reply);
            loadData();
        } catch (err) {
            logger.error("Failed to respond:", err);
        }
    }

    const pendingRequests = requests.filter(r => r.status === 'pending');
    const pastRequests = requests.filter(r => r.status !== 'pending');

    if (loading) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-success)]"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 dash-card p-8 rounded-3xl overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--color-success)]/5 rounded-full blur-3xl -mr-32 -mt-32" />

                <div className="flex items-center gap-6 relative z-10">
                    <div className="w-20 h-20 rounded-2xl bg-[var(--color-success)]/20 flex items-center justify-center border-2 border-[var(--color-success)]/30">
                        <Scale className="w-10 h-10 text-[var(--color-success)]" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold dash-text">Partner Control Center</h1>
                        <div className="flex items-center gap-2 dash-text-secondary mt-1">
                            <span className="bg-[var(--color-success)]/10 text-[var(--color-success)] px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-[var(--color-success)]/20">Verified Partner</span>
                            <span className="dash-text-tertiary">•</span>
                            <span className="text-sm font-medium">{profile?.full_name}</span>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 relative z-10">
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`dash-surface-alt hover:bg-[var(--color-hover-bg)] dash-text px-6 py-3 rounded-xl border dash-border transition-all font-medium flex items-center gap-2 ${activeTab === 'profile' ? 'bg-[var(--color-surface-alt)]' : ''}`}
                    >
                        <Settings className="w-4 h-4" />
                        Manage Profile
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="dash-card p-6 rounded-3xl">
                    <div className="dash-text-tertiary text-xs font-bold uppercase tracking-widest mb-1">Incoming Requests</div>
                    <div className="text-4xl font-bold dash-text">{pendingRequests.length}</div>
                    <p className="dash-text-secondary text-xs mt-2">Awaiting your action</p>
                </div>
                <div className="dash-card p-6 rounded-3xl">
                    <div className="dash-text-tertiary text-xs font-bold uppercase tracking-widest mb-1">Active Connections</div>
                    <div className="text-4xl font-bold dash-text">{requests.filter(r => r.status === 'accepted').length}</div>
                    <p className="dash-text-secondary text-xs mt-2">Companies currently onboarded</p>
                </div>
                <div className="dash-card p-6 rounded-3xl">
                    <div className="dash-text-tertiary text-xs font-bold uppercase tracking-widest mb-1">Marketplace Status</div>
                    <div className="text-xl font-bold text-[var(--color-success)] mt-2 flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5" /> {partnerProfile?.verification_status === 'verified' ? 'Visible' : 'Pending'}
                    </div>
                    <p className="dash-text-secondary text-xs mt-1">Verified & Searchable</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold dash-text flex items-center gap-3">
                            <MessageSquare className="w-5 h-5 text-[var(--color-success)]" />
                            Connection Requests
                        </h2>
                    </div>

                    <div className="space-y-4">
                        {pendingRequests.length === 0 && (
                            <div className="p-12 text-center dash-card rounded-3xl border-2 border-dashed" style={{ borderColor: 'var(--color-border)' }}>
                                <Clock className="w-12 h-12 dash-text-tertiary mx-auto mb-4" style={{ opacity: 0.3 }} />
                                <h3 className="dash-text font-bold">No pending requests</h3>
                                <p className="dash-text-tertiary text-sm">New collaboration invites will appear here.</p>
                            </div>
                        )}

                        {pendingRequests.map(req => (
                            <div key={req.id} className="dash-card p-6 rounded-3xl shadow-lg hover:shadow-xl transition-all">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
                                            <Building2 className="w-6 h-6 dash-text" />
                                        </div>
                                        <div>
                                            <h4 className="text-lg font-bold dash-text">{req.company_profiles?.organization || "Unknown Company"}</h4>
                                            <p className="dash-text-tertiary text-xs">Sent on {new Date(req.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleResponse(req.id, 'accepted')}
                                            className="bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-[var(--color-success)] hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition-all border border-[var(--color-success)]/20"
                                        >
                                            Accept
                                        </button>
                                        <button
                                            onClick={() => handleResponse(req.id, 'rejected')}
                                            className="dash-surface-alt dash-text-secondary hover:bg-[var(--color-hover-bg)] px-4 py-2 rounded-xl text-xs font-bold transition-all border dash-border"
                                        >
                                            Decline
                                        </button>
                                    </div>
                                </div>

                                <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface-alt)' }}>
                                    <p className="text-sm dash-text-secondary italic leading-relaxed">"{req.message || "No message included."}"</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {pastRequests.length > 0 && (
                        <div className="pt-8">
                            <h3 className="text-xs font-bold dash-text-tertiary uppercase tracking-widest mb-4">Past Activity</h3>
                            <div className="space-y-2">
                                {pastRequests.map(req => (
                                    <div key={req.id} className="flex items-center justify-between p-4 rounded-2xl opacity-60" style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
                                        <div className="flex items-center gap-3">
                                            {req.status === 'accepted' ? <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" /> : <XCircle className="w-4 h-4 text-[var(--color-danger)]" />}
                                            <span className="dash-text text-sm font-medium">{req.company_profiles?.organization}</span>
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${req.status === 'accepted' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                                            {req.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <div className="dash-card p-6 rounded-3xl">
                        <h3 className="text-lg font-bold dash-text mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5 text-[var(--color-success)]" />
                            Active Network
                        </h3>
                        <div className="space-y-4">
                            <div className="p-4 rounded-2xl text-center" style={{ background: 'var(--color-surface-alt)' }}>
                                <p className="dash-text-tertiary text-xs mb-3">You are currently connected to companies in your network.</p>
                                <button
                                    onClick={() => setActiveTab('connections')}
                                    className={`w-full dash-surface-alt hover:bg-[var(--color-hover-bg)] dash-text py-3 rounded-xl border dash-border text-xs font-bold transition-all ${activeTab === 'connections' ? 'bg-[var(--color-surface-alt)]' : ''}`}
                                >
                                    View All Connections
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="dash-card p-6 rounded-3xl overflow-hidden relative group cursor-pointer" onClick={onNavigateToMarketplace}>
                        <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-success)]/20 to-transparent opacity-0 group-hover:opacity-100 transition-all blur-xl" />
                        <div className="relative z-10">
                            <h3 className="text-lg font-bold dash-text mb-2">Marketplace View</h3>
                            <p className="dash-text-tertiary text-xs mb-4">See how your profile looks to potential clients in the marketplace.</p>
                            <div className="flex items-center text-[var(--color-success)] text-xs font-bold gap-1">
                                Enter Marketplace <ChevronRight className="w-3 h-3" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
