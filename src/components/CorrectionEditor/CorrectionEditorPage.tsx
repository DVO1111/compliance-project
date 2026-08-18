import { useEffect, useState, useMemo } from "react";
import { ArrowLeft, Save, Scale, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { logger } from '../../lib/logger';

const CORRECTION_OPEN_KEY = "cc_open_correction_content_id";

export default function CorrectionEditorPage({ onDone }: { onDone: () => void }) {
  const { user, profile } = useAuth();

  const [contentId, setContentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [submission, setSubmission] = useState<any>(null);
  const [report, setReport] = useState<any>(null);

  const [correctedText, setCorrectedText] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  const companyId = (profile as any)?.company_id;

  // ✅ Load document ID from localStorage
  useEffect(() => {
    const id = localStorage.getItem(CORRECTION_OPEN_KEY);
    if (!id) {
      setLoading(false);
      return;
    }
    setContentId(id);
  }, []);

  // ✅ Load document + report
  useEffect(() => {
    if (!contentId || !companyId) return;

    const load = async () => {
      setLoading(true);

      const { data: sub, error: subErr } = await (supabase as any)
        .from("content_submissions")
        .select("*")
        .eq("id", contentId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (subErr) logger.error(subErr);

      const { data: rep } = await (supabase as any)
        .from("compliance_reports")
        .select("*")
        .eq("content_id", contentId)
        .maybeSingle();

      setSubmission(sub || null);
      setReport(rep || null);

      setCorrectedText(sub?.corrected_text ?? sub?.content_text ?? "");

      setLoading(false);
    };

    load();
  }, [contentId, companyId]);

  const canEdit =
    submission &&
    !submission.is_locked &&
    ["draft", "analyzed", "amend_requested"].includes(submission.signoff_status);

  const hasSaved = useMemo(
    () => (submission?.corrected_text ?? "").trim().length > 0,
    [submission]
  );

  // ✅ Save corrected version
  const handleSave = async () => {
    if (!user || !submission) return;

    const text = correctedText.trim();
    if (!text) return;

    setSaving(true);

    const { error } = await (supabase as any)
      .from("content_submissions")
      .update({
        corrected_text: text,
        corrected_at: new Date().toISOString(),
        corrected_by: user.id,
      })
      .eq("id", submission.id);

    if (error) {
      logger.error(error);
      setSavedMsg("Could not save.");
    } else {
      setSavedMsg("Saved ✔");
      setSubmission({ ...submission, corrected_text: text });
    }

    setSaving(false);
    setTimeout(() => setSavedMsg(""), 2000);
  };

  // ✅ Send to legal from editor
  const sendToLegal = async () => {
    if (!submission || !user) return;
    if (!submission.corrected_text?.trim()) {
      alert("Please save corrected version first.");
      return;
    }

    setSubmitting(true);

    await (supabase as any)
      .from("content_submissions")
      .update({
        signoff_status: "awaiting_legal",
        is_locked: true,
        locked_at: new Date().toISOString(),
        locked_by: user.id,
        submitted_for_legal_at: new Date().toISOString(),
        submitted_for_legal_by: user.id,
      })
      .eq("id", submission.id);

    // ✅ Create calendar events (both marketing publish + legal review)
    try {
      const { createCalendarEvent, createLegalCalendarEvent } = await import('../../lib/calendarService');
      const subTitle = submission.title || 'Untitled';
      const subDeadline = submission.scheduled_date || new Date().toISOString();

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

    setSubmitting(false);
    onDone();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-accent)]" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="bg-[var(--color-surface)] rounded-xl border p-8 text-center">
        <p className="text-[var(--color-text-secondary)]">No document found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Correction Editor</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Edit compliant version using AI guidance
          </p>
        </div>

        <button
          onClick={onDone}
          className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface-alt)] rounded-lg text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      {/* Original */}
      <div className="bg-[var(--color-surface)] rounded-xl border p-4">
        <h4 className="text-sm font-semibold mb-2">Original Content</h4>
        <div className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">
          {submission.content_text}
        </div>
      </div>

      {/* AI guidance */}
      {report && (
        <div className="bg-[var(--color-surface)] rounded-xl border p-4">
          <h4 className="text-sm font-semibold mb-3">AI Compliance Guidance</h4>

          {report.issues?.map((issue: any, i: number) => (
            <div key={i} className="bg-[var(--color-warning-soft)] rounded p-3 mb-2">
              <p className="text-sm font-medium">{issue.issue}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">{issue.regulation_cited}</p>
              <p className="text-xs text-[var(--color-success)] mt-1">
                {issue.suggestion}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Editor */}
      <div className="bg-[var(--color-surface)] rounded-xl border p-4">
        <h4 className="text-sm font-semibold mb-2">
          Corrected Version (Marketing)
        </h4>

        <textarea
          value={correctedText}
          onChange={(e) => setCorrectedText(e.target.value)}
          disabled={!canEdit}
          rows={10}
          className="w-full border rounded-lg p-3 text-sm"
        />

        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-[var(--color-text-secondary)]">{savedMsg}</div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !canEdit}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving…" : "Save"}
            </button>

            <button
              onClick={sendToLegal}
              disabled={submitting || !hasSaved}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--color-warning)] text-white rounded-lg text-sm"
            >
              <Scale className="w-4 h-4" />
              {submitting ? "Submitting…" : "Send to Legal"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
