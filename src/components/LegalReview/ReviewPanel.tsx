import { useEffect, useMemo, useState } from 'react';
import {
  X,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  User,
  FileText,
  Calendar,
  Scale,
  Lock,
  RotateCcw,
  Ban,
  Send,
  Pencil,
  MessageSquare,
} from 'lucide-react';
import SignoffBadge from '../Archive/SignoffBadge';
import type { Database } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { CommentsPanel } from '../Comments/CommentsPanel';
import { logger } from '../../lib/logger';

type ContentSubmission = Database['public']['Tables']['content_submissions']['Row'];
type ComplianceReport = Database['public']['Tables']['compliance_reports']['Row'];
type LegalReview = Database['public']['Tables']['legal_reviews']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

interface ReviewItem {
  submission: ContentSubmission;
  report: ComplianceReport | null;
  review: LegalReview;
  submitter: Profile | null;
}

interface ReviewPanelProps {
  item: ReviewItem;
  onClose: () => void;
  onApprove: (comments: string) => Promise<void>;
  onReject: (comments: string) => Promise<void>;
  onAmend: (comments: string) => Promise<void>;
}

function formatDate(d?: string | null) {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function shortId(id?: string | null) {
  if (!id) return '—';
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export default function ReviewPanel({ item, onClose, onApprove, onReject, onAmend }: ReviewPanelProps) {
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [tab, setTab] = useState<'corrected' | 'original' | 'ai' | 'comments'>('corrected');

  // corrected metadata
  const correctedText = (((item.submission as any)?.corrected_text as string) ?? '').trim();
  const correctedAt = (item.submission as any)?.corrected_at as string | null | undefined;
  const correctedBy = (item.submission as any)?.corrected_by as string | null | undefined;

  const submittedForLegalAt = (item.submission as any)?.submitted_for_legal_at as string | null | undefined;
  const submittedForLegalBy = (item.submission as any)?.submitted_for_legal_by as string | null | undefined;
  const legalDecidedAt = (item.submission as any)?.legal_decided_at as string | null | undefined;
  const legalDecidedBy = (item.submission as any)?.legal_decided_by as string | null | undefined;

  const isLocked = Boolean((item.submission as any)?.is_locked);

  // ✅ IMPORTANT: treat both awaiting_legal and in_review as "pending"
  const signoff = item.submission.signoff_status;
  const isPending = signoff === 'awaiting_legal' || signoff === 'in_review';

  const canSubmit = useMemo(() => comments.trim().length > 0, [comments]);

  // ✅ Human-readable names for UUID fields
  const [correctorName, setCorrectorName] = useState<string>('—');
  const [submittedByName, setSubmittedByName] = useState<string>('—');
  const [legalDecidedByName, setLegalDecidedByName] = useState<string>('—');

  useEffect(() => {
    let mounted = true;

    const loadNames = async () => {
      setCorrectorName('—');
      setSubmittedByName('—');
      setLegalDecidedByName('—');

      const ids = [correctedBy, submittedForLegalBy, legalDecidedBy].filter(Boolean) as string[];
      if (ids.length === 0) return;

      const { data, error } = await supabase.from('profiles').select('id, full_name, email').in('id', ids);

      if (!mounted) return;

      if (error) {
        logger.error('Failed to load profile names:', error);
        setCorrectorName(correctedBy ? shortId(correctedBy) : '—');
        setSubmittedByName(submittedForLegalBy ? shortId(submittedForLegalBy) : '—');
        setLegalDecidedByName(legalDecidedBy ? shortId(legalDecidedBy) : '—');
        return;
      }

      const map = new Map((data || []).map((p: any) => [p.id, p.full_name || p.email || shortId(p.id)]));
      setCorrectorName(correctedBy ? (map.get(correctedBy) || shortId(correctedBy)) : '—');
      setSubmittedByName(submittedForLegalBy ? (map.get(submittedForLegalBy) || shortId(submittedForLegalBy)) : '—');
      setLegalDecidedByName(legalDecidedBy ? (map.get(legalDecidedBy) || shortId(legalDecidedBy)) : '—');
    };

    loadNames();

    return () => {
      mounted = false;
    };
  }, [correctedBy, submittedForLegalBy, legalDecidedBy]);

  const handleApprove = async () => {
    try {
      setSubmitting(true);
      await onApprove(comments.trim());
    } finally {
      setSubmitting(false);
    }
  };

  const handleAmendLocal = async () => {
    if (!canSubmit) return;
    try {
      setSubmitting(true);
      await onAmend(comments.trim());
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectLocal = async () => {
    if (!canSubmit) return;

    const ok = window.confirm('Rejecting means: DO NOT PUBLISH.\n\nAre you sure you want to reject?');
    if (!ok) return;

    try {
      setSubmitting(true);
      await onReject(comments.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="dash-card rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 dash-card border-b dash-border px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-behance-amber-50 p-2 rounded-lg">
              <Scale className="w-5 h-5 text-behance-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold dash-text">Legal Review</h3>
              <p className="text-xs dash-text-secondary">Original content, corrected version, AI guidance, and discussion</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 dash-text-tertiary hover:dash-text-secondary hover:dash-surface-alt rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-6">
            {/* Summary */}
            <div className="dash-surface-alt rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-lg font-semibold dash-text mb-1">{item.submission.title}</h4>
                  <div className="flex items-center gap-3 text-sm dash-text-secondary">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {item.submitter?.full_name || 'Unknown'}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
                      {item.submission.platform}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(item.submission.created_at || '').toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <SignoffBadge status={item.submission.signoff_status || ''} size="md" />
                  {isLocked && <Lock className="w-4 h-4 text-behance-amber-500" />}
                </div>
              </div>

              {/* ✅ Signature metadata */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full dash-card border dash-border dash-text">
                  <Pencil className="w-3.5 h-3.5 dash-text-secondary" />
                  Corrected by: <span className="font-semibold">{correctedText ? correctorName : '—'}</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full dash-card border dash-border dash-text">
                  Corrected at:{' '}
                  <span className="font-semibold">{correctedText ? formatDate(correctedAt || null) : '—'}</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full dash-card border dash-border dash-text">
                  <Send className="w-3.5 h-3.5 dash-text-secondary" />
                  Sent for legal:{' '}
                  <span className="font-semibold">{submittedForLegalAt ? formatDate(submittedForLegalAt) : '—'}</span>
                  {submittedForLegalBy ? <span className="dash-text-secondary"> • {submittedByName}</span> : null}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full dash-card border dash-border dash-text">
                  <Scale className="w-3.5 h-3.5 dash-text-secondary" />
                  Legal decision:{' '}
                  <span className="font-semibold">{legalDecidedAt ? formatDate(legalDecidedAt) : '—'}</span>
                  {legalDecidedBy ? <span className="dash-text-secondary"> • {legalDecidedByName}</span> : null}
                </span>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setTab('corrected')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  tab === 'corrected' ? 'bg-[var(--color-behance-blue)] text-white' : 'dash-surface-alt dash-text hover:bg-[var(--color-surface-alt)]'
                }`}
              >
                Corrected (Marketing)
              </button>
              <button
                onClick={() => setTab('original')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  tab === 'original' ? 'bg-[var(--color-behance-blue)] text-white' : 'dash-surface-alt dash-text hover:bg-[var(--color-surface-alt)]'
                }`}
              >
                Original
              </button>
              <button
                onClick={() => setTab('ai')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  tab === 'ai' ? 'bg-[var(--color-behance-blue)] text-white' : 'dash-surface-alt dash-text hover:bg-[var(--color-surface-alt)]'
                }`}
              >
                AI Guidance
              </button>
              <button
                onClick={() => setTab('comments')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 ${
                  tab === 'comments' ? 'bg-[var(--color-behance-blue)] text-white' : 'dash-surface-alt dash-text hover:bg-[var(--color-surface-alt)]'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                Comments
              </button>
            </div>

            {/* Panels */}
            {tab === 'corrected' && (
              <div>
                <h5 className="text-xs font-semibold dash-text-secondary uppercase tracking-wider mb-2">
                  Corrected Content (Marketing)
                </h5>

                {correctedText ? (
                  <div className="bg-[var(--color-success-soft)] border border-[var(--color-success)]/20 rounded-lg p-4 text-sm dash-text leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {correctedText}
                  </div>
                ) : (
                  <div className="bg-behance-amber-50 border border-behance-amber-200 rounded-lg p-4 text-sm text-behance-amber-800">
                    No corrected version was saved. Marketing must save a corrected version before sending to Legal.
                  </div>
                )}
              </div>
            )}

            {tab === 'original' && (
              <div>
                <h5 className="text-xs font-semibold dash-text-secondary uppercase tracking-wider mb-2">
                  Original Content (Uploaded)
                </h5>
                <div className="dash-card border dash-border rounded-lg p-4 text-sm dash-text leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {item.submission.content_text}
                </div>
              </div>
            )}

            {tab === 'ai' && (
              <div>
                <h5 className="text-xs font-semibold dash-text-secondary uppercase tracking-wider mb-2">
                  Compliance Guidance (AI Report)
                </h5>

                {!item.report ? (
                  <div className="text-sm dash-text-secondary">No compliance report available.</div>
                ) : (
                  <div className="border dash-border rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          item.report.overall_risk === 'low'
                            ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
                            : item.report.overall_risk === 'medium'
                            ? 'bg-behance-amber-50 text-behance-amber-700'
                            : item.report.overall_risk === 'high'
                            ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'
                            : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                        }`}
                      >
                        {item.report.overall_risk} risk
                      </span>
                    </div>

                    {(item.report.issues as unknown as any[])?.length > 0 && (
                      <div className="space-y-2 mb-4">
                        <h6 className="text-sm font-medium dash-text">Issues ({(item.report.issues as unknown as any[]).length})</h6>
                        {(item.report.issues as unknown as any[]).map((issue, i) => (
                          <div
                            key={i}
                            className={`rounded-lg p-3 ${
                              issue.severity === 'Red'
                                ? 'bg-[var(--color-danger-soft)] border-l-3 border-l-red-500'
                                : 'bg-behance-amber-50 border-l-3 border-l-amber-500'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium dash-text">{issue.issue}</p>
                              {issue.severity === 'Red' ? (
                                <AlertCircle className="w-4 h-4 text-[var(--color-danger)] shrink-0" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 text-behance-amber-500 shrink-0" />
                              )}
                            </div>
                            <p className="text-xs dash-text-secondary mt-1">{issue.regulation_cited}</p>
                            <div className="mt-2 dash-card/60 rounded p-2">
                              <p className="text-xs text-[var(--color-success)]">{issue.suggestion}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {(item.report.suggested_rewrites as unknown as any[])?.length > 0 && (
                      <div className="space-y-2">
                        <h6 className="text-sm font-medium dash-text">Suggested Rewrites</h6>
                        {(item.report.suggested_rewrites as unknown as any[]).map((rw, i) => (
                          <div key={i} className="bg-[var(--color-info-soft)] rounded-lg p-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <p className="text-[10px] font-semibold dash-text-secondary uppercase mb-0.5">Original</p>
                                <p className="text-xs dash-text">{rw.original}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold dash-text-secondary uppercase mb-0.5">Suggested</p>
                                <p className="text-xs text-[var(--color-success)] font-medium">{rw.suggested}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === 'comments' && (
              <div className="border dash-border rounded-xl p-4">
                <CommentsPanel submissionId={item.submission.id} companyId={(item.submission as any).company_id} />
              </div>
            )}

            {/* Previous review comments */}
            {item.review.status !== 'pending' && item.review.comments && (
              <div className="dash-surface-alt rounded-xl p-4">
                <h5 className="text-xs font-semibold dash-text-secondary uppercase tracking-wider mb-2">
                  Previous Review Comments
                </h5>
                <p className="text-sm dash-text">{item.review.comments}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        {isPending && (
          <div className="sticky bottom-0 dash-card border-t dash-border px-6 py-4 space-y-3 shrink-0">
            <div>
              <label className="text-xs font-semibold dash-text-secondary uppercase tracking-wider mb-1.5 block">
                Decision Notes (required for Amend / Reject)
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Write your decision notes for Marketing (what to change, what to avoid, why)..."
                rows={3}
                className="w-full text-sm border dash-border rounded-lg px-3 py-2
                  focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)] transition-all resize-none"
              />
              <p className="text-[11px] dash-text-secondary mt-2">
                Tip: For approvals, you can leave notes too (optional) so Marketing understands what passed.
              </p>
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <button
                onClick={handleAmendLocal}
                disabled={submitting || !canSubmit}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-[var(--color-warning)]/20 text-[var(--color-warning)]
                  rounded-lg hover:bg-[var(--color-warning-soft)] disabled:opacity-40 transition-colors text-sm font-medium"
              >
                <RotateCcw className="w-4 h-4" />
                {submitting ? 'Processing...' : 'Amend (Request Changes)'}
              </button>

              <button
                onClick={handleRejectLocal}
                disabled={submitting || !canSubmit}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-[var(--color-danger)]/20 text-[var(--color-danger)]
                  rounded-lg hover:bg-[var(--color-danger-soft)] disabled:opacity-40 transition-colors text-sm font-medium"
              >
                <Ban className="w-4 h-4" />
                {submitting ? 'Processing...' : 'Reject (Do Not Publish)'}
              </button>

              <button
                onClick={handleApprove}
                disabled={submitting}
                className="flex items-center justify-center gap-2 px-5 py-2 bg-[var(--color-success)] text-white
                  rounded-lg hover:bg-[var(--color-success)] disabled:opacity-50 transition-colors text-sm font-medium"
              >
                <CheckCircle className="w-4 h-4" />
                {submitting ? 'Processing...' : 'Approve & Sign Off'}
              </button>

              <button
                onClick={onClose}
                className="md:ml-auto px-4 py-2 text-sm dash-text-secondary hover:dash-text hover:dash-surface-alt rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>

            <p className="text-[11px] dash-text-secondary">
              * Amend keeps content editable by marketing. Reject locks content into the restricted bin.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

