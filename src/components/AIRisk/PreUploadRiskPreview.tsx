// src/components/AIRisk/PreUploadRiskPreview.tsx
// Live risk indicator shown alongside the upload form.
// Debounced Gemini call (800ms) gives real-time risk preview as the marketer types.

import { useState, useEffect, useRef } from 'react';
import { Sparkles, AlertTriangle, CheckCircle, Shield } from 'lucide-react';
import { previewRisk, type PreviewResult } from '../../lib/aiRiskService';

interface PreUploadRiskPreviewProps {
    contentText: string;
    jurisdiction?: string;
}

export default function PreUploadRiskPreview({ contentText, jurisdiction = 'nigeria' }: PreUploadRiskPreviewProps) {
    const [result, setResult] = useState<PreviewResult | null>(null);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => {
        if (contentText.trim().length < 20) {
            setResult(null);
            return;
        }

        setLoading(true);
        if (debounceRef.current) clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(async () => {
            try {
                const r = await previewRisk(contentText, jurisdiction);
                setResult(r);
            } catch {
                setResult(null);
            } finally {
                setLoading(false);
            }
        }, 800);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [contentText, jurisdiction]);

    if (!contentText || contentText.trim().length < 20) return null;

    const score = result?.score ?? 0;
    const isMedium = score >= 30 && score < 60;
    const isHigh = score >= 60;

    return (
        <div className={`rounded-xl border p-4 transition-all duration-300 ${loading ? 'border-[var(--color-border)] bg-[var(--color-surface-alt)]' :
            isHigh ? 'border-[var(--color-danger)]/20 bg-[var(--color-danger-soft)]/50' :
                isMedium ? 'border-[var(--color-warning)]/20 bg-[var(--color-warning-soft)]/50' :
                    'border-[var(--color-success)]/20 bg-[var(--color-success-soft)]/50'
            }`}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
                <div className={`p-1.5 rounded-lg ${loading ? 'bg-[var(--color-surface-alt)]' :
                    isHigh ? 'bg-[var(--color-danger-soft)]' :
                        isMedium ? 'bg-[var(--color-warning-soft)]' :
                            'bg-[var(--color-success-soft)]'
                    }`}>
                    <Sparkles className={`w-4 h-4 ${loading ? 'text-[var(--color-text-tertiary)] animate-pulse' :
                        isHigh ? 'text-[var(--color-danger)]' :
                            isMedium ? 'text-[var(--color-warning)]' :
                                'text-[var(--color-success)]'
                        }`} />
                </div>
                <div>
                    <p className="text-xs font-semibold text-[var(--color-text-secondary)]">AI Risk Preview</p>
                    <p className="text-[10px] text-[var(--color-text-tertiary)]">
                        {loading ? 'Analyzing…' : 'Real-time compliance assessment'}
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 py-2">
                    <div className="animate-spin w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full" />
                    <span className="text-xs text-[var(--color-text-secondary)]">Scanning content for compliance risks…</span>
                </div>
            ) : result ? (
                <>
                    {/* Risk Meter */}
                    <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-[var(--color-text-secondary)] font-medium">Risk Score</span>
                            <span className={`text-sm font-bold ${isHigh ? 'text-[var(--color-danger)]' :
                                isMedium ? 'text-[var(--color-warning)]' :
                                    'text-[var(--color-success)]'
                                }`}>
                                {score}/100
                            </span>
                        </div>
                        <div className="w-full h-2 bg-[var(--color-surface-alt)] rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${isHigh ? 'bg-gradient-to-r from-red-400 to-[var(--color-danger)]' :
                                    isMedium ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                                        'bg-gradient-to-r from-emerald-400 to-emerald-500'
                                    }`}
                                style={{ width: `${score}%` }}
                            />
                        </div>
                    </div>

                    {/* Top Issues */}
                    {result.topIssues.length > 0 ? (
                        <div className="space-y-1.5">
                            <p className="text-[10px] text-[var(--color-text-secondary)] font-medium uppercase tracking-wider">Issues Detected</p>
                            {result.topIssues.map((issue, i) => (
                                <div key={i} className="flex items-start gap-2">
                                    <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isHigh ? 'text-[var(--color-danger)]' : 'text-[var(--color-warning)]'
                                        }`} />
                                    <span className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{issue}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 py-1">
                            <CheckCircle className="w-4 h-4 text-[var(--color-success)]" />
                            <span className="text-xs text-[var(--color-success)] font-medium">No issues detected</span>
                        </div>
                    )}

                    {/* Sentiment */}
                    <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex items-center gap-1.5">
                        <Shield className="w-3 h-3 text-[var(--color-text-tertiary)]" />
                        <span className="text-[10px] text-[var(--color-text-tertiary)]">
                            Sentiment: <span className="font-medium text-[var(--color-text-secondary)] capitalize">{result.sentiment}</span>
                        </span>
                    </div>
                </>
            ) : null}
        </div>
    );
}
