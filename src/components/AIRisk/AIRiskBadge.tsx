// src/components/AIRisk/AIRiskBadge.tsx
// Shows AI risk status: Pending | Score | Unavailable
// with optional Retry button for exec/compliance roles.

import { useState, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw, AlertTriangle, Clock } from 'lucide-react';
import {
    getAssessment,
    getJobStatus,
    enqueueAIJob,
    retryAssessment,
    type JobStatus,
} from '../../lib/aiRiskService';

interface AIRiskBadgeProps {
    submissionId: string;
    companyId?: string;
    compact?: boolean;
    canRetry?: boolean;  // true for exec/compliance roles
}

type BadgeState = 'loading' | 'pending' | 'score' | 'unavailable';

export default function AIRiskBadge({
    submissionId,
    companyId,
    compact = false,
    canRetry = false,
}: AIRiskBadgeProps) {
    const [badgeState, setBadgeState] = useState<BadgeState>('loading');
    const [score, setScore] = useState<number | null>(null);
    const [summary, setSummary] = useState('');
    const [showTooltip, setShowTooltip] = useState(false);
    const [retrying, setRetrying] = useState(false);

    const loadStatus = useCallback(async () => {
        try {
            // 1) Check for cached assessment first
            const assessment = await getAssessment(submissionId);
            if (assessment && assessment.ai_risk_score > 0) {
                setScore(assessment.ai_risk_score);
                setSummary(assessment.summary);
                setBadgeState('score');
                return;
            }

            // 2) Check job status
            const job = await getJobStatus(submissionId);
            if (!job) {
                // No job and no assessment — AI not yet requested
                setBadgeState('unavailable');
                return;
            }

            switch (job.status as JobStatus) {
                case 'queued':
                case 'running':
                    setBadgeState('pending');
                    break;
                case 'succeeded':
                    // Job done but we didn't find assessment above — try once more
                    const freshAssessment = await getAssessment(submissionId);
                    if (freshAssessment && freshAssessment.ai_risk_score > 0) {
                        setScore(freshAssessment.ai_risk_score);
                        setSummary(freshAssessment.summary);
                        setBadgeState('score');
                    } else {
                        setBadgeState('unavailable');
                    }
                    break;
                case 'dead':
                case 'failed':
                    setBadgeState('unavailable');
                    setSummary(job.last_error || 'AI analysis failed after max retries.');
                    break;
                default:
                    setBadgeState('unavailable');
            }
        } catch {
            setBadgeState('unavailable');
        }
    }, [submissionId]);

    useEffect(() => {
        loadStatus();

        // Poll every 10s while pending
        const interval = setInterval(() => {
            if (badgeState === 'pending') loadStatus();
        }, 10_000);

        return () => clearInterval(interval);
    }, [loadStatus, badgeState]);

    const handleRetry = async () => {
        if (!companyId || retrying) return;
        setRetrying(true);
        try {
            await retryAssessment(companyId, submissionId);
            setBadgeState('pending');
        } catch {
            // silent
        } finally {
            setRetrying(false);
        }
    };

    const handleEnqueue = async () => {
        if (!companyId) return;
        setRetrying(true);
        try {
            await enqueueAIJob(companyId, submissionId);
            setBadgeState('pending');
        } catch {
            // silent
        } finally {
            setRetrying(false);
        }
    };

    // ── Render States ─────────────────────────────────────

    if (badgeState === 'loading') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-surface-alt)] text-[var(--color-text-tertiary)] text-[10px] animate-pulse">
                <Sparkles className="w-3 h-3" /> AI…
            </span>
        );
    }

    if (badgeState === 'pending') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-info-soft)] text-[var(--color-info)] text-[10px] font-medium animate-pulse ring-1 ring-blue-200">
                <Clock className="w-3 h-3" />
                Analyzing…
            </span>
        );
    }

    if (badgeState === 'unavailable') {
        return (
            <div className="inline-flex items-center gap-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] text-[10px] font-medium ring-1 ring-gray-200">
                    <AlertTriangle className="w-3 h-3" />
                    AI N/A
                </span>
                {canRetry && companyId && (
                    <button
                        onClick={handleRetry}
                        disabled={retrying}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--color-purple)]/10 text-[var(--color-purple)] text-[9px] font-medium ring-1 ring-purple-200 hover:bg-[var(--color-purple)]/10 transition-colors disabled:opacity-50"
                        title="Retry AI analysis"
                    >
                        <RefreshCw className={`w-2.5 h-2.5 ${retrying ? 'animate-spin' : ''}`} />
                        Retry
                    </button>
                )}
                {!canRetry && companyId && badgeState === 'unavailable' && (
                    <button
                        onClick={handleEnqueue}
                        disabled={retrying}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--color-info-soft)] text-[var(--color-info)] text-[9px] font-medium ring-1 ring-blue-200 hover:bg-[var(--color-info-soft)] transition-colors disabled:opacity-50"
                        title="Request AI analysis"
                    >
                        <Sparkles className={`w-2.5 h-2.5 ${retrying ? 'animate-spin' : ''}`} />
                        Analyze
                    </button>
                )}
            </div>
        );
    }

    // badgeState === 'score'
    const color = score !== null && score >= 70 ? 'red' : score !== null && score >= 40 ? 'amber' : 'emerald';
    const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
        red: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]', ring: 'ring-red-200' },
        amber: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]', ring: 'ring-amber-200' },
        emerald: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]', ring: 'ring-emerald-200' },
    };
    const c = colorMap[color];

    return (
        <div className="relative inline-flex">
            <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className={`inline-flex items-center gap-1 ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'} rounded-full ${c.bg} ${c.text} text-[10px] font-semibold ring-1 ${c.ring} transition-all hover:shadow-sm cursor-default`}
            >
                <Sparkles className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
                {score}
            </button>

            {showTooltip && summary && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-xl bg-[var(--color-bg)] text-white text-xs shadow-xl z-50 pointer-events-none">
                    <div className="flex items-center gap-1.5 mb-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                        <span className="font-semibold text-purple-200">AI Risk Assessment</span>
                    </div>
                    <p className="text-[var(--color-text-tertiary)] leading-relaxed">{summary}</p>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-[var(--color-bg)] rotate-45 -mt-1" />
                </div>
            )}
        </div>
    );
}
