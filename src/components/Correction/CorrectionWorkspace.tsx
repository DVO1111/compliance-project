import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  FileText,
  Save,
  Send,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Scale,
} from 'lucide-react';
import type { Database } from '../../lib/database.types';
import { logger } from '../../lib/logger';

type ContentSubmission = Database['public']['Tables']['content_submissions']['Row'];
type ComplianceReport = Database['public']['Tables']['compliance_reports']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

const EDIT_OPEN_KEY = 'cc_open_correction_content_id';

export default function CorrectionWorkspace() {
  const { user, profile } = useAuth();

  const companyId = (profile as any)?.company_id as string | undefined;

  const [contentId, setContentId] = useState<string | null>(null);
  const [submission, setSubmission] = useState<ContentSubmission | null>(null);
  const [report, setReport] = useState<ComplianceReport | null>(null);

  const [correctedText, setCorrectedText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const [infoMsg, setInfoMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [correctorProfile, setCorrectorProfile] = useState<Profile | null>(null);

  const canEdit = useMemo(() => {
    if (!submission) return false;
    if (submission.is_locked) return false;

    // ✅ Option A: marketing edits before legal
    return (
      submission.signoff_status === 'draft' ||
      submission.signoff_status === 'analyzed' ||
      submission.signoff_status === 'amend_requested'
    );
  }, [submission]);

  const isDirty = useMemo(() => {
    if (!submission) return false;
    const existing = ((submission as any)?.corrected_text as string | null) || '';
    return existing.trim() !== correctedText.trim();
  }, [submission, correctedText]);

  const canSendToLegal = useMemo(() => {
    if (!user || !companyId || !submission) return false;
    if (!canEdit) return false;
    if (!(correctedText || '').trim()) return false;
    // Must be saved (i.e. corrected_text matches current editor state)
    const existing = ((submission as any)?.corrected_text as string | null) || '';
    return existing.trim() === correctedText.trim();
  }, [user, companyId, submission, correctedText, canEdit]);

  useEffect(() => {
    const id = localStorage.getItem(EDIT_OPEN_KEY);
    setContentId(id);
  }, []);

  const load = async (id: string) => {
    if (!companyId) {
      setErrorMsg('Company not set on profile. Please re-login or complete onboarding.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');

    const { data: sub, error: subErr } = await supabase
      .from('content_submissions')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (subErr) {
      setErrorMsg(subErr.message);
      setLoading(false);
      return;
    }

    if (!sub) {
      setErrorMsg('No document selected. Go back and click “Edit & Correct” from a report.');
      setLoading(false);
      return;
    }

    setSubmission(sub);

    // Load report
    const { data: rep, error: repErr } = await supabase
      .from('compliance_reports')
      .select('*')
      .eq('content_id', sub.id)
      .maybeSingle();

    if (repErr) logger.error('Failed to load compliance report:', repErr);
    setReport(rep || null);

    // Initialize correctedText
    const existingCorrected = ((sub as any)?.corrected_text as string | null) || '';
    setCorrectedText(existingCorrected || sub.content_text || '');

    // Load corrector profile if available
    const correctedBy = (sub as any)?.corrected_by as string | null | undefined;
    if (correctedBy) {
      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', correctedBy)
        .maybeSingle();
      setCorrectorProfile((p as any) || null);
    } else {
      setCorrectorProfile(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!contentId) {
      setLoading(false);
      return;
    }
    load(contentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId, companyId]);

  const saveCorrection = async () => {
    if (!user || !companyId || !submission) return;
    if (!canEdit) return;

    const text = correctedText.trim();
    if (!text) {
      setErrorMsg('Corrected content cannot be empty.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setInfoMsg('');

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('content_submissions')
      .update({
        corrected_text: text as any,
        corrected_at: now as any,
        corrected_by: user.id as any,
      } as any)
      .eq('id', submission.id)
      .eq('company_id', companyId)
      .select('*')
      .single();

    if (error) {
      setErrorMsg(error.message);
      setSaving(false);
      return;
    }

    setSubmission(data);
    setInfoMsg('Correction saved.');
    setSaving(false);

    // Refresh corrector profile
    const { data: p } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    setCorrectorProfile((p as any) || null);

    setTimeout(() => setInfoMsg(''), 2500);
  };

  const sendToLegal = async () => {
    if (!user || !companyId || !submission) return;
    if (!canSendToLegal) {
      setErrorMsg('Please save your correction first before sending to Legal.');
      return;
    }

    setSending(true);
    setErrorMsg('');
    setInfoMsg('');

    const now = new Date().toISOString();

    const { data: updated, error: updErr } = await supabase
      .from('content_submissions')
      .update({
        signoff_status: 'awaiting_legal',
        submitted_for_legal_at: now,
        submitted_for_legal_by: user.id,
        is_locked: true,
        locked_at: now,
        locked_by: user.id,
      } as any)
      .eq('id', submission.id)
      .eq('company_id', companyId)
      .in('signoff_status', ['draft', 'analyzed', 'amend_requested'] as any)
      .select('*')
      .maybeSingle();

    if (updErr) {
      setErrorMsg(updErr.message);
      setSending(false);
      return;
    }

    if (!updated?.id) {
      setErrorMsg('Could not send to legal. The document may already be locked or not in an allowed status.');
      setSending(false);
      return;
    }

    // Notify legal team (not fatal if it fails)
    const { error: rpcErr } = await (supabase as any).rpc('notify_legal_review_request', {
      p_content_id: submission.id,
    });
    if (rpcErr) logger.error('notify_legal_review_request failed:', rpcErr);

    setSubmission(updated);
    setInfoMsg('Sent to Legal Review.');

    // ✅ Create calendar events (both marketing publish + legal review)
    try {
      const { createCalendarEvent, createLegalCalendarEvent } = await import('../../lib/calendarService');
      const subTitle = submission.title || 'Untitled';
      const subDeadline = (submission as any)?.scheduled_date || new Date().toISOString();

      await createCalendarEvent({
        companyId,
        submissionId: submission.id,
        title: subTitle,
        scheduledDate: subDeadline,
        userId: user.id,
        eventType: 'marketing_publish',
      });

      await createLegalCalendarEvent({
        companyId,
        submissionId: submission.id,
        title: subTitle,
        publishDeadline: subDeadline,
        userId: user.id,
      });
    } catch (calErr) {
      logger.warn('Calendar event creation failed (non-fatal):', calErr);
    }

    setSending(false);

    // Navigate to legal review page automatically
    window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'legal-review' } }));
    window.dispatchEvent(new CustomEvent('open-document', { detail: { id: submission.id } }));
  };

  const formatDate = (d?: string | null) => {
    if (!d) return '—';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#004A99] border-t-transparent" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm p-8">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--color-warning)] mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">No document opened</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              Go to a report and click <span className="font-medium">Edit &amp; Correct</span>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const correctedAt = (submission as any)?.corrected_at as string | null | undefined;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Correction Editor</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Edit while viewing AI guidance, then submit to Legal Review.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={saveCorrection}
            disabled={!canEdit || saving || !isDirty}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg
              hover:bg-[var(--color-accent-hover)] transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Correction'}
          </button>

          <button
            onClick={sendToLegal}
            disabled={sending || !canSendToLegal}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--color-bg)] text-white rounded-lg
              hover:bg-black transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Scale className="w-4 h-4" />
            {sending ? 'Sending…' : 'Send to Legal'}
          </button>
        </div>
      </div>

      {(errorMsg || infoMsg) && (
        <div
          className={`rounded-lg p-3 text-sm border ${errorMsg ? 'bg-[var(--color-danger-soft)] border-[var(--color-danger)]/20 text-[var(--color-danger)]' : 'bg-[var(--color-success-soft)] border-[var(--color-success)]/20 text-[var(--color-success)]'
            }`}
        >
          {errorMsg || infoMsg}
        </div>
      )}

      {/* Header Card */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-secondary)]">Document</p>
            <p className="text-lg font-semibold text-[var(--color-text-primary)] truncate">{submission.title}</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              {submission.platform} • {submission.content_topic} • {new Date(submission.created_at || '').toLocaleDateString()}
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs text-[var(--color-text-secondary)]">Corrected</p>
            <p className="text-sm text-[var(--color-text-primary)] font-medium">
              {correctedAt ? formatDate(correctedAt) : 'Not yet'}
            </p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              {correctorProfile?.full_name ? `By ${correctorProfile.full_name}` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Original */}
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-[var(--color-text-secondary)]" />
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Original (read-only)</h3>
          </div>
          <div className="bg-[var(--color-surface-alt)] rounded-lg p-3 text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap max-h-[360px] overflow-y-auto">
            {submission.content_text}
          </div>
        </div>

        {/* Corrected */}
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-[var(--color-text-secondary)]" />
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Corrected Version</h3>
            </div>
            {!canEdit && (
              <span className="text-[11px] text-[var(--color-text-secondary)]">
                Locked / already in Legal
              </span>
            )}
          </div>

          <textarea
            value={correctedText}
            onChange={(e) => setCorrectedText(e.target.value)}
            disabled={!canEdit}
            rows={14}
            className="w-full text-sm border border-[var(--color-border)] rounded-lg px-3 py-2
              focus:ring-2 focus:ring-[#004A99]/20 focus:border-[#004A99] transition-all resize-none disabled:bg-[var(--color-surface-alt)]"
          />

          <p className="text-[11px] text-[var(--color-text-secondary)] mt-2">
            Save first. Sending to Legal is enabled only when the saved corrected text matches this editor.
          </p>
        </div>
      </div>

      {/* AI Guidance */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="w-4 h-4 text-[var(--color-text-secondary)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">AI Guidance</h3>
          {report?.overall_risk && (
            <span
              className={`ml-2 px-2 py-0.5 rounded-full text-[11px] font-medium ${report.overall_risk === 'low'
                  ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
                  : report.overall_risk === 'medium'
                    ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'
                    : report.overall_risk === 'high'
                      ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'
                      : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                }`}
            >
              {report.overall_risk} risk
            </span>
          )}
        </div>

        {!report ? (
          <p className="text-sm text-[var(--color-text-secondary)]">No compliance report found for this document.</p>
        ) : (
          <div className="space-y-4">
            {(report.issues as unknown as any[])?.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">Issues</p>
                {(report.issues as unknown as any[]).map((issue: any, i: number) => (
                  <div
                    key={i}
                    className={`rounded-lg p-3 ${issue.severity === 'Red'
                        ? 'bg-[var(--color-danger-soft)] border-l-4 border-l-red-500'
                        : 'bg-[var(--color-warning-soft)] border-l-4 border-l-amber-500'
                      }`}
                  >
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{issue.issue}</p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">{issue.regulation_cited}</p>
                    {issue.suggestion && (
                      <div className="mt-2 bg-white/60 rounded p-2">
                        <p className="text-[11px] text-[var(--color-text-secondary)] font-semibold">Suggestion</p>
                        <p className="text-xs text-[var(--color-success)]">{issue.suggestion}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(report.suggested_rewrites as unknown as any[])?.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">Suggested Rewrites</p>
                {(report.suggested_rewrites as unknown as any[]).map((rw: any, i: number) => (
                  <div key={i} className="bg-[var(--color-info-soft)] rounded-lg p-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] font-semibold text-[var(--color-text-secondary)] uppercase mb-0.5">Original</p>
                        <p className="text-xs text-[var(--color-text-primary)]">{rw.original}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-[var(--color-text-secondary)] uppercase mb-0.5">Suggested</p>
                        <p className="text-xs text-[var(--color-success)] font-medium">{rw.suggested}</p>
                      </div>
                    </div>
                    {rw.reasoning && <p className="text-[10px] text-[var(--color-text-secondary)] mt-2 italic">{rw.reasoning}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
