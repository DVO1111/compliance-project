// src/components/LegalReview/LegalReviewDetailPanel.tsx
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Lock,
  MessageSquare,
  Pencil,
  Scale,
  Send,
  User,
  GitBranch,
  Users,
  Zap,
} from 'lucide-react';
import type { Database } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import SignoffBadge from '../Archive/SignoffBadge';
import { CommentsPanel } from '../Comments/CommentsPanel';
import SlaIndicator from './SlaIndicator';
import ReviewAssignmentPanel from './ReviewAssignmentPanel';
import VersionDiffViewer from './VersionDiffViewer';
import AnnotationLayer from './AnnotationLayer';
import { logger } from '../../lib/logger';
import { recordAuditEvent } from '../../lib/auditService';

type ContentSubmission = Database['public']['Tables']['content_submissions']['Row'];
type ComplianceReport = Database['public']['Tables']['compliance_reports']['Row'];
type LegalReview = Database['public']['Tables']['legal_reviews']['Row'];

export type LegalReviewItem = {
  submission: ContentSubmission;
  report: ComplianceReport | null;
  latestReview: LegalReview | null;
  allReviews: LegalReview[];
  submitter: Database['public']['Tables']['profiles']['Row'] | null;
};

function formatDate(d?: string | null) {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos' })} • ${date.toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit' })}`;
}

function shortId(id?: string | null) {
  if (!id) return '—';
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export default function LegalReviewDetailPanel({
  item,
  companyId,
  currentUserId,
  canAssignReviewers,
  onApprove,
  onReject,
  onAmend,
}: {
  item: LegalReviewItem;
  companyId: string;
  currentUserId: string;
  canAssignReviewers: boolean;
  onApprove: (contentId: string, comments: string) => Promise<void>;
  onReject: (contentId: string, comments: string) => Promise<void>;
  onAmend: (contentId: string, comments: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<'overview' | 'corrected' | 'original' | 'ai' | 'comments' | 'history' | 'reviewers' | 'diff'>('overview');
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Review date picker state ──
  const [legalEvent, setLegalEvent] = useState<any>(null);
  const [reviewDateChoice, setReviewDateChoice] = useState<'now' | 'later' | null>(null);
  const [reviewDate, setReviewDate] = useState('');
  const [reviewTime, setReviewTime] = useState('09:00');
  const [savingReviewDate, setSavingReviewDate] = useState(false);
  const [reviewDateMsg, setReviewDateMsg] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    kind: 'approve' | 'reject' | 'amend';
    title: string;
    message: string;
    confirmLabel: string;
    confirmClass: string;
  } | null>(null);

  // ── AI finding overrides ──
  const [overrides, setOverrides] = useState<Map<number, { reason: string; overriddenBy: string; overriddenAt: string }>>(new Map());
  const [overrideForm, setOverrideForm] = useState<{ index: number; reason: string } | null>(null);
  const [savingOverride, setSavingOverride] = useState(false);

  // corrected metadata
  const correctedText = (((item.submission as any)?.corrected_text as string) ?? '').trim();
  const correctedAt = (item.submission as any)?.corrected_at as string | null | undefined;
  const correctedBy = (item.submission as any)?.corrected_by as string | null | undefined;

  const submittedForLegalAt = (item.submission as any)?.submitted_for_legal_at as string | null | undefined;
  const submittedForLegalBy = (item.submission as any)?.submitted_for_legal_by as string | null | undefined;
  const legalDecidedAt = (item.submission as any)?.legal_decided_at as string | null | undefined;
  const legalDecidedBy = (item.submission as any)?.legal_decided_by as string | null | undefined;

  const isLocked = Boolean((item.submission as any)?.is_locked);
  const slaDeadline = (item.submission as any)?.sla_deadline_at as string | null | undefined;

  const signoff = item.submission.signoff_status;
  const isPending = signoff === 'awaiting_legal' || signoff === 'in_review';
  const canSubmit = useMemo(() => comments.trim().length > 0, [comments]);

  // Resolve names for UUID metadata (best effort)
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

  // ── Load legal calendar event for date picker ──
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const { getLegalEventForSubmission } = await import('../../lib/calendarService');
        const evt = await getLegalEventForSubmission(companyId, item.submission.id);
        if (mounted) setLegalEvent(evt);
      } catch {
        // non-fatal
      }
    };
    load();
    return () => { mounted = false; };
  }, [companyId, item.submission.id]);

  // ── Load existing AI overrides from audit trail ──
  useEffect(() => {
    if (tab !== 'ai' || !item.report) return;
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('metadata, user_id, created_at')
        .eq('entity_id', item.report!.id)
        .eq('action', 'AI_FINDING_OVERRIDDEN')
        .order('created_at', { ascending: false });
      if (!mounted) return;
      const map = new Map<number, { reason: string; overriddenBy: string; overriddenAt: string }>();
      (data || []).forEach((entry: any) => {
        const idx = entry.metadata?.issue_index;
        if (typeof idx === 'number' && !map.has(idx)) {
          map.set(idx, {
            reason: entry.metadata?.override_reason || '',
            overriddenBy: entry.user_id,
            overriddenAt: entry.created_at,
          });
        }
      });
      setOverrides(map);
    };
    load();
    return () => { mounted = false; };
  }, [tab, item.report]);

  const handleOverrideSubmit = async () => {
    if (!overrideForm || !overrideForm.reason.trim() || !item.report) return;
    setSavingOverride(true);
    try {
      const issues = (item.report.issues as unknown as any[]) || [];
      await recordAuditEvent({
        userId: currentUserId,
        action: 'AI_FINDING_OVERRIDDEN',
        entityType: 'compliance_report',
        entityId: item.report.id,
        companyId,
        metadata: {
          issue_index: overrideForm.index,
          issue_text: issues[overrideForm.index]?.issue ?? '',
          override_reason: overrideForm.reason.trim(),
          content_id: item.submission.id,
        },
        captureEvidence: false,
      });
      setOverrides((prev) => {
        const next = new Map(prev);
        next.set(overrideForm.index, {
          reason: overrideForm.reason.trim(),
          overriddenBy: currentUserId,
          overriddenAt: new Date().toISOString(),
        });
        return next;
      });
      setOverrideForm(null);
    } catch (err: any) {
      logger.error('AI override failed:', err);
    } finally {
      setSavingOverride(false);
    }
  };

  const handleSaveReviewDate = async () => {
    if (!legalEvent) return;
    setSavingReviewDate(true);
    setReviewDateMsg('');
    try {
      const { acknowledgeForLegal } = await import('../../lib/calendarService');
      if (reviewDateChoice === 'now') {
        await acknowledgeForLegal(legalEvent.id, 'now', companyId);
      } else {
        if (!reviewDate) { setReviewDateMsg('Please select a date.'); setSavingReviewDate(false); return; }
        // FIX: Use new Date() to properly convert local time → UTC ISO string
        // Previously: `${reviewDate}T${reviewTime}:00.000Z` incorrectly treated local time as UTC
        const localDateTime = new Date(`${reviewDate}T${reviewTime}`);
        const dt = localDateTime.toISOString();
        // console.log('[LegalReviewDetailPanel] Saving review date:', { reviewDate, reviewTime, localDateTime: localDateTime.toString(), isoUTC: dt });
        await acknowledgeForLegal(legalEvent.id, dt, companyId);
      }

      // ── CRITICAL FIX: Instantly stamp the reviewer's ID on the submission so Marketing sees the avatar exactly right now ──
      const { supabase } = await import('../../lib/supabase');
      await supabase
        .from('content_submissions')
        .update({ legal_decided_by: currentUserId } as any)
        .eq('id', item.submission.id)
        .eq('company_id', companyId);

      // Refresh the event
      const { getLegalEventForSubmission } = await import('../../lib/calendarService');
      const updated = await getLegalEventForSubmission(companyId, item.submission.id);
      setLegalEvent(updated);
      setReviewDateChoice(null);
      setReviewDateMsg('Review date saved ✓');
      setTimeout(() => setReviewDateMsg(''), 3000);
    } catch (err: any) {
      setReviewDateMsg(err.message || 'Failed to save');
    } finally {
      setSavingReviewDate(false);
    }
  };

  const riskPill = (() => {
    if (!item.report?.overall_risk) return null;
    const r = item.report.overall_risk;
    const cls =
      r === 'low'
        ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
        : r === 'medium'
          ? 'bg-amber-100 text-amber-700'
          : r === 'high'
            ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'
            : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]';
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{r} risk</span>
    );
  })();

  const handle = (kind: 'approve' | 'reject' | 'amend') => {
    const note = comments.trim();
    if ((kind === 'reject' || kind === 'amend') && !note) return;

    const configs = {
      approve: {
        title: 'Approve & Sign Off',
        message: 'You are approving this content for publication. This action will be recorded in the immutable audit trail and marketing will be notified.',
        confirmLabel: 'Yes, Approve',
        confirmClass: 'bg-[var(--color-success)] hover:bg-[var(--color-success)]/90 text-white',
      },
      reject: {
        title: 'Reject Content',
        message: 'You are rejecting this content — it must NOT be published. This action will be recorded in the audit trail and the submitter will be notified.',
        confirmLabel: 'Yes, Reject',
        confirmClass: 'bg-[var(--color-danger)] hover:bg-[var(--color-danger)]/90 text-white',
      },
      amend: {
        title: 'Request Changes',
        message: 'You are sending this content back for revision. The submitter will be notified to make the requested changes.',
        confirmLabel: 'Yes, Request Changes',
        confirmClass: 'bg-[var(--color-warning)] hover:bg-[var(--color-warning)]/90 text-white',
      },
    };

    setConfirmModal({ kind, ...configs[kind] });
  };

  const handleConfirmed = async () => {
    if (!confirmModal) return;
    const { kind } = confirmModal;
    const note = comments.trim();
    setConfirmModal(null);
    try {
      setSubmitting(true);
      if (kind === 'approve') await onApprove(item.submission.id, note);
      if (kind === 'amend') await onAmend(item.submission.id, note);
      if (kind === 'reject') await onReject(item.submission.id, note);
      setComments('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dash-card rounded-2xl border dash-border/70 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b dash-border flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-behance-amber-50 shrink-0">
              <Scale className="w-5 h-5 text-behance-amber-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold dash-text truncate">{item.submission.title}</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs dash-text-secondary mt-0.5">
                <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" />{item.submitter?.full_name || 'Unknown'}</span>
                <span className="inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{item.submission.platform}</span>
                <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{new Date(item.submission.created_at || '').toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos' })}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {riskPill}
          <SlaIndicator deadlineAt={slaDeadline} size="md" />
          <SignoffBadge status={item.submission.signoff_status || ''} size="md" />
          {isLocked && <Lock className="w-4 h-4 text-behance-amber-500" />}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 py-3 border-b dash-border flex flex-wrap items-center gap-2">
        {([
          ['overview', 'Overview'],
          ['corrected', 'Corrected'],
          ['original', 'Original'],
          ['ai', 'AI Guidance'],
          ['reviewers', 'Reviewers'],
          ['diff', 'Diff'],
          ['comments', 'Comments'],
          ['history', 'Audit'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-behance-blue text-white' : 'dash-surface-alt dash-text hover:bg-[var(--color-surface-alt)]'
              }`}
          >
            {key === 'comments' ? (
              <span className="inline-flex items-center gap-2"><MessageSquare className="w-4 h-4" />{label}</span>
            ) : key === 'reviewers' ? (
              <span className="inline-flex items-center gap-2"><Users className="w-4 h-4" />{label}</span>
            ) : key === 'diff' ? (
              <span className="inline-flex items-center gap-2"><GitBranch className="w-4 h-4" />{label}</span>
            ) : (
              label
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-5 space-y-4">
        {tab === 'overview' && (
          <div className="space-y-4">
            {/* Snapshot */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border dash-border dash-surface-alt p-3">
                <p className="text-[11px] dash-text-secondary">Current status</p>
                <p className="text-sm font-semibold dash-text mt-1 capitalize">{(item.submission.signoff_status || '').replace(/_/g, ' ')}</p>
              </div>
              <div className="rounded-xl border dash-border dash-surface-alt p-3">
                <p className="text-[11px] dash-text-secondary">Last updated</p>
                <p className="text-sm font-semibold dash-text mt-1">
                  {new Date(item.submission.updated_at || item.submission.created_at || '').toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}
                </p>
              </div>
              <div className="rounded-xl border dash-border dash-surface-alt p-3">
                <p className="text-[11px] dash-text-secondary">Jurisdiction</p>
                <p className="text-sm font-semibold dash-text mt-1">
                  {((item.submission as any)?.jurisdiction as string) || '—'}
                </p>
              </div>
            </div>

            {/* Signature / workflow metadata */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full dash-card border dash-border dash-text">
                <Pencil className="w-3.5 h-3.5 dash-text-secondary" />
                Corrected by: <span className="font-semibold">{correctedText ? correctorName : '—'}</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full dash-card border dash-border dash-text">
                Corrected at: <span className="font-semibold">{correctedText ? formatDate(correctedAt || null) : '—'}</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full dash-card border dash-border dash-text">
                <Send className="w-3.5 h-3.5 dash-text-secondary" />
                Sent for legal: <span className="font-semibold">{submittedForLegalAt ? formatDate(submittedForLegalAt) : '—'}</span>
                {submittedForLegalBy ? <span className="dash-text-secondary"> • {submittedByName}</span> : null}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full dash-card border dash-border dash-text">
                <Scale className="w-3.5 h-3.5 dash-text-secondary" />
                Legal decision: <span className="font-semibold">{legalDecidedAt ? formatDate(legalDecidedAt) : '—'}</span>
                {legalDecidedBy ? <span className="dash-text-secondary"> • {legalDecidedByName}</span> : null}
              </span>
            </div>

            {/* Latest reviewer note */}
            {item.latestReview?.comments && (
              <div className="rounded-xl border dash-border dash-card p-4">
                <p className="text-[11px] font-semibold dash-text-secondary uppercase tracking-wider">Latest legal note</p>
                <p className="text-sm dash-text mt-2">{item.latestReview.comments}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'corrected' && (
          <div>
            <p className="text-[11px] font-semibold dash-text-secondary uppercase tracking-wider mb-2">Corrected content (Marketing)</p>
            {correctedText ? (
              <div className="bg-[var(--color-success-soft)] border border-[var(--color-success)]/20 rounded-lg p-4 max-h-[420px] overflow-y-auto">
                <AnnotationLayer
                  submissionId={item.submission.id}
                  companyId={companyId}
                  currentUserId={currentUserId}
                  contentText={correctedText}
                />
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
            <p className="text-[11px] font-semibold dash-text-secondary uppercase tracking-wider mb-2">Original content (Uploaded)</p>
            <div className="dash-card border dash-border rounded-lg p-4 max-h-[420px] overflow-y-auto">
              <AnnotationLayer
                submissionId={item.submission.id}
                companyId={companyId}
                currentUserId={currentUserId}
                contentText={item.submission.content_text}
              />
            </div>
          </div>
        )}

        {tab === 'ai' && (
          <div>
            <p className="text-[11px] font-semibold dash-text-secondary uppercase tracking-wider mb-2">Compliance guidance (AI report)</p>
            {!item.report ? (
              <div className="text-sm dash-text-secondary">No compliance report available.</div>
            ) : (
              <div className="border dash-border rounded-xl p-4">
                <div className="flex items-center gap-3 mb-4">{riskPill}</div>

                {(item.report.issues as unknown as any[])?.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <h6 className="text-sm font-medium dash-text">Issues ({(item.report.issues as unknown as any[]).length})</h6>
                    {(item.report.issues as unknown as any[]).map((issue, i) => {
                      const override = overrides.get(i);
                      return (
                        <div
                          key={i}
                          className={`rounded-lg p-3 ${override
                            ? 'bg-[var(--color-success-soft)] border-l-4 border-l-green-500 opacity-70'
                            : issue.severity === 'Red'
                              ? 'bg-[var(--color-danger-soft)] border-l-4 border-l-red-500'
                              : 'bg-amber-50 border-l-4 border-l-amber-500'
                            }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium dash-text">{issue.issue}</p>
                            <div className="flex items-center gap-2 shrink-0">
                              {override ? (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-success)] text-white">
                                  Overridden
                                </span>
                              ) : (
                                issue.severity === 'Red'
                                  ? <AlertCircle className="w-4 h-4 text-[var(--color-danger)]" />
                                  : <AlertTriangle className="w-4 h-4 text-behance-amber-500" />
                              )}
                            </div>
                          </div>
                          <p className="text-xs dash-text-secondary mt-1">{issue.regulation_cited}</p>
                          <div className="mt-2 dash-card/60 rounded p-2">
                            <p className="text-xs text-[var(--color-success)]">{issue.suggestion}</p>
                          </div>

                          {/* Override section */}
                          {override ? (
                            <div className="mt-2 text-xs dash-text-secondary border-t dash-border pt-2">
                              <span className="font-semibold">Override reason:</span> {override.reason}
                              <span className="ml-2 text-[10px]">• {formatDate(override.overriddenAt)}</span>
                            </div>
                          ) : overrideForm?.index === i ? (
                            <div className="mt-3 space-y-2">
                              <textarea
                                autoFocus
                                value={overrideForm.reason}
                                onChange={(e) => setOverrideForm({ index: i, reason: e.target.value })}
                                placeholder="Document your reason for overriding this AI finding…"
                                rows={2}
                                className="w-full text-xs border dash-border rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)] resize-none"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={handleOverrideSubmit}
                                  disabled={savingOverride || !overrideForm.reason.trim()}
                                  className="px-3 py-1 rounded-lg text-xs font-semibold text-white bg-[var(--color-behance-blue)] hover:bg-[var(--color-behance-blue)]/90 disabled:opacity-40 transition-colors"
                                >
                                  {savingOverride ? 'Saving…' : 'Confirm Override'}
                                </button>
                                <button
                                  onClick={() => setOverrideForm(null)}
                                  className="px-3 py-1 rounded-lg text-xs font-medium dash-text-secondary hover:dash-text transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setOverrideForm({ index: i, reason: '' })}
                              className="mt-2 text-[11px] font-medium text-[var(--color-behance-blue)] hover:underline"
                            >
                              Override AI finding
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {(item.report.suggested_rewrites as unknown as any[])?.length > 0 && (
                  <div className="space-y-2">
                    <h6 className="text-sm font-medium dash-text">Suggested rewrites</h6>
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
            <CommentsPanel submissionId={item.submission.id} companyId={companyId} />
          </div>
        )}

        {tab === 'reviewers' && (
          <ReviewAssignmentPanel
            submissionId={item.submission.id}
            companyId={companyId}
            currentUserId={currentUserId}
            canAssign={canAssignReviewers}
          />
        )}

        {tab === 'diff' && (
          <VersionDiffViewer submissionId={item.submission.id} />
        )}

        {tab === 'history' && (
          <div className="space-y-4">
            {/* Submission metadata */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border dash-border dash-surface-alt p-4">
                <p className="text-[11px] font-semibold dash-text-secondary uppercase tracking-wider">Submission</p>
                <p className="text-sm dash-text mt-2">Created: <span className="font-semibold">{formatDate(item.submission.created_at)}</span></p>
                <p className="text-sm dash-text mt-1">Updated: <span className="font-semibold">{formatDate(item.submission.updated_at)}</span></p>
              </div>
              <div className="rounded-xl border dash-border dash-surface-alt p-4">
                <p className="text-[11px] font-semibold dash-text-secondary uppercase tracking-wider">Current status</p>
                <p className="text-sm dash-text mt-2 capitalize">{(item.submission.signoff_status || '').replace(/_/g, ' ')}</p>
                {item.latestReview?.comments && (
                  <p className="text-xs dash-text-secondary mt-2 italic">"{item.latestReview.comments}"</p>
                )}
              </div>
            </div>

            {/* Full decision history */}
            <div>
              <p className="text-[11px] font-semibold dash-text-secondary uppercase tracking-wider mb-3">
                Decision history ({item.allReviews.length})
              </p>
              {item.allReviews.length === 0 ? (
                <p className="text-sm dash-text-secondary">No review decisions recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {item.allReviews.map((review, idx) => {
                    const statusColor =
                      review.status === 'approved'
                        ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
                        : review.status === 'rejected'
                          ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                          : review.status === 'amend_requested' || review.status === 'changes_requested'
                            ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'
                            : 'bg-[var(--color-info-soft)] text-[var(--color-info)]';
                    return (
                      <div key={review.id} className="rounded-xl border dash-border dash-surface-alt p-4">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-xs dash-text-secondary font-medium">#{item.allReviews.length - idx}</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColor}`}>
                              {(review.status || '—').replace(/_/g, ' ')}
                            </span>
                          </div>
                          <span className="text-xs dash-text-secondary">{formatDate(review.created_at)}</span>
                        </div>
                        {review.comments ? (
                          <p className="text-sm dash-text mt-2">{review.comments}</p>
                        ) : (
                          <p className="text-xs dash-text-tertiary mt-2 italic">No notes recorded.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Plan Review Date */}
      {isPending && legalEvent && (
        <div className="border-t dash-border px-5 py-4">
          {legalEvent.legal_acknowledged && legalEvent.legal_planned_at ? (
            /* Already planned — show the date */
            <div className="rounded-xl border border-behance-purple/30 bg-behance-purple/10/50 p-4">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-behance-purple" />
                <span className="font-medium text-[var(--color-purple)]">
                  Review planned for: {formatDate(legalEvent.legal_planned_at)}
                </span>
              </div>
            </div>
          ) : (
            /* Needs review date */
            <div className="rounded-xl border border-behance-amber-200 bg-behance-amber-50/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-behance-amber-600" />
                <span className="text-sm font-semibold dash-text">Plan Your Review</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setReviewDateChoice('later')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-xs ${reviewDateChoice === 'later'
                    ? 'border-purple-500 bg-behance-purple/10'
                    : 'dash-border hover:border-[var(--color-border)]'
                    }`}
                >
                  <Calendar className={`w-5 h-5 ${reviewDateChoice === 'later' ? 'text-behance-purple' : 'dash-text-tertiary'}`} />
                  <span className="font-medium dash-text">Pick a Date</span>
                </button>
                <button
                  onClick={() => setReviewDateChoice('now')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-xs ${reviewDateChoice === 'now'
                    ? 'border-purple-500 bg-behance-purple/10'
                    : 'dash-border hover:border-[var(--color-border)]'
                    }`}
                >
                  <Zap className={`w-5 h-5 ${reviewDateChoice === 'now' ? 'text-behance-purple' : 'dash-text-tertiary'}`} />
                  <span className="font-medium dash-text">Review Now</span>
                </button>
              </div>

              {reviewDateChoice === 'later' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold dash-text-secondary uppercase tracking-wider block mb-1">Date</label>
                    <input
                      type="date"
                      value={reviewDate}
                      onChange={(e) => setReviewDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full border dash-border rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold dash-text-secondary uppercase tracking-wider block mb-1">Time</label>
                    <input
                      type="time"
                      value={reviewTime}
                      onChange={(e) => setReviewTime(e.target.value)}
                      className="w-full border dash-border rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                    />
                  </div>
                </div>
              )}

              {reviewDateChoice && (
                <button
                  onClick={handleSaveReviewDate}
                  disabled={savingReviewDate || (reviewDateChoice === 'later' && !reviewDate)}
                  className="w-full px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-[var(--color-purple)] disabled:opacity-50 transition-all"
                >
                  {savingReviewDate ? 'Saving...' : reviewDateChoice === 'now' ? 'Start Review Now' : 'Confirm Review Date'}
                </button>
              )}

              {reviewDateMsg && (
                <p className={`text-xs ${reviewDateMsg.includes('✓') ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                  {reviewDateMsg}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer actions */}
      {isPending && (
        <div className="border-t dash-border p-5 space-y-3">
          <div>
            <label className="text-[11px] font-semibold dash-text-secondary uppercase tracking-wider mb-1.5 block">
              Decision notes (required for Amend / Reject)
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Write your decision notes for Marketing (what to change, what to avoid, why)..."
              rows={3}
              className="w-full text-sm border dash-border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)] transition-all resize-none"
            />
            <p className="text-[11px] dash-text-secondary mt-2">Tip: You can leave notes even when approving.</p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <button
              onClick={() => handle('amend')}
              disabled={submitting || !canSubmit}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 border border-[var(--color-warning)]/20 text-[var(--color-warning)] rounded-lg hover:bg-[var(--color-warning-soft)] disabled:opacity-40 transition-colors text-sm font-medium"
              title="Request changes from Marketing"
            >
              <AlertTriangle className="w-4 h-4" />
              Request changes
            </button>

            <button
              onClick={() => handle('reject')}
              disabled={submitting || !canSubmit}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 border border-[var(--color-danger)]/20 text-[var(--color-danger)] rounded-lg hover:bg-[var(--color-danger-soft)] disabled:opacity-40 transition-colors text-sm font-medium"
              title="Reject (do not publish)"
            >
              <AlertCircle className="w-4 h-4" />
              Reject
            </button>

            <button
              onClick={() => handle('approve')}
              disabled={submitting}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-behance-blue text-white rounded-lg hover:bg-behance-blue/90 disabled:opacity-50 transition-colors text-sm font-medium"
              title="Approve (sign off)"
            >
              <CheckCircle className="w-4 h-4" />
              Approve
            </button>
          </div>
        </div>
      )}

      {/* ── Decision Confirmation Modal ── */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border dash-border bg-[var(--color-surface)] shadow-2xl p-6">
            <h3 className="text-lg font-semibold dash-text mb-2">{confirmModal.title}</h3>
            <p className="text-sm dash-text-secondary leading-relaxed mb-6">{confirmModal.message}</p>
            {comments.trim() && (
              <div className="mb-5 p-3 rounded-lg bg-[var(--color-surface-alt)] border dash-border text-sm dash-text-secondary">
                <span className="font-medium dash-text">Your note: </span>{comments.trim()}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg border dash-border dash-text hover:bg-[var(--color-surface-alt)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmed}
                disabled={submitting}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${confirmModal.confirmClass}`}
              >
                {submitting ? 'Processing…' : confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

