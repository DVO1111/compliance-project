// src/components/LegalReview/VersionDiffViewer.tsx
// Side-by-side diff view for content versions
import { useEffect, useState } from 'react';
import { GitBranch, ChevronDown } from 'lucide-react';
import { getVersionHistory, computeLineDiff, type ContentVersion, type DiffResult } from '../../lib/versionService';

interface VersionDiffViewerProps {
    submissionId: string;
}

export default function VersionDiffViewer({ submissionId }: VersionDiffViewerProps) {
    const [versions, setVersions] = useState<ContentVersion[]>([]);
    const [oldIdx, setOldIdx] = useState(0);
    const [newIdx, setNewIdx] = useState(1);
    const [diff, setDiff] = useState<DiffResult | null>(null);
    const [loading, setLoading] = useState(true);

    // Load versions
    useEffect(() => {
        let mounted = true;
        (async () => {
            setLoading(true);
            const vs = await getVersionHistory(submissionId);
            if (!mounted) return;
            setVersions(vs);
            if (vs.length >= 2) {
                setOldIdx(vs.length - 2);
                setNewIdx(vs.length - 1);
            } else if (vs.length === 1) {
                setOldIdx(0);
                setNewIdx(0);
            }
            setLoading(false);
        })();
        return () => { mounted = false; };
    }, [submissionId]);

    // Compute diff when selection changes
    useEffect(() => {
        if (versions.length < 1) return;
        const oldV = versions[oldIdx];
        const newV = versions[newIdx];
        if (!oldV || !newV) return;

        const oldText = oldV.corrected_text || oldV.content_text;
        const newText = newV.corrected_text || newV.content_text;
        const result = computeLineDiff(oldText, newText);
        result.oldVersion = oldV.version_number;
        result.newVersion = newV.version_number;
        setDiff(result);
    }, [versions, oldIdx, newIdx]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12 dash-text-tertiary">
                <div className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full mr-2" />
                Loading versions…
            </div>
        );
    }

    if (versions.length === 0) {
        return (
            <div className="text-center py-12 dash-text-secondary">
                <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No version history available yet.</p>
                <p className="text-xs dash-text-tertiary mt-1">Versions are created when content is sent for legal review.</p>
            </div>
        );
    }

    if (versions.length === 1) {
        return (
            <div className="text-center py-12 dash-text-secondary">
                <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Only one version exists. Diff will be available after resubmission.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Version selectors */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium dash-text-secondary">Old:</span>
                    <div className="relative">
                        <select
                            value={oldIdx}
                            onChange={(e) => setOldIdx(Number(e.target.value))}
                            className="appearance-none bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 text-[var(--color-danger)] text-xs font-medium rounded-lg px-3 py-1.5 pr-7 focus:ring-2 focus:ring-red-200 focus:border-[var(--color-danger)]/30"
                        >
                            {versions.map((v, i) => (
                                <option key={v.id} value={i}>
                                    v{v.version_number} — {new Date(v.created_at).toLocaleDateString()}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-danger)] pointer-events-none" />
                    </div>
                </div>

                <span className="dash-text-tertiary">→</span>

                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium dash-text-secondary">New:</span>
                    <div className="relative">
                        <select
                            value={newIdx}
                            onChange={(e) => setNewIdx(Number(e.target.value))}
                            className="appearance-none bg-[var(--color-success-soft)] border border-[var(--color-success)]/20 text-[var(--color-success)] text-xs font-medium rounded-lg px-3 py-1.5 pr-7 focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
                        >
                            {versions.map((v, i) => (
                                <option key={v.id} value={i}>
                                    v{v.version_number} — {new Date(v.created_at).toLocaleDateString()}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-success)] pointer-events-none" />
                    </div>
                </div>

                {diff && (
                    <div className="ml-auto flex items-center gap-3 text-xs dash-text-secondary">
                        <span className="text-[var(--color-success)]">+{diff.stats.added} added</span>
                        <span className="text-[var(--color-danger)]">−{diff.stats.removed} removed</span>
                        <span>{diff.stats.unchanged} unchanged</span>
                    </div>
                )}
            </div>

            {/* Diff display */}
            {diff && (
                <div className="border dash-border rounded-xl overflow-hidden">
                    <div className="grid grid-cols-2 text-[11px] font-semibold dash-text-secondary uppercase tracking-wider dash-surface-alt border-b dash-border">
                        <div className="px-4 py-2 border-r dash-border">v{diff.oldVersion} (old)</div>
                        <div className="px-4 py-2">v{diff.newVersion} (new)</div>
                    </div>
                    <div className="max-h-[420px] overflow-y-auto font-mono text-xs leading-relaxed">
                        {diff.oldLines.map((leftLine, i) => {
                            const rightLine = diff.newLines[i];
                            return (
                                <div key={i} className="grid grid-cols-2 min-h-[24px]">
                                    {/* Left (old) */}
                                    <div
                                        className={`flex border-r dash-border ${leftLine.type === 'removed'
                                                ? 'bg-[var(--color-danger-soft)]'
                                                : leftLine.type === 'added'
                                                    ? 'dash-surface-alt'
                                                    : ''
                                            }`}
                                    >
                                        <span className="w-10 shrink-0 text-right pr-2 py-0.5 dash-text-tertiary select-none border-r dash-border">
                                            {leftLine.lineNumber ?? ''}
                                        </span>
                                        <span className={`flex-1 px-2 py-0.5 whitespace-pre-wrap break-all ${leftLine.type === 'removed' ? 'text-[var(--color-danger)]' : 'dash-text'
                                            }`}>
                                            {leftLine.type === 'removed' && <span className="text-[var(--color-danger)] mr-1">−</span>}
                                            {leftLine.text}
                                        </span>
                                    </div>
                                    {/* Right (new) */}
                                    <div
                                        className={`flex ${rightLine?.type === 'added'
                                                ? 'bg-[var(--color-success-soft)]'
                                                : rightLine?.type === 'removed'
                                                    ? 'dash-surface-alt'
                                                    : ''
                                            }`}
                                    >
                                        <span className="w-10 shrink-0 text-right pr-2 py-0.5 dash-text-tertiary select-none border-r dash-border">
                                            {rightLine?.lineNumber ?? ''}
                                        </span>
                                        <span className={`flex-1 px-2 py-0.5 whitespace-pre-wrap break-all ${rightLine?.type === 'added' ? 'text-[var(--color-success)]' : 'dash-text'
                                            }`}>
                                            {rightLine?.type === 'added' && <span className="text-[var(--color-success)] mr-1">+</span>}
                                            {rightLine?.text ?? ''}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

