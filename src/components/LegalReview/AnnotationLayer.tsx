// src/components/LegalReview/AnnotationLayer.tsx
// Paragraph-anchored annotations with text selection + threaded replies
import { useEffect, useState, useRef, useCallback } from 'react';
import { MessageCircle, Send, CheckCircle, X, CornerDownRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Annotation {
    id: string;
    company_id: string;
    submission_id: string;
    author_id: string;
    anchor_paragraph: number;
    anchor_start: number;
    anchor_end: number;
    anchor_text: string;
    body: string;
    parent_id: string | null;
    is_resolved: boolean;
    resolved_by: string | null;
    created_at: string;
    author_name?: string;
}

interface AnnotationLayerProps {
    submissionId: string;
    companyId: string;
    currentUserId: string;
    contentText: string;
}

export default function AnnotationLayer({
    submissionId,
    companyId,
    currentUserId,
    contentText,
}: AnnotationLayerProps) {
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
    const [showComposer, setShowComposer] = useState(false);
    const [composerAnchor, setComposerAnchor] = useState<{
        paragraph: number;
        start: number;
        end: number;
        text: string;
        top: number;
    } | null>(null);
    const [newBody, setNewBody] = useState('');
    const [replyBody, setReplyBody] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    const paragraphs = contentText.split('\n').filter((p) => p.trim().length > 0);

    // Load annotations
    const loadAnnotations = useCallback(async () => {
        const { data } = await supabase
            .from('anchored_annotations')
            .select('*')
            .eq('submission_id', submissionId)
            .order('created_at', { ascending: true });

        if (!data) return;

        // Resolve author names
        const authorIds = [...new Set(data.map((a: any) => a.author_id))];
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', authorIds);

        const nameMap: Record<string, string> = {};
        (profiles || []).forEach((p: any) => {
            nameMap[p.id] = p.full_name || p.email || p.id.slice(0, 8);
        });

        setAnnotations(
            (data as any[]).map((a) => ({ ...a, author_name: nameMap[a.author_id] || a.author_id.slice(0, 8) }))
        );
    }, [submissionId]);

    useEffect(() => {
        loadAnnotations();

        // Real-time subscription
        const channel = supabase
            .channel(`annotations:${submissionId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'anchored_annotations',
                filter: `submission_id=eq.${submissionId}`,
            }, () => {
                loadAnnotations();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [submissionId, loadAnnotations]);

    // Handle text selection
    const handleMouseUp = () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !contentRef.current) return;

        const range = sel.getRangeAt(0);
        const text = sel.toString().trim();
        if (!text) return;

        // Find paragraph index
        const container = range.startContainer.parentElement;
        if (!container) return;
        const paragraphEl = container.closest('[data-para-idx]');
        if (!paragraphEl) return;

        const paraIdx = Number(paragraphEl.getAttribute('data-para-idx'));
        const paraText = paragraphs[paraIdx] || '';
        const start = paraText.indexOf(text);

        setComposerAnchor({
            paragraph: paraIdx,
            start: Math.max(start, 0),
            end: Math.max(start, 0) + text.length,
            text,
            top: paragraphEl.getBoundingClientRect().top - (contentRef.current?.getBoundingClientRect().top || 0),
        });
        setShowComposer(true);
        setNewBody('');
    };

    const handleSubmitAnnotation = async () => {
        if (!composerAnchor || !newBody.trim()) return;
        setSubmitting(true);
        try {
            await supabase.from('anchored_annotations').insert({
                company_id: companyId,
                submission_id: submissionId,
                author_id: currentUserId,
                anchor_paragraph: composerAnchor.paragraph,
                anchor_start: composerAnchor.start,
                anchor_end: composerAnchor.end,
                anchor_text: composerAnchor.text,
                body: newBody.trim(),
            } as any);
            setShowComposer(false);
            setComposerAnchor(null);
            setNewBody('');
            await loadAnnotations();
        } finally {
            setSubmitting(false);
        }
    };

    const handleReply = async (parentId: string) => {
        if (!replyBody.trim()) return;
        const parent = annotations.find((a) => a.id === parentId);
        if (!parent) return;
        setSubmitting(true);
        try {
            await supabase.from('anchored_annotations').insert({
                company_id: companyId,
                submission_id: submissionId,
                author_id: currentUserId,
                anchor_paragraph: parent.anchor_paragraph,
                anchor_start: parent.anchor_start,
                anchor_end: parent.anchor_end,
                anchor_text: parent.anchor_text,
                body: replyBody.trim(),
                parent_id: parentId,
            } as any);
            setReplyBody('');
            await loadAnnotations();
        } finally {
            setSubmitting(false);
        }
    };

    const handleResolve = async (id: string) => {
        await supabase
            .from('anchored_annotations')
            .update({ is_resolved: true, resolved_by: currentUserId } as any)
            .eq('id', id);
        await loadAnnotations();
    };

    // Group annotations: root annotations and their replies
    const rootAnnotations = annotations.filter((a) => !a.parent_id);
    const repliesFor = (id: string) => annotations.filter((a) => a.parent_id === id);

    // Get annotations for a specific paragraph
    const annotationsForPara = (idx: number) =>
        rootAnnotations.filter((a) => a.anchor_paragraph === idx && !a.is_resolved);

    return (
        <div className="relative" ref={contentRef}>
            {/* Content with selectable paragraphs */}
            <div
                onMouseUp={handleMouseUp}
                className="text-sm dash-text leading-relaxed whitespace-pre-wrap"
            >
                {paragraphs.map((para, idx) => {
                    const paraAnnotations = annotationsForPara(idx);
                    return (
                        <div key={idx} data-para-idx={idx} className="relative group mb-2">
                            <p className="cursor-text">{para}</p>
                            {paraAnnotations.length > 0 && (
                                <button
                                    onClick={() => setSelectedAnnotation(selectedAnnotation === paraAnnotations[0].id ? null : paraAnnotations[0].id)}
                                    className="absolute -right-1 top-0 p-1 rounded-full bg-behance-amber-100 text-behance-amber-600 hover:bg-behance-amber-200 transition-colors opacity-80 hover:opacity-100"
                                    title={`${paraAnnotations.length} annotation${paraAnnotations.length > 1 ? 's' : ''}`}
                                >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                    {paraAnnotations.length > 1 && (
                                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-behance-amber-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                                            {paraAnnotations.length}
                                        </span>
                                    )}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Floating annotation composer */}
            {showComposer && composerAnchor && (
                <div
                    className="absolute right-0 z-20 w-72 dash-card rounded-xl shadow-xl border dash-border p-3 space-y-2"
                    style={{ top: composerAnchor.top }}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold dash-text-secondary uppercase">New Annotation</span>
                        <button onClick={() => setShowComposer(false)} className="dash-text-tertiary hover:dash-text-secondary">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="bg-behance-amber-50 border-l-2 border-behance-amber-400 px-2 py-1 rounded text-xs text-behance-amber-800 italic truncate">
                        "{composerAnchor.text.slice(0, 100)}"
                    </div>
                    <textarea
                        value={newBody}
                        onChange={(e) => setNewBody(e.target.value)}
                        placeholder="Add your comment…"
                        rows={2}
                        className="w-full text-sm border dash-border rounded-lg px-2 py-1.5 resize-none focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)]"
                        autoFocus
                    />
                    <button
                        onClick={handleSubmitAnnotation}
                        disabled={!newBody.trim() || submitting}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[var(--color-behance-blue)] text-white rounded-lg text-xs font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors"
                    >
                        <Send className="w-3.5 h-3.5" />
                        Post Annotation
                    </button>
                </div>
            )}

            {/* Annotation thread panel */}
            {selectedAnnotation && (() => {
                const ann = annotations.find((a) => a.id === selectedAnnotation);
                if (!ann) return null;
                const replies = repliesFor(ann.id);

                return (
                    <div className="mt-4 border border-behance-amber-200 rounded-xl bg-behance-amber-50/30 p-4 space-y-3">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs font-semibold dash-text">{ann.author_name}</p>
                                <p className="text-[10px] dash-text-tertiary">{new Date(ann.created_at).toLocaleString()}</p>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => handleResolve(ann.id)}
                                    className="text-xs text-[var(--color-success)] hover:text-[var(--color-success)] flex items-center gap-1"
                                    title="Resolve"
                                >
                                    <CheckCircle className="w-3.5 h-3.5" /> Resolve
                                </button>
                                <button
                                    onClick={() => setSelectedAnnotation(null)}
                                    className="dash-text-tertiary hover:dash-text-secondary ml-2"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="dash-card rounded-lg border border-behance-amber-200 px-3 py-2">
                            <p className="text-[10px] text-behance-amber-600 italic mb-1">"{ann.anchor_text}"</p>
                            <p className="text-sm dash-text">{ann.body}</p>
                        </div>

                        {/* Replies */}
                        {replies.length > 0 && (
                            <div className="space-y-2 pl-4 border-l-2 border-behance-amber-200">
                                {replies.map((reply) => (
                                    <div key={reply.id} className="dash-card rounded-lg border dash-border px-3 py-2">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <CornerDownRight className="w-3 h-3 dash-text-tertiary" />
                                            <span className="text-xs font-medium dash-text">{reply.author_name}</span>
                                            <span className="text-[10px] dash-text-tertiary">{new Date(reply.created_at).toLocaleString()}</span>
                                        </div>
                                        <p className="text-sm dash-text">{reply.body}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Reply input */}
                        <div className="flex items-center gap-2">
                            <input
                                value={replyBody}
                                onChange={(e) => setReplyBody(e.target.value)}
                                placeholder="Reply…"
                                className="flex-1 text-sm border dash-border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)]"
                                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleReply(ann.id)}
                            />
                            <button
                                onClick={() => handleReply(ann.id)}
                                disabled={!replyBody.trim() || submitting}
                                className="px-3 py-1.5 bg-[var(--color-behance-blue)] text-white rounded-lg text-xs font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                            >
                                <Send className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                );
            })()}

            {/* Selection hint */}
            {!showComposer && (
                <p className="text-[10px] dash-text-tertiary mt-3 italic">
                    💡 Select text above to add a paragraph-anchored annotation
                </p>
            )}
        </div>
    );
}

