// src/components/Upload/SubstantiationPanel.tsx
// Forces copywriters to link flagged claims to approved sources before sending to Legal.

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Link2, BookOpen, ExternalLink } from 'lucide-react';

export interface Substantiation {
    claimIndex: number;
    phrase: string;
    sourceUrl: string;
    citationType: 'peer_reviewed' | 'clinical_trial' | 'product_label' | 'internal_data' | 'regulatory_guidance';
}

interface FlaggedIssue {
    issue: string;
    severity: string;
    regulation_cited: string;
    suggestion: string;
}

interface SubstantiationPanelProps {
    issues: FlaggedIssue[];
    onSubstantiationsChange: (substantiations: Substantiation[], allComplete: boolean) => void;
}

const CITATION_TYPE_OPTIONS: { value: Substantiation['citationType']; label: string }[] = [
    { value: 'peer_reviewed', label: 'Peer-Reviewed Publication' },
    { value: 'clinical_trial', label: 'Clinical Trial Data' },
    { value: 'product_label', label: 'Approved Product Label' },
    { value: 'internal_data', label: 'Internal Company Data' },
    { value: 'regulatory_guidance', label: 'Regulatory Guidance' },
];

export default function SubstantiationPanel({ issues, onSubstantiationsChange }: SubstantiationPanelProps) {
    const [substantiations, setSubstantiations] = useState<Map<number, Substantiation>>(new Map());

    // Only red/high-severity issues require substantiation
    const requiredIssues = issues.filter(
        (i) => i.severity === 'Red' || i.severity === 'High' || i.severity === 'Critical'
    );

    const allComplete = requiredIssues.length === 0 || requiredIssues.every((_, idx) => {
        const sub = substantiations.get(idx);
        return sub && sub.sourceUrl.trim().length > 0 && sub.citationType;
    });

    const notifyParent = useCallback(() => {
        const arr = Array.from(substantiations.values());
        onSubstantiationsChange(arr, allComplete);
    }, [substantiations, allComplete, onSubstantiationsChange]);

    useEffect(() => {
        notifyParent();
    }, [notifyParent]);

    const updateSubstantiation = (idx: number, field: 'sourceUrl' | 'citationType', value: string) => {
        setSubstantiations((prev) => {
            const next = new Map(prev);
            const existing = next.get(idx) || {
                claimIndex: idx,
                phrase: requiredIssues[idx]?.issue || '',
                sourceUrl: '',
                citationType: 'peer_reviewed' as Substantiation['citationType'],
            };
            (existing as any)[field] = value;
            next.set(idx, existing);
            return next;
        });
    };

    if (requiredIssues.length === 0) {
        return (
            <div className="rounded-xl border border-[var(--color-success)]/20 bg-[var(--color-success-soft)] p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-[var(--color-success)] shrink-0" />
                <div>
                    <p className="text-sm font-semibold text-[var(--color-success)]">No substantiation required</p>
                    <p className="text-xs text-[var(--color-success)] mt-0.5">
                        No critical claims were flagged. You may send to Legal directly.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-behance-amber-200 bg-behance-amber-50/50 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3 border-b border-behance-amber-200 bg-behance-amber-100/50 flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-behance-amber-200/50">
                    <BookOpen className="w-4 h-4 text-behance-amber-700" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-behance-amber-900">Claim Substantiation Required</p>
                    <p className="text-xs text-behance-amber-700">
                        {requiredIssues.length} critical claim{requiredIssues.length !== 1 ? 's' : ''} must be linked to approved sources before you can send to Legal.
                    </p>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                    {allComplete ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--color-success-soft)] text-[var(--color-success)]">
                            <CheckCircle className="w-3 h-3" /> All sourced
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--color-danger-soft)] text-[var(--color-danger)]">
                            <AlertTriangle className="w-3 h-3" /> {requiredIssues.length - Array.from(substantiations.values()).filter(s => s.sourceUrl.trim()).length} remaining
                        </span>
                    )}
                </div>
            </div>

            {/* Claims list */}
            <div className="divide-y divide-amber-200/60">
                {requiredIssues.map((issue, idx) => {
                    const sub = substantiations.get(idx);
                    const isComplete = sub && sub.sourceUrl.trim().length > 0;

                    return (
                        <div key={idx} className={`px-5 py-4 ${isComplete ? 'bg-[var(--color-success-soft)]/30' : 'dash-card/50'}`}>
                            <div className="flex items-start gap-3 mb-3">
                                <div className={`mt-0.5 shrink-0 ${isComplete ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                                    {isComplete ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold dash-text">{issue.issue}</p>
                                    <p className="text-xs dash-text-secondary mt-0.5 font-mono">{issue.regulation_cited}</p>
                                </div>
                                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${issue.severity === 'Red' ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : 'bg-behance-amber-100 text-behance-amber-700'
                                    }`}>
                                    {issue.severity}
                                </span>
                            </div>

                            <div className="ml-7 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-semibold dash-text-secondary uppercase tracking-wider block mb-1">
                                        <Link2 className="w-3 h-3 inline mr-1" />Source URL / DOI
                                    </label>
                                    <input
                                        type="url"
                                        value={sub?.sourceUrl || ''}
                                        onChange={(e) => updateSubstantiation(idx, 'sourceUrl', e.target.value)}
                                        placeholder="https://doi.org/... or publication URL"
                                        className="w-full border dash-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)] outline-none transition"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold dash-text-secondary uppercase tracking-wider block mb-1">
                                        <ExternalLink className="w-3 h-3 inline mr-1" />Citation Type
                                    </label>
                                    <select
                                        value={sub?.citationType || 'peer_reviewed'}
                                        onChange={(e) => updateSubstantiation(idx, 'citationType', e.target.value)}
                                        className="w-full border dash-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)] outline-none transition"
                                    >
                                        {CITATION_TYPE_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

