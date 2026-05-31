import { CommentsPanel } from "../Comments/CommentsPanel";
import { useMemo, useState } from "react";
import {
  X,
  Download,
  Lock,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Scale,
  FileStack,
  Loader2,
  Trash2,
  Pencil,
} from "lucide-react";
import SignoffBadge from "./SignoffBadge";
import TagInput from "./TagInput";
import type { ContentWithReport } from "../../hooks/useArchiveData";
import { exportToPDF } from "../../lib/pdfExport";
import { generateDossier } from "../../lib/dossierService";
import { logger } from '../../lib/logger';

interface DocumentDetailModalProps {
  item: ContentWithReport;
  onClose: () => void;
  onAddTag: (contentId: string, name: string, type: "campaign" | "client") => Promise<unknown>;
  onRemoveTag: (tagId: string) => Promise<unknown>;
  onRequestSignoff: (contentId: string) => Promise<unknown>;
  onPublish: (contentId: string) => Promise<unknown>;
  onEditCorrect: (contentId: string) => void;
  onDelete: (contentId: string) => void;
}

function formatShortDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${dt.toLocaleDateString()} • ${dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function DocumentDetailModal({
  item,
  onClose,
  onAddTag,
  onRemoveTag,
  onRequestSignoff,
  onPublish,
  onEditCorrect,
  onDelete,
}: DocumentDetailModalProps) {
  const [confirmingSignoff, setConfirmingSignoff] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [generatingDossier, setGeneratingDossier] = useState(false);

  const canGenerateDossier = item.signoff_status === "signed_off" || item.signoff_status === "published";

  // ✅ Safe companyId extraction
  const companyId: string | undefined =
    (item as any)?.company_id ?? (item as any)?.companyId ?? undefined;

  // ✅ Corrected metadata
  const correctedFromDb = (((item as any)?.corrected_text as string) ?? "").trim();
  const correctedAt = ((item as any)?.corrected_at as string) ?? null;

  // Marketing can edit only before it is sent to legal (and while not locked)
  const canEdit =
    !item.is_locked &&
    (item.signoff_status === "draft" ||
      item.signoff_status === "analyzed" ||
      item.signoff_status === "amend_requested");

  const canRequestSignoff =
    item.report &&
    (item.signoff_status === "analyzed" ||
      item.signoff_status === "draft" ||
      item.signoff_status === "amend_requested") &&
    !item.is_locked;

  const canPublish = item.signoff_status === "signed_off";

  const hasCorrectedSaved = useMemo(() => correctedFromDb.length > 0, [correctedFromDb]);

  const handleSignoff = async () => {
    setSubmitting(true);
    await onRequestSignoff(item.id);
    setSubmitting(false);
    setConfirmingSignoff(false);
    onClose();
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await onPublish(item.id);
      onClose();
    } catch (err) {
      logger.error("Publish failed:", err);
    }
    setPublishing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="dash-card rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 dash-card border-b dash-border px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold dash-text">Document Details</h3>
            <SignoffBadge status={item.signoff_status || ''} size="md" />
            {item.is_locked && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-behance-amber-50 text-behance-amber-700">
                <Lock className="w-3 h-3" />
                Locked
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 dash-text-tertiary hover:dash-text-secondary hover:dash-surface-alt rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <div>
            <h4 className="text-xl font-semibold dash-text mb-1">{item.title}</h4>
            <div className="flex flex-wrap items-center gap-3 text-sm dash-text-secondary">
              <span className="capitalize">{item.platform}</span>
              <span className="dash-text-tertiary">|</span>
              <span>{item.content_topic}</span>
              <span className="dash-text-tertiary">|</span>
              <span>{new Date(item.created_at || '').toLocaleDateString()}</span>
            </div>
          </div>

          {/* Tags */}
          <div>
            <h5 className="text-xs font-semibold dash-text-secondary uppercase tracking-wider mb-2">Tags</h5>
            <TagInput
              tags={item.tags || []}
              onAdd={(name, type) => onAddTag(item.id, name, type) as any}
              onRemove={onRemoveTag as any}
              disabled={item.is_locked ?? undefined}
            />
          </div>

          {/* Original content */}
          <div>
            <h5 className="text-xs font-semibold dash-text-secondary uppercase tracking-wider mb-2">
              Original Content (Uploaded)
            </h5>
            <div className="dash-surface-alt rounded-lg p-4 text-sm dash-text leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
              {item.content_text}
            </div>
          </div>

          {/* Corrected version */}
          <div className="border dash-border rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h5 className="text-xs font-semibold dash-text-secondary uppercase tracking-wider">
                  Corrected Version (Marketing)
                </h5>
                <p className="text-[11px] dash-text-secondary mt-1">
                  {hasCorrectedSaved
                    ? `Last saved: ${formatShortDate(correctedAt)}`
                    : "No corrected version saved yet."}
                </p>
              </div>

              {canEdit && (
                <button
                  onClick={() => onEditCorrect(item.id)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold
                    bg-[var(--color-behance-blue)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                  Edit & Correct
                </button>
              )}
            </div>

            <div className="mt-3 dash-surface-alt rounded-lg p-4 text-sm dash-text leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
              {hasCorrectedSaved ? correctedFromDb : "—"}
            </div>

            <p className="text-[11px] dash-text-secondary mt-2">
              Legal will review the original + corrected version + AI guidance.
            </p>
          </div>

          {/* Compliance Report */}
          {item.report && (
            <div className="border-t dash-border pt-5">
              <div className="flex items-center gap-3 mb-4">
                <h5 className="text-xs font-semibold dash-text-secondary uppercase tracking-wider">
                  Compliance Analysis
                </h5>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${item.report.overall_risk === "low"
                    ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                    : item.report.overall_risk === "medium"
                      ? "bg-behance-amber-50 text-behance-amber-700"
                      : item.report.overall_risk === "high"
                        ? "bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
                        : "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                    }`}
                >
                  {item.report.overall_risk} risk
                </span>
              </div>

              {(item.report.issues as unknown as any[])?.length > 0 && (
                <div className="space-y-2 mb-4">
                  <h6 className="text-sm font-medium dash-text">Issues ({(item.report.issues as unknown as any[]).length})</h6>
                  {(item.report.issues as unknown as any[]).map((issue: any, i: number) => (
                    <div
                      key={i}
                      className={`rounded-lg p-3 border-l-3 ${issue.severity === "Red"
                        ? "bg-[var(--color-danger-soft)] border-l-red-500"
                        : "bg-behance-amber-50 border-l-amber-500"
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium dash-text">{issue.issue}</p>
                        {issue.severity === "Red" ? (
                          <AlertCircle className="w-4 h-4 text-[var(--color-danger)] shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-behance-amber-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs dash-text-secondary mt-1">{issue.regulation_cited}</p>
                      <div className="mt-2 dash-card/60 rounded p-2">
                        <p className="text-xs dash-text-secondary font-medium mb-0.5">Suggestion</p>
                        <p className="text-xs text-[var(--color-success)]">{issue.suggestion}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(item.report.flagged_phrases as unknown as any[])?.length > 0 && (
                <div className="space-y-2 mb-4">
                  <h6 className="text-sm font-medium dash-text">Flagged Phrases</h6>
                  {(item.report.flagged_phrases as unknown as any[]).map((phrase: any, i: number) => (
                    <div key={i} className="bg-[var(--color-danger-soft)] rounded-lg p-3">
                      <p className="text-sm font-medium text-[var(--color-danger)]">"{phrase.phrase}"</p>
                      <p className="text-xs dash-text-secondary mt-1">{phrase.context}</p>
                    </div>
                  ))}
                </div>
              )}

              {(item.report.suggested_rewrites as unknown as any[])?.length > 0 && (
                <div className="space-y-2">
                  <h6 className="text-sm font-medium dash-text">Suggested Rewrites</h6>
                  {(item.report.suggested_rewrites as unknown as any[]).map((rw: any, i: number) => (
                    <div key={i} className="bg-[var(--color-info-soft)] rounded-lg p-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] font-semibold dash-text-secondary uppercase mb-0.5">Original</p>
                          <p className="text-xs dash-text">{rw.original}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold dash-text-secondary uppercase mb-0.5">Suggested</p>
                          <p className="text-xs text-[var(--color-success)] font-medium">{rw.suggested}</p>
                        </div>
                      </div>
                      <p className="text-[10px] dash-text-secondary mt-2 italic">{rw.reasoning}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Comments */}
          {companyId ? (
            <div className="border-t dash-border pt-5">
              <CommentsPanel submissionId={item.id} companyId={companyId} />
            </div>
          ) : (
            <div className="border-t dash-border pt-5">
              <div className="text-sm dash-text-secondary">
                Comments are unavailable (missing companyId on this document).
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 dash-card border-t dash-border px-6 py-4 flex items-center gap-3 shrink-0">
          <button
            onClick={() => onDelete(item.id)}
            className="p-2 text-[var(--color-danger)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] rounded-lg transition-colors mr-auto"
            title="Delete Content securely"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          {canRequestSignoff && !confirmingSignoff && (
            <button
              onClick={() => setConfirmingSignoff(true)}
              className="flex items-center gap-2 px-4 py-2 bg-behance-amber-500 text-white rounded-lg hover:bg-behance-amber-600 transition-colors text-sm font-medium"
            >
              <Scale className="w-4 h-4" />
              Request Legal Sign-off
            </button>
          )}

          {confirmingSignoff && (
            <div className="flex items-center gap-3 bg-behance-amber-50 rounded-lg px-4 py-2 flex-1">
              <Lock className="w-4 h-4 text-behance-amber-600 shrink-0" />
              <p className="text-xs text-behance-amber-800 flex-1">
                This will lock the document and send it for legal review.
              </p>

              <button
                onClick={() => setConfirmingSignoff(false)}
                className="text-xs dash-text-secondary hover:dash-text px-3 py-1.5 rounded transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={async () => {
                  if (!hasCorrectedSaved) {
                    alert("Please click 'Edit & Correct' and save a corrected version before submitting to Legal.");
                    return;
                  }
                  await handleSignoff();
                }}
                disabled={submitting}
                className="text-xs bg-behance-amber-600 text-white px-3 py-1.5 rounded hover:bg-behance-amber-700 disabled:opacity-50 transition-colors font-medium"
              >
                {submitting ? "Submitting..." : "Confirm Lock & Submit"}
              </button>
            </div>
          )}

          {/* ✅ NEW: In Review status banner */}
          {item.signoff_status === "in_review" && (
            <div className="flex items-center gap-2 bg-[var(--color-info-soft)] rounded-lg px-4 py-2 text-[var(--color-info)]">
              <Scale className="w-4 h-4" />
              <span className="text-sm font-medium">In review (Legal is working on it)</span>
            </div>
          )}

          {item.signoff_status === "awaiting_legal" && (
            <div className="flex items-center gap-2 bg-behance-amber-50 rounded-lg px-4 py-2 text-behance-amber-700">
              <Scale className="w-4 h-4" />
              <span className="text-sm font-medium">Awaiting legal review</span>
            </div>
          )}

          {item.signoff_status === "signed_off" && (
            <div className="flex items-center gap-2 bg-[var(--color-success-soft)] rounded-lg px-4 py-2 text-[var(--color-success)]">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Legally approved</span>
            </div>
          )}

          {item.signoff_status === "published" && (
            <div className="flex items-center gap-2 bg-[var(--color-success-soft)] rounded-lg px-4 py-2 text-[var(--color-success)]">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Published</span>
            </div>
          )}

          {canPublish && (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--color-behance-blue)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors text-sm font-medium disabled:opacity-60"
            >
              <CheckCircle className="w-4 h-4" />
              {publishing ? "Publishing..." : "Publish"}
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {canGenerateDossier && (
              <button
                onClick={async () => {
                  setGeneratingDossier(true);
                  try {
                    await generateDossier(item.id);
                  } catch (err) {
                    logger.error('Dossier generation failed:', err);
                    alert('Failed to generate dossier. Please try again.');
                  } finally {
                    setGeneratingDossier(false);
                  }
                }}
                disabled={generatingDossier}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--color-success)] text-white rounded-lg hover:bg-[var(--color-success)] transition-colors text-sm font-medium disabled:opacity-60"
              >
                {generatingDossier ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileStack className="w-4 h-4" />
                )}
                {generatingDossier ? 'Building...' : 'Generate Dossier'}
              </button>
            )}
            {item.report && (
              <button
                onClick={() => exportToPDF(item, item.report!)}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--color-behance-blue)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors text-sm font-medium"
              >
                <Download className="w-4 h-4" />
                Export PDF
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

