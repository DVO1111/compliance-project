// src/lib/benchmarkService.ts
// Anonymized compliance benchmark scoring.
// Computes percentile rankings across all tenants without exposing raw content.

import { supabase } from './supabase';

// ── Types ────────────────────────────────────────────────────────────────

export interface BenchmarkScore {
    overall: number;              // percentile rank 0-100
    avgRiskScore: number;
    totalSubmissions: number;
    compliantRate: number;        // percentage
    categoryScores: Record<string, number>; // category → score (0-100)
    industryAvg: number;
    industryType: string | null;
    lastCalculated: string;
}

export interface IndustryAverage {
    industry: string;
    avgRiskScore: number;
    compliantRate: number;
    companyCount: number;
}

// ── Benchmark Computation ────────────────────────────────────────────────

/**
 * Recalculate the benchmark stats for a given company.
 * Reads from content_submissions and ai_risk_assessments.
 */
export async function updateCompanyBenchmark(companyId: string): Promise<void> {
    // 1. Count submissions
    const { data: submissions } = await (supabase as any)
        .from('content_submissions')
        .select('id, status, ai_risk_score')
        .limit(1000);

    const total = submissions?.length || 0;
    const compliant = (submissions || []).filter(
        (s: any) => s.status === 'approved' || s.status === 'clean'
    ).length;

    const scores = (submissions || [])
        .filter((s: any) => s.ai_risk_score != null)
        .map((s: any) => s.ai_risk_score as number);

    const avgRisk = scores.length > 0
        ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length
        : 0;

    // 2. Get industry type from company profile (via profiles)
    const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('industry_type')
        .eq('company_id', companyId)
        .limit(1)
        .maybeSingle();

    const industryType = profile?.industry_type || null;

    // 3. Compute category scores from ai_risk_assessments
    const { data: assessments } = await (supabase as any)
        .from('ai_risk_assessments')
        .select('intent_violations')
        .eq('company_id', companyId)
        .limit(500);

    const categoryCounts: Record<string, { total: number; count: number }> = {};
    for (const a of assessments || []) {
        for (const v of (a.intent_violations || []) as any[]) {
            const cat = v.type || 'general';
            if (!categoryCounts[cat]) categoryCounts[cat] = { total: 0, count: 0 };
            categoryCounts[cat].count++;
            categoryCounts[cat].total++;
        }
    }

    const categoryScores: Record<string, number> = {};
    for (const [cat, data] of Object.entries(categoryCounts)) {
        // Inverse: fewer violations = higher score
        categoryScores[cat] = Math.max(0, 100 - (data.count * 5));
    }

    // 4. Upsert benchmark record
    await (supabase as any)
        .from('compliance_benchmarks')
        .upsert({
            company_id: companyId,
            total_submissions: total,
            compliant_count: compliant,
            avg_risk_score: Math.round(avgRisk * 100) / 100,
            category_scores: categoryScores,
            industry_type: industryType,
            last_calculated: new Date().toISOString(),
        }, { onConflict: 'company_id' });

    // 5. Recalculate percentile rank
    await recalculatePercentiles();
}

/**
 * Recalculate percentile rankings for all companies.
 */
async function recalculatePercentiles(): Promise<void> {
    const { data: all } = await (supabase as any)
        .from('compliance_benchmarks')
        .select('company_id, avg_risk_score')
        .order('avg_risk_score', { ascending: true }); // lower risk = better

    if (!all || all.length === 0) return;

    const total = all.length;
    for (let i = 0; i < all.length; i++) {
        const percentile = Math.round(((total - i) / total) * 100);
        await (supabase as any)
            .from('compliance_benchmarks')
            .update({ percentile_rank: percentile })
            .eq('company_id', all[i].company_id);
    }
}

// ── Queries ──────────────────────────────────────────────────────────────

/**
 * Get the percentile rank and benchmark score for a company.
 */
export async function getPercentileRank(companyId: string): Promise<BenchmarkScore> {
    const { data } = await (supabase as any)
        .from('compliance_benchmarks')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

    if (!data) {
        // If no benchmark exists, compute it
        await updateCompanyBenchmark(companyId);
        const { data: fresh } = await (supabase as any)
            .from('compliance_benchmarks')
            .select('*')
            .eq('company_id', companyId)
            .maybeSingle();

        return formatBenchmark(fresh);
    }

    return formatBenchmark(data);
}

/**
 * Get anonymized industry averages for all industries.
 */
export async function getIndustryAverages(): Promise<IndustryAverage[]> {
    const { data } = await (supabase as any)
        .from('compliance_benchmarks')
        .select('industry_type, avg_risk_score, total_submissions, compliant_count');

    if (!data || data.length === 0) return [];

    // Group by industry
    const byIndustry: Record<string, { totalRisk: number; totalSub: number; totalComp: number; count: number }> = {};

    for (const row of data) {
        const ind = row.industry_type || 'other';
        if (!byIndustry[ind]) byIndustry[ind] = { totalRisk: 0, totalSub: 0, totalComp: 0, count: 0 };
        byIndustry[ind].totalRisk += row.avg_risk_score || 0;
        byIndustry[ind].totalSub += row.total_submissions || 0;
        byIndustry[ind].totalComp += row.compliant_count || 0;
        byIndustry[ind].count++;
    }

    return Object.entries(byIndustry).map(([industry, d]) => ({
        industry,
        avgRiskScore: Math.round((d.totalRisk / d.count) * 100) / 100,
        compliantRate: d.totalSub > 0 ? Math.round((d.totalComp / d.totalSub) * 100) : 0,
        companyCount: d.count,
    }));
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatBenchmark(row: any): BenchmarkScore {
    if (!row) {
        return {
            overall: 50,
            avgRiskScore: 0,
            totalSubmissions: 0,
            compliantRate: 0,
            categoryScores: {},
            industryAvg: 50,
            industryType: null,
            lastCalculated: new Date().toISOString(),
        };
    }

    const compliantRate = row.total_submissions > 0
        ? Math.round((row.compliant_count / row.total_submissions) * 100)
        : 100;

    return {
        overall: row.percentile_rank || 50,
        avgRiskScore: row.avg_risk_score || 0,
        totalSubmissions: row.total_submissions || 0,
        compliantRate,
        categoryScores: row.category_scores || {},
        industryAvg: 50, // will be enriched by caller if needed
        industryType: row.industry_type,
        lastCalculated: row.last_calculated || row.updated_at || '',
    };
}
