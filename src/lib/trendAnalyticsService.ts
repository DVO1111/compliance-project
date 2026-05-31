// src/lib/trendAnalyticsService.ts
// Violation trend aggregation + AI-powered training recommendations.
// Reads from content_submissions + ai_risk_assessments to compute trends,
// then asks Gemini for personalized training focus areas.

import { supabase } from './supabase';
import { generateJSON } from './geminiClient';

// ── Types ────────────────────────────────────────────────────────────────

export interface ViolationTrendPoint {
    month: string;          // 'YYYY-MM'
    category: string;
    count: number;
    severity: Record<string, number>;
}

export interface TopViolation {
    category: string;
    count: number;
    trend: 'up' | 'down' | 'stable';
    topPhrases: string[];
}

export interface TrainingRecommendation {
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    relatedViolation: string;
}

export interface TrendSummary {
    trends: ViolationTrendPoint[];
    topViolations: TopViolation[];
    recommendations: TrainingRecommendation[];
    totalViolationsThisMonth: number;
    changeFromLastMonth: number; // percentage change
}

// ── Trend Computation ────────────────────────────────────────────────────

/**
 * Aggregate violation trends for a company over the last N months.
 * Pulls data from violation_trends table (materialized) or computes from
 * ai_risk_assessments + content_submissions on the fly.
 */
export async function computeViolationTrends(
    companyId: string,
    months: number = 6
): Promise<ViolationTrendPoint[]> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    // Try materialized trends first
    const { data: materialized } = await (supabase as any)
        .from('violation_trends')
        .select('*')
        .eq('company_id', companyId)
        .gte('period_start', cutoff.toISOString().slice(0, 10))
        .order('period_start', { ascending: true });

    if (materialized && materialized.length > 0) {
        return materialized.map((row: any) => ({
            month: row.period_start.slice(0, 7),
            category: row.category,
            count: row.violation_count,
            severity: row.severity_breakdown || {},
        }));
    }

    // Fallback: compute from ai_risk_assessments
    const { data: assessments } = await (supabase as any)
        .from('ai_risk_assessments')
        .select('intent_violations, created_at')
        .eq('company_id', companyId)
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: true });

    if (!assessments || assessments.length === 0) return [];

    const monthMap: Record<string, Record<string, { count: number; severity: Record<string, number> }>> = {};

    for (const a of assessments) {
        const month = a.created_at.slice(0, 7);
        const violations: any[] = a.intent_violations || [];

        for (const v of violations) {
            const cat = v.type || 'general';
            if (!monthMap[month]) monthMap[month] = {};
            if (!monthMap[month][cat]) monthMap[month][cat] = { count: 0, severity: {} };
            monthMap[month][cat].count++;
            const sev = v.severity || 'medium';
            monthMap[month][cat].severity[sev] = (monthMap[month][cat].severity[sev] || 0) + 1;
        }
    }

    const trends: ViolationTrendPoint[] = [];
    for (const [month, cats] of Object.entries(monthMap)) {
        for (const [category, data] of Object.entries(cats)) {
            trends.push({ month, category, count: data.count, severity: data.severity });
        }
    }

    return trends.sort((a, b) => a.month.localeCompare(b.month));
}

// ── Top Violation Categories ─────────────────────────────────────────────

/**
 * Get the top N most frequent violation categories for a company this month.
 */
export async function getTopViolationCategories(
    companyId: string,
    limit: number = 5
): Promise<TopViolation[]> {
    const trends = await computeViolationTrends(companyId, 2);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

    const currentCounts: Record<string, number> = {};
    const lastCounts: Record<string, number> = {};

    for (const t of trends) {
        if (t.month === currentMonth) currentCounts[t.category] = (currentCounts[t.category] || 0) + t.count;
        if (t.month === lastMonthStr) lastCounts[t.category] = (lastCounts[t.category] || 0) + t.count;
    }

    return Object.entries(currentCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([category, count]) => {
            const prev = lastCounts[category] || 0;
            const trend = count > prev ? 'up' : count < prev ? 'down' : 'stable';
            return { category, count, trend, topPhrases: [] };
        });
}

// ── AI Training Recommendations ──────────────────────────────────────────

const TRAINING_PROMPT = (violations: string) => `
You are a compliance training advisor for a pharmaceutical/healthcare marketing team.
Based on the violation trends below, recommend exactly 3 training focus areas.

--- VIOLATION TRENDS ---
${violations}
--- END ---

Return JSON only:
{
  "recommendations": [
    {
      "title": "<short training title>",
      "description": "<2-3 sentence description of what to cover>",
      "priority": "<high|medium|low>",
      "relatedViolation": "<violation category this addresses>"
    }
  ]
}
`;

/**
 * Generate AI-powered training recommendations based on violation trends.
 */
export async function generateTrainingRecommendations(
    companyId: string
): Promise<TrainingRecommendation[]> {
    const topViolations = await getTopViolationCategories(companyId, 10);

    if (topViolations.length === 0) {
        return [{
            title: 'General Compliance Refresher',
            description: 'No significant violation patterns detected. Consider a general compliance refresher to maintain awareness.',
            priority: 'low',
            relatedViolation: 'general',
        }];
    }

    try {
        const violationSummary = topViolations
            .map(v => `${v.category}: ${v.count} violations (trend: ${v.trend})`)
            .join('\n');

        const result = await generateJSON<{ recommendations: TrainingRecommendation[] }>(
            TRAINING_PROMPT(violationSummary)
        );

        return result.recommendations || [];
    } catch {
        // Fallback: rule-based recommendations
        return topViolations.slice(0, 3).map(v => ({
            title: `${v.category.replace(/_/g, ' ')} Compliance Training`,
            description: `Your team had ${v.count} ${v.category.replace(/_/g, ' ')} violations this month. Focus on understanding the regulatory requirements in this area.`,
            priority: v.count > 5 ? 'high' as const : 'medium' as const,
            relatedViolation: v.category,
        }));
    }
}

// ── Full Trend Summary ───────────────────────────────────────────────────

/**
 * Get the complete trend analytics summary for the dashboard.
 */
export async function getTrendSummary(companyId: string): Promise<TrendSummary> {
    const trends = await computeViolationTrends(companyId, 6);
    const topViolations = await getTopViolationCategories(companyId, 5);
    const recommendations = await generateTrainingRecommendations(companyId);

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

    const totalThisMonth = trends
        .filter(t => t.month === currentMonth)
        .reduce((sum, t) => sum + t.count, 0);

    const totalLastMonth = trends
        .filter(t => t.month === lastMonthStr)
        .reduce((sum, t) => sum + t.count, 0);

    const changeFromLastMonth = totalLastMonth > 0
        ? ((totalThisMonth - totalLastMonth) / totalLastMonth) * 100
        : 0;

    return {
        trends,
        topViolations,
        recommendations,
        totalViolationsThisMonth: totalThisMonth,
        changeFromLastMonth: Math.round(changeFromLastMonth),
    };
}
