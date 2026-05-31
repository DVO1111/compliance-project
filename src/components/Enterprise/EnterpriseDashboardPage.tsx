// src/components/Enterprise/EnterpriseDashboardPage.tsx
// Cross-unit executive dashboard — aggregated compliance across all brands
import { useState, useEffect, useCallback } from 'react';
import {
    Building2, BarChart3, Users, AlertTriangle, Clock, CheckCircle,
    TrendingUp, Shield, Globe, ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getOrgTree, getDescendantCompanyIds, type OrgTreeNode, type Brand } from '../../lib/hierarchyService';
import { getOrgSeatSummaries, type SeatAllocation } from '../../lib/seatManagementService';
import { logger } from '../../lib/logger';

interface EnterpriseDashboardPageProps {
    organizationId: string;
}

interface BrandStats {
    brandId: string;
    brandName: string;
    buName: string;
    jurisdictions: string[];
    total: number;
    approved: number;
    flagged: number;
    pending: number;
    complianceScore: number;
}

interface OrgOverview {
    totalSubmissions: number;
    totalApproved: number;
    totalFlagged: number;
    totalPending: number;
    overallScore: number;
    brandStats: BrandStats[];
    seatData: (SeatAllocation & { bu_name: string })[];
}

export default function EnterpriseDashboardPage({ organizationId }: EnterpriseDashboardPageProps) {
    const [tree, setTree] = useState<OrgTreeNode | null>(null);
    const [overview, setOverview] = useState<OrgOverview | null>(null);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [orgTree, companyIds, seatData] = await Promise.all([
                getOrgTree(organizationId),
                getDescendantCompanyIds(organizationId),
                getOrgSeatSummaries(organizationId),
            ]);

            setTree(orgTree);

            if (!orgTree || companyIds.length === 0) {
                setOverview({
                    totalSubmissions: 0, totalApproved: 0, totalFlagged: 0, totalPending: 0,
                    overallScore: 100, brandStats: [], seatData: seatData,
                });
                setLoading(false);
                return;
            }

            // Fetch submissions across all companies in this org
            const { data: submissions } = await supabase
                .from('content_submissions')
                .select('id, status, signoff_status, brand_id, company_id')
                .in('company_id', companyIds);

            const subs = (submissions || []) as any[];
            const totalSubmissions = subs.length;
            const totalApproved = subs.filter((s: any) => s.signoff_status === 'signed_off' || s.signoff_status === 'published').length;
            const totalFlagged = subs.filter((s: any) => s.status === 'flagged' || s.status === 'critical').length;
            const totalPending = subs.filter((s: any) => s.signoff_status === 'awaiting_legal' || s.signoff_status === 'in_review').length;
            const overallScore = totalSubmissions > 0 ? Math.round((totalApproved / totalSubmissions) * 100) : 100;

            // Per-brand stats
            const allBrands: (Brand & { buName: string })[] = orgTree.businessUnits.flatMap((bu) =>
                bu.brands.map((b) => ({ ...b, buName: bu.name }))
            );

            const brandStats: BrandStats[] = allBrands.map((brand) => {
                const brandSubs = subs.filter((s: any) => s.brand_id === brand.id);
                const total = brandSubs.length;
                const approved = brandSubs.filter((s: any) => s.signoff_status === 'signed_off' || s.signoff_status === 'published').length;
                const flagged = brandSubs.filter((s: any) => s.status === 'flagged' || s.status === 'critical').length;
                const pending = brandSubs.filter((s: any) => s.signoff_status === 'awaiting_legal' || s.signoff_status === 'in_review').length;
                return {
                    brandId: brand.id,
                    brandName: brand.name,
                    buName: brand.buName,
                    jurisdictions: brand.jurisdictions,
                    total,
                    approved,
                    flagged,
                    pending,
                    complianceScore: total > 0 ? Math.round((approved / total) * 100) : 100,
                };
            });

            setOverview({ totalSubmissions, totalApproved, totalFlagged, totalPending, overallScore, brandStats, seatData });
        } catch (err) {
            logger.error('EnterpriseDashboard load error:', err);
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => { loadData(); }, [loadData]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="animate-spin w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!tree || !overview) {
        return (
            <div className="text-center py-20 text-[var(--color-text-secondary)]">
                <Building2 className="w-12 h-12 mx-auto text-[var(--color-text-tertiary)] mb-3" />
                <p className="font-medium">No organization data</p>
                <p className="text-sm mt-1">Set up your organization hierarchy to view consolidated reporting.</p>
            </div>
        );
    }

    const scoreColor = (s: number) =>
        s >= 80 ? 'text-[var(--color-success)]' : s >= 60 ? 'text-[var(--color-warning)]' : 'text-[var(--color-danger)]';
    const scoreBg = (s: number) =>
        s >= 80 ? 'bg-[var(--color-success-soft)] border-[var(--color-success)]/20' : s >= 60 ? 'bg-[var(--color-warning-soft)] border-[var(--color-warning)]/20' : 'bg-[var(--color-danger-soft)] border-[var(--color-danger)]/20';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                        <Building2 className="w-6 h-6 text-[var(--color-purple)]" />
                        {tree.organization.name}
                    </h1>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                        {tree.businessUnits.length} business unit{tree.businessUnits.length !== 1 ? 's' : ''} ·{' '}
                        {tree.businessUnits.reduce((a, bu) => a + bu.brands.length, 0)} brands
                    </p>
                </div>
                <div className={`px-4 py-2 rounded-xl border ${scoreBg(overview.overallScore)}`}>
                    <p className="text-[10px] font-semibold uppercase text-[var(--color-text-secondary)]">Org Score</p>
                    <p className={`text-2xl font-bold ${scoreColor(overview.overallScore)}`}>
                        {overview.overallScore}%
                    </p>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Submissions', value: overview.totalSubmissions, icon: BarChart3, color: 'text-[var(--color-purple)]', bg: 'bg-[var(--color-purple)]/10' },
                    { label: 'Approved', value: overview.totalApproved, icon: CheckCircle, color: 'text-[var(--color-success)]', bg: 'bg-[var(--color-success-soft)]' },
                    { label: 'Flagged / Critical', value: overview.totalFlagged, icon: AlertTriangle, color: 'text-[var(--color-danger)]', bg: 'bg-[var(--color-danger-soft)]' },
                    { label: 'Pending Review', value: overview.totalPending, icon: Clock, color: 'text-[var(--color-warning)]', bg: 'bg-[var(--color-warning-soft)]' },
                ].map((kpi) => (
                    <div key={kpi.label} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className={`p-1.5 rounded-lg ${kpi.bg}`}>
                                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                            </div>
                            <p className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">{kpi.label}</p>
                        </div>
                        <p className="text-2xl font-bold text-[var(--color-text-primary)]">{kpi.value.toLocaleString()}</p>
                    </div>
                ))}
            </div>

            {/* Brand Compliance Heatmap */}
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm">
                <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[var(--color-purple)]" />
                    <h2 className="font-semibold text-[var(--color-text-primary)]">Brand Compliance Heatmap</h2>
                </div>
                <div className="p-5">
                    {overview.brandStats.length === 0 ? (
                        <p className="text-sm text-[var(--color-text-secondary)] text-center py-6">No brand data yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {overview.brandStats.map((bs) => (
                                <div key={bs.brandId} className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-[var(--color-surface-alt)] transition-colors">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs text-white font-bold shrink-0">
                                        {bs.brandName.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">{bs.brandName}</span>
                                            <span className="text-[10px] text-[var(--color-text-tertiary)]">· {bs.buName}</span>
                                        </div>
                                        <div className="flex items-center gap-1 mt-0.5">
                                            {bs.jurisdictions.slice(0, 3).map((j) => (
                                                <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] font-medium">{j}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className={`text-lg font-bold ${scoreColor(bs.complianceScore)}`}>
                                            {bs.complianceScore}%
                                        </div>
                                        <div className="text-[10px] text-[var(--color-text-tertiary)]">
                                            {bs.total} total · {bs.flagged} flagged
                                        </div>
                                    </div>
                                    {/* Progress bar */}
                                    <div className="w-24 shrink-0">
                                        <div className="h-2 bg-[var(--color-surface-alt)] rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${bs.complianceScore >= 80 ? 'bg-[var(--color-success)]' : bs.complianceScore >= 60 ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-danger)]'
                                                    }`}
                                                style={{ width: `${bs.complianceScore}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Seat Utilization */}
            {overview.seatData.length > 0 && (
                <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm">
                    <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center gap-2">
                        <Users className="w-4 h-4 text-[var(--color-purple)]" />
                        <h2 className="font-semibold text-[var(--color-text-primary)]">Seat Utilization by Business Unit</h2>
                    </div>
                    <div className="p-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {overview.seatData.map((seat) => {
                                const pct = seat.allocated_seats > 0
                                    ? Math.round((seat.used_seats / seat.allocated_seats) * 100)
                                    : 0;
                                const isOverLimit = seat.allocated_seats > 0 && seat.used_seats >= seat.allocated_seats;
                                return (
                                    <div
                                        key={seat.id}
                                        className={`rounded-xl border p-4 ${isOverLimit ? 'border-[var(--color-danger)]/20 bg-[var(--color-danger-soft)]' : 'border-[var(--color-border)] bg-[var(--color-surface-alt)]'}`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-[var(--color-text-primary)]">{seat.bu_name}</span>
                                            {seat.allocated_seats === 0 ? (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] font-medium">Unlimited</span>
                                            ) : (
                                                <span className="text-xs text-[var(--color-text-secondary)] font-medium">
                                                    {seat.used_seats}/{seat.allocated_seats}
                                                </span>
                                            )}
                                        </div>
                                        {seat.allocated_seats > 0 && (
                                            <div className="h-2 bg-[var(--color-surface-alt)] rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${isOverLimit ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-purple)]'}`}
                                                    style={{ width: `${Math.min(100, pct)}%` }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Org Structure Overview */}
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm">
                <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[var(--color-purple)]" />
                    <h2 className="font-semibold text-[var(--color-text-primary)]">Organization Structure</h2>
                </div>
                <div className="p-5 space-y-3">
                    {tree.businessUnits.map((bu) => (
                        <div key={bu.id} className="border border-[var(--color-border)] rounded-lg">
                            <div className="px-4 py-3 bg-[var(--color-surface-alt)] rounded-t-lg flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                                <span className="text-sm font-semibold text-[var(--color-text-primary)]">{bu.name}</span>
                                {bu.region && (
                                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-purple)]/10 text-[var(--color-purple)] font-medium">
                                        {bu.region}
                                    </span>
                                )}
                            </div>
                            <div className="divide-y divide-[var(--color-border)]">
                                {bu.brands.map((brand) => (
                                    <div key={brand.id} className="px-4 py-2.5 flex items-center gap-2.5">
                                        <ChevronRight className="w-3 h-3 text-[var(--color-text-tertiary)]" />
                                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-[8px] text-white font-bold">
                                            {brand.name.charAt(0)}
                                        </div>
                                        <span className="text-sm text-[var(--color-text-secondary)]">{brand.name}</span>
                                        <div className="ml-auto flex items-center gap-1">
                                            {brand.jurisdictions.map((j) => (
                                                <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] font-medium flex items-center gap-0.5">
                                                    <Globe className="w-2.5 h-2.5" /> {j}
                                                </span>
                                            ))}
                                        </div>
                                        {!brand.is_active && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-alt)] text-[var(--color-text-tertiary)] font-medium">Inactive</span>
                                        )}
                                    </div>
                                ))}
                                {bu.brands.length === 0 && (
                                    <div className="px-4 py-3 text-sm text-[var(--color-text-tertiary)] italic">No brands</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
