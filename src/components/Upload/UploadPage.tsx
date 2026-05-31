import { useState, useRef, DragEvent, ChangeEvent, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Upload,
  FileText,
  X,
  CheckCircle,
  AlertCircle,
  Eye,
  AlertTriangle,
  Download,
} from 'lucide-react';
import { analyzeCompliance, analyzeAllJurisdictions } from '../../lib/complianceEngine';
import type { ComparisonMatrixResult } from '../../lib/complianceEngine';
import { exportToPDF } from '../../lib/pdfExport';
import { extractText, validateFile } from '../../lib/textExtractor';
import { useDocumentStore } from '../../stores/documentStore';
import { useJurisdictionStore } from '../../stores/jurisdictionStore';
import Toast from '../Common/Toast';
import ExtractionSpinner from './ExtractionSpinner';
import JurisdictionSelector from '../Common/JurisdictionSelector';
import ComparisonMatrix from '../Common/ComparisonMatrix';
import type { Database } from '../../lib/database.types';
import { notify } from '../../integrations/services/notificationService';
import { buildReviewUrl } from '../../integrations/utils/deepLinks';
import { sendUserNotification } from '../../lib/emailNotify';
import { recordAuditEvent } from '../../lib/auditService';
import { enqueueAIJob } from '../../lib/aiRiskService';
import AIRiskBadge from '../AIRisk/AIRiskBadge';
import SubstantiationPanel, { type Substantiation } from './SubstantiationPanel';
import { logger } from '../../lib/logger';

type ContentSubmission = Database['public']['Tables']['content_submissions']['Row'];
type ComplianceReport = Database['public']['Tables']['compliance_reports']['Row'];

interface ContentWithReport {
  submission: ContentSubmission;
  report: ComplianceReport;
}

interface FileUpload {
  file: File;
  platform: string;
  contentTopic: string;
  targetAudience: string;
  priority: string;
  scheduledDate: string;
  scheduledTime: string; // ✅ NEW
  departmentId: string; // ✅ NEW
}

type Department = { id: string; name: string };

export default function UploadPage() {
  const { user, profile } = useAuth(); // ✅ use profile for company scoping
  const { selectedJurisdiction } = useJurisdictionStore();
  const companyId = (profile as any)?.company_id as string | undefined;

  const [departments, setDepartments] = useState<Department[]>([]); // ✅ NEW

  const [uploads, setUploads] = useState<FileUpload[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<
    Array<{ success: boolean; message: string; contentId?: string }>
  >([]);
  const [completedAnalyses, setCompletedAnalyses] = useState<ContentWithReport[]>([]);
  const [comparisonResults, setComparisonResults] = useState<Record<string, ComparisonMatrixResult>>(
    {}
  );
  const [selectedResult, setSelectedResult] = useState<ContentWithReport | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [currentExtractingFile, setCurrentExtractingFile] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<number, string>>({});
  const [activeComparisonId, setActiveComparisonId] = useState<string | null>(null);
  const [substantiationsComplete, setSubstantiationsComplete] = useState(false);
  const [currentSubstantiations, setCurrentSubstantiations] = useState<Substantiation[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isExtracting,
    extractionProgress,
    setExtracting,
    setExtractionProgress,
    addDocument,
  } = useDocumentStore();

  // ✅ Load departments for this company (for department selector)
  useEffect(() => {
    const loadDepartments = async () => {
      if (!companyId) {
        setDepartments([]);
        return;
      }

      const { data, error } = await (supabase as any)
        .from('departments')
        .select('id,name')
        .eq('company_id', companyId)
        .order('name', { ascending: true });

      if (error) {
        // Not fatal to the page, but user can't upload without departments
        logger.error('Failed to load departments:', error);
        setDepartments([]);
        return;
      }

      setDepartments((data ?? []) as unknown as Department[]);
    };

    loadDepartments();
  }, [companyId]);

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files).filter((file) => {
      const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
      return ['.docx', '.pdf', '.txt'].includes(ext);
    });

    addFiles(files);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      addFiles(files);
    }
  };

  const addFiles = (files: File[]) => {
    const errors: Record<number, string> = { ...validationErrors };
    const validUploads: FileUpload[] = [];

    for (const file of files) {
      const error = validateFile(file);
      if (error) {
        const idx = uploads.length + validUploads.length;
        errors[idx] = error;
        setToastMessage(error);
        setShowToast(true);
        continue;
      }
      validUploads.push({
        file,
        platform: 'instagram',
        contentTopic: '',
        targetAudience: 'general_public', // Changed from healthcare_professionals
        priority: 'scheduled', // Changed from low
        scheduledDate: '',
        scheduledTime: '', // ✅ NEW
        departmentId: '', // ✅ NEW
      });
    }

    setValidationErrors(errors);
    if (validUploads.length > 0) {
      setUploads([...uploads, ...validUploads]);
    }
  };

  const updateUpload = (index: number, field: keyof FileUpload, value: string) => {
    const newUploads = [...uploads];
    newUploads[index] = { ...newUploads[index], [field]: value };
    setUploads(newUploads);
  };

  const removeUpload = (index: number) => {
    setUploads(uploads.filter((_, i) => i !== index));
    const newErrors = { ...validationErrors };
    delete newErrors[index];
    setValidationErrors(newErrors);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmitAll = async () => {
    if (!user) return;

    // ✅ Company scoping (Option 1): must have company_id to upload
    if (!companyId) {
      setToastMessage('Company not set. Please complete onboarding or re-login.');
      setShowToast(true);
      return;
    }

    // ✅ Department safety: if no departments exist, block upload
    if (departments.length === 0) {
      setToastMessage('No departments found. Ask an Executive to create departments before uploading.');
      setShowToast(true);
      return;
    }

    setUploading(true);
    setExtracting(true);
    setUploadResults([]);
    setCompletedAnalyses([]);
    setComparisonResults({});
    setActiveComparisonId(null);

    const results: Array<{ success: boolean; message: string; contentId?: string }> = [];
    const analyses: ContentWithReport[] = [];
    const comparisons: Record<string, ComparisonMatrixResult> = {};
    const total = uploads.length;

    for (let i = 0; i < uploads.length; i++) {
      const upload = uploads[i];
      setExtractionProgress({ current: i + 1, total });
      setCurrentExtractingFile(upload.file.name);

      try {
        if (!upload.contentTopic) {
          results.push({ success: false, message: `${upload.file.name}: Content topic is required` });
          continue;
        }

        // ✅ NEW: department required
        if (!upload.departmentId) {
          results.push({ success: false, message: `${upload.file.name}: Department is required` });
          continue;
        }

        const extractionResult = await extractText(upload.file);
        const contentText = extractionResult.rawText;

        addDocument({
          id: crypto.randomUUID(),
          extractionResult,
          platform: upload.platform,
          contentTopic: upload.contentTopic,
          targetAudience: upload.targetAudience,
          addedAt: new Date().toISOString(),
        });

        const ext = '.' + (upload.file.name.split('.').pop() || '').toLowerCase();
        const fileType = ext as '.docx' | '.pdf' | '.txt';

        // Calculate scheduled_date with time — always use new Date() for proper local→UTC conversion
        let finalScheduledDateTime: string | null = null;
        if (upload.scheduledDate && upload.scheduledTime) {
          finalScheduledDateTime = new Date(`${upload.scheduledDate}T${upload.scheduledTime}`).toISOString();
        } else if (upload.scheduledDate) {
          // Default to 9:00 AM local time if only date is provided
          finalScheduledDateTime = new Date(`${upload.scheduledDate}T09:00`).toISOString();
        }
        // console.log('[UploadPage] Scheduled datetime:', { date: upload.scheduledDate, time: upload.scheduledTime, finalISO: finalScheduledDateTime });

        const { data: submission, error: submissionError } = await supabase
          .from('content_submissions')
          .insert({
            company_id: companyId, // ✅ company isolation
            user_id: user.id,
            title: upload.file.name.replace(/\.[^/.]+$/, ''),
            content_text: contentText,
            file_name: upload.file.name,
            file_type: fileType,
            platform: upload.platform as any,
            content_topic: upload.contentTopic,
            target_audience: upload.targetAudience as any,
            status: 'pending',
            priority: upload.priority as any,
            scheduled_date: finalScheduledDateTime, // Updated to use combined date and time
            jurisdiction: selectedJurisdiction === 'all' ? 'nigeria' : selectedJurisdiction,

            // ✅ NEW: department_id saved
            department_id: upload.departmentId || null,
          })
          .select()
          .single();

        if (submissionError) throw submissionError;

        // ✅ Create v1 (original content) in content_versions
        // IMPORTANT: Your DB versioning table uses company_id and requires it for RLS scoping.
        const { error: v1Error } = await (supabase as any).rpc('create_content_version', {
          p_content_id: submission.id,
          p_company_id: companyId,
          p_content_text: contentText,
          p_note: 'Original upload (v1)',
        });

        if (v1Error) {
          logger.error('Failed to create v1 version:', v1Error);
          results.push({
            success: false,
            message: `${upload.file.name}: Failed to snapshot version (v1).`,
          });
          continue;
        }

        const activeJurisdiction = selectedJurisdiction === 'all' ? 'nigeria' : selectedJurisdiction;

        const complianceResult = analyzeCompliance(
          contentText,
          upload.platform,
          upload.targetAudience,
          activeJurisdiction
        );

        if (selectedJurisdiction === 'all') {
          comparisons[submission.id] = analyzeAllJurisdictions(
            contentText,
            upload.platform,
            upload.targetAudience
          );
        }

        const { data: report, error: reportError } = await (supabase as any)
          .from('compliance_reports')
          .insert({
            content_id: submission.id,
            regulation_version: '2026.1',
            overall_risk: complianceResult.overall_risk,
            issues: complianceResult.issues,
            flagged_phrases: complianceResult.flagged_phrases,
            violated_regulations: complianceResult.violated_regulations,
            suggested_rewrites: complianceResult.suggested_rewrites,
            strictness_level: complianceResult.strictness_level,
            jurisdiction: complianceResult.jurisdiction,
          })
          .select()
          .single();

        if (reportError) throw reportError;

        // ✅ Fire-and-forget: enqueue async AI risk analysis
        // This NEVER blocks or fails the upload
        if (companyId) {
          enqueueAIJob(companyId, submission.id).catch(() => { });
        }

        const updatedStatus =
          complianceResult.overall_risk === 'critical'
            ? 'critical'
            : complianceResult.overall_risk === 'high' || complianceResult.overall_risk === 'medium'
              ? 'flagged'
              : 'approved';

        // ✅ IMPORTANT: mark analysis completed in signoff_status
        const { data: updatedSubmission, error: updatedSubmissionError } = await supabase
          .from('content_submissions')
          .update({
            status: updatedStatus,
            signoff_status: 'analyzed',
          })
          .eq('id', submission.id)
          .select()
          .single();

        if (updatedSubmissionError) throw updatedSubmissionError;

        await recordAuditEvent({
          userId: user.id,
          action: 'upload',
          entityType: 'content_submission',
          entityId: submission.id,
          companyId: companyId!,
          metadata: {
            file_name: upload.file.name,
            platform: upload.platform,
            word_count: extractionResult.metadata.wordCount,
            page_count: extractionResult.metadata.pageCount,
            jurisdiction: selectedJurisdiction,
            department_id: upload.departmentId,
          },
        });

        analyses.push({
          submission: updatedSubmission || submission,
          report: report,
        });

        results.push({
          success: true,
          message: `${upload.file.name}: Analysis complete!`,
          contentId: submission.id,
        });

        // ✅ Auto-create calendar event
        try {
          const { createCalendarEvent } = await import('../../lib/calendarService');
          await createCalendarEvent({
            companyId: companyId!,
            submissionId: submission.id,
            title: upload.file.name.replace(/\.[^/.]+$/, ''),
            scheduledDate: finalScheduledDateTime, // ✅ FIX: Use the combined date+time ISO string, NOT bare date
            userId: user.id,
          });
        } catch (calErr) {
          logger.warn('Calendar event creation failed (non-fatal):', calErr);
        }

        // Notify legal/compliance team that new content is ready for review
        if (companyId) {
          sendUserNotification({
            company_id: companyId,
            notify_roles: ['compliance', 'legal', 'compliance_officer'],
            type: 'content_submitted',
            content_id: submission.id,
            content_title: upload.file.name.replace(/\.[^/.]+$/, ''),
            actor_name: profile?.full_name ?? undefined,
          });
        }
      } catch (error) {
        results.push({
          success: false,
          message: `${upload.file.name}: ${error instanceof Error ? error.message : 'Upload failed'}`,
        });
      }
    }

    setExtracting(false);
    setExtractionProgress(null);
    setCurrentExtractingFile('');
    setUploadResults(results);
    setCompletedAnalyses(analyses);
    setComparisonResults(comparisons);
    setUploading(false);

    if (results.some((r) => r.success)) {
      const successCount = results.filter((r) => r.success).length;
      setToastMessage(`${successCount} ${successCount === 1 ? 'file' : 'files'} analyzed successfully!`);
      setShowToast(true);

      if (analyses.length === 1 && selectedJurisdiction !== 'all') {
        setTimeout(() => {
          setSelectedResult(analyses[0]);
        }, 300);
      }

      if (selectedJurisdiction === 'all' && Object.keys(comparisons).length > 0) {
        setActiveComparisonId(Object.keys(comparisons)[0]);
      }
    } else if (results.length > 0) {
      setToastMessage('No files were analyzed. Please fix errors and try again.');
      setShowToast(true);
    }
  };

  const handleViewResult = (contentId: string) => {
    const analysis = completedAnalyses.find((a) => a.submission.id === contentId);
    if (analysis) setSelectedResult(analysis);
  };

  const handleExportPDF = async (analysis: ContentWithReport) => {
    await exportToPDF(analysis.submission, analysis.report);
  };

  // ✅ Send to Legal (only after analyzed AND all claims substantiated)
  const sendToLegal = async (submissionId: string) => {
    if (!user) return;

    if (!companyId) {
      setToastMessage('Company not set. Please complete onboarding or re-login.');
      setShowToast(true);
      return;
    }

    if (!substantiationsComplete) {
      setToastMessage('All critical claims must be linked to approved sources before sending to Legal.');
      setShowToast(true);
      return;
    }

    // Save substantiations into submission metadata
    if (currentSubstantiations.length > 0) {
      await supabase
        .from('content_submissions')
        .update({ metadata: { substantiations: currentSubstantiations } } as any)
        .eq('id', submissionId)
        .eq('company_id', companyId);
    }

    const { data, error } = await supabase
      .from('content_submissions')
      .update({
        signoff_status: 'awaiting_legal',
        submitted_for_legal_at: new Date().toISOString(),
        submitted_for_legal_by: user.id,
        is_locked: true,
        locked_at: new Date().toISOString(),
        locked_by: user.id,
      })
      .eq('id', submissionId)
      .eq('company_id', companyId)
      .in('signoff_status', ['analyzed', 'amend_requested', 'draft'] as any)
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error('Send to legal failed:', error);
      setToastMessage(error.message);
      setShowToast(true);
      return;
    }

    if (!data?.id) {
      setToastMessage('You can only send to Legal after analysis is completed.');
      setShowToast(true);
      return;
    }

    // 🔔 Integration notifications (Slack/Teams/etc)
    try {
      const submission = completedAnalyses.find((a) => a.submission.id === submissionId)?.submission;
      const title = submission?.title || 'New content submitted';
      notify(companyId, 'submission.created', {
        title,
        user_name: (profile as any)?.full_name || (user as any)?.email || 'User',
        organization: (profile as any)?.company_name || 'Company',
        content_id: submissionId,
        review_url: buildReviewUrl(submissionId),
        asset_name: submission?.file_name || null,
      });
    } catch {
      // never block the user
    }

    const { error: rpcError } = await (supabase as any).rpc('notify_legal_review_request', {
      p_content_id: submissionId,
    });

    if (rpcError) {
      logger.error('Notify legal failed:', rpcError);
    }

    // ✅ Create calendar events (both marketing publish + legal review)
    try {
      const { createCalendarEvent, createLegalCalendarEvent } = await import('../../lib/calendarService');
      const sub = completedAnalyses.find((a) => a.submission.id === submissionId);
      const subTitle = sub?.submission?.title || 'Untitled';
      const subDeadline = (sub?.submission as any)?.scheduled_date || new Date().toISOString();

      // Create marketing_publish event so cross-calendar updates work later
      const mktResult = await createCalendarEvent({
        companyId: companyId!,
        submissionId,
        title: subTitle,
        scheduledDate: subDeadline,
        userId: user.id,
        eventType: 'marketing_publish',
      });
      // console.log('Marketing calendar event result:', mktResult ? 'created' : 'FAILED');

      // Create legal_review event
      const legalResult = await createLegalCalendarEvent({
        companyId: companyId!,
        submissionId,
        title: subTitle,
        publishDeadline: subDeadline,
        userId: user.id,
      });
      // console.log('Legal calendar event result:', legalResult ? 'created' : 'FAILED');
    } catch (calErr) {
      logger.warn('Calendar event creation failed (non-fatal):', calErr);
    }

    await recordAuditEvent({
      userId: user.id,
      action: 'sent_for_legal',
      entityType: 'content_submission',
      entityId: submissionId,
      companyId: companyId!,
    });

    setCompletedAnalyses((prev) =>
      prev.map((a) =>
        a.submission.id === submissionId
          ? {
            ...a,
            submission: {
              ...a.submission,
              signoff_status: 'awaiting_legal' as any,
              is_locked: true as any,
            },
          }
          : a
      )
    );

    setSelectedResult((prev) =>
      prev?.submission.id === submissionId
        ? {
          ...prev,
          submission: {
            ...prev.submission,
            signoff_status: 'awaiting_legal' as any,
            is_locked: true as any,
          },
        }
        : prev
    );

    setToastMessage('Sent to Legal / Compliance for review.');
    setShowToast(true);
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low':
        return 'text-[var(--color-success)]';
      case 'medium':
        return 'text-[var(--color-warning)]';
      case 'high':
        return 'text-[var(--color-warning)]';
      case 'critical':
        return 'text-[var(--color-danger)]';
      default:
        return 'dash-text-secondary';
    }
  };

  const getRiskBgColor = (risk: string) => {
    switch (risk) {
      case 'low':
        return 'bg-[var(--color-success-soft)] border-[var(--color-success)]/20';
      case 'medium':
        return 'bg-[var(--color-warning-soft)] border-[var(--color-warning)]/20';
      case 'high':
        return 'bg-[var(--color-warning-soft)] border-[var(--color-warning)]/20';
      case 'critical':
        return 'bg-[var(--color-danger-soft)] border-[var(--color-danger)]/20';
      default:
        return 'dash-surface-alt dash-border';
    }
  };

  const getCategoryBadge = (category?: string) => {
    if (!category) return null;
    const config: Record<string, { label: string; className: string }> = {
      professional_ethics_violation: { label: 'Professional Ethics', className: 'bg-[var(--color-info-soft)] text-[var(--color-info)]' },
      advertising_violation: { label: 'Advertising', className: 'bg-teal-100 text-teal-800' },
      product_violation: { label: 'Product', className: 'dash-surface-alt dash-text' },
    };
    const c = config[category];
    if (!c) return null;
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.className}`}>{c.label}</span>;
  };

  return (
    <div className="space-y-6">
      {showToast && <Toast message={toastMessage} onClose={() => setShowToast(false)} />}

      {isExtracting && (
        <ExtractionSpinner progress={extractionProgress} currentFileName={currentExtractingFile} />
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold dash-text mb-2">Smart Batch Upload</h2>
          <p className="dash-text-secondary">
            Upload multiple files with jurisdiction-aware compliance checking
            <span className="text-xs dash-text-tertiary ml-2">(max 10MB per file)</span>
          </p>
        </div>
        <JurisdictionSelector compact />
      </div>

      <JurisdictionSelector />

      {!companyId && (
        <div className="dash-card border border-behance-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-behance-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-semibold dash-text">Company not set</p>
              <p className="text-xs dash-text-secondary mt-1">
                Your account has no company linked yet. Please complete onboarding or re-login before
                uploading content.
              </p>
            </div>
          </div>
        </div>
      )}

      <div
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${dragActive ? 'border-[var(--color-behance-blue)] bg-[var(--color-info-soft)]' : 'border-[var(--color-border)] hover:border-[var(--color-border-hover)]'
          } ${!companyId ? 'opacity-60 pointer-events-none' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <Upload className="w-12 h-12 dash-text-tertiary mx-auto mb-4" />
        <p className="text-lg font-medium dash-text mb-2">Drag and drop files here</p>
        <p className="text-sm dash-text-secondary mb-4">Supports .docx, .pdf, and .txt files</p>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-[var(--color-behance-blue)] text-white px-6 py-2 rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          Browse Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".docx,.pdf,.txt"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {uploads.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold dash-text">Files to Upload ({uploads.length})</h3>

          {uploads.map((upload, index) => (
            <div key={index} className="dash-card border dash-border rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <FileText className="w-5 h-5 text-[var(--color-behance-blue)]" />
                  <span className="font-medium dash-text">{upload.file.name}</span>
                  <span className="text-xs dash-text-secondary">({formatFileSize(upload.file.size)})</span>
                </div>
                <button
                  onClick={() => removeUpload(index)}
                  className="dash-text-tertiary hover:text-[var(--color-danger)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* ✅ NEW: Department */}
                <div>
                  <label className="block text-sm font-medium dash-text mb-2">
                    Department <span className="text-[var(--color-danger)]">*</span>
                  </label>
                  <select
                    value={upload.departmentId}
                    onChange={(e) => updateUpload(index, 'departmentId', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-behance-blue)] focus:border-transparent"
                  >
                    <option value="">Select department…</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs dash-text-secondary mt-1">This routes the submission.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium dash-text mb-2">
                    Platform <span className="text-[var(--color-danger)]">*</span>
                  </label>
                  <select
                    value={upload.platform}
                    onChange={(e) => updateUpload(index, 'platform', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-behance-blue)] focus:border-transparent"
                  >
                    <option value="instagram">Instagram</option>
                    <option value="x">X (Twitter)</option>
                    <option value="website">Website</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="print">Print</option>
                    <option value="radio">Radio</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium dash-text mb-2">
                    Content Topic <span className="text-[var(--color-danger)]">*</span>
                  </label>
                  <input
                    type="text"
                    value={upload.contentTopic}
                    onChange={(e) => updateUpload(index, 'contentTopic', e.target.value)}
                    placeholder="e.g., Product Launch"
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-behance-blue)] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium dash-text mb-2">
                    Target Audience <span className="text-[var(--color-danger)]">*</span>
                  </label>
                  <select
                    value={upload.targetAudience}
                    onChange={(e) => updateUpload(index, 'targetAudience', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-behance-blue)] focus:border-transparent"
                  >
                    <option value="healthcare_professionals">Healthcare Professionals</option>
                    <option value="patients">Patients</option>
                    <option value="general_public">General Public</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium dash-text mb-2">Priority</label>
                  <select
                    value={upload.priority}
                    onChange={(e) => updateUpload(index, 'priority', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-behance-blue)] focus:border-transparent"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium dash-text mb-2">Scheduled Date</label>
                    <input
                      type="date"
                      value={upload.scheduledDate}
                      onChange={(e) => updateUpload(index, 'scheduledDate', e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-behance-blue)] focus:border-transparent"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium dash-text mb-2">Scheduled Time</label>
                    <input
                      type="time"
                      value={upload.scheduledTime}
                      onChange={(e) => updateUpload(index, 'scheduledTime', e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-behance-blue)] focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={handleSubmitAll}
            disabled={uploading || !companyId}
            className="w-full bg-[var(--color-behance-blue)] text-white py-3 px-6 rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {uploading ? 'Extracting and Analyzing...' : `Upload and Analyze ${uploads.length} File(s)`}
          </button>

          {uploadResults.length > 0 && (
            <div className="dash-card border dash-border rounded-lg p-4">
              <h4 className="font-semibold dash-text mb-3">Analysis Results</h4>
              <div className="space-y-2">
                {uploadResults.map((result, index) => (
                  <div key={index} className="flex items-center justify-between p-3 dash-surface-alt rounded-lg">
                    <div className="flex items-start space-x-2 flex-1">
                      {result.success ? (
                        <CheckCircle className="w-5 h-5 text-[var(--color-success)] flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-[var(--color-danger)] flex-shrink-0 mt-0.5" />
                      )}
                      <p className={`text-sm ${result.success ? 'dash-text' : 'text-[var(--color-danger)]'}`}>
                        {result.message}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      {result.success &&
                        result.contentId &&
                        selectedJurisdiction === 'all' &&
                        comparisonResults[result.contentId] && (
                          <button
                            onClick={() =>
                              setActiveComparisonId(
                                activeComparisonId === result.contentId ? null : result.contentId!
                              )
                            }
                            className="flex items-center space-x-2 bg-[var(--color-surface-alt)] text-white px-4 py-2 rounded-lg hover:dash-card transition-colors text-sm font-medium"
                          >
                            <span>Matrix</span>
                          </button>
                        )}
                      {result.success && result.contentId && (
                        <button
                          onClick={() => handleViewResult(result.contentId!)}
                          className="flex items-center space-x-2 bg-[var(--color-behance-blue)] text-white px-4 py-2 rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors text-sm font-medium"
                        >
                          <Eye className="w-4 h-4" />
                          <span>View Report</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeComparisonId && comparisonResults[activeComparisonId] && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold dash-text">Jurisdiction Comparison Matrix</h3>
            <button onClick={() => setActiveComparisonId(null)} className="dash-text-tertiary hover:dash-text-secondary">
              <X className="w-5 h-5" />
            </button>
          </div>
          <ComparisonMatrix matrix={comparisonResults[activeComparisonId]} onSelectJurisdiction={() => { }} />
        </div>
      )}

      {selectedResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="dash-card rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 dash-card border-b dash-border p-6 flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-xl font-bold dash-text">{selectedResult.submission.title}</h3>
                <p className="text-sm dash-text-secondary mt-1">
                  {selectedResult.submission.platform} &bull; {selectedResult.submission.content_topic}
                </p>
              </div>
              <button onClick={() => setSelectedResult(null)} className="dash-text-tertiary hover:dash-text-secondary ml-4">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className={`border rounded-lg p-4 ${getRiskBgColor(selectedResult.report.overall_risk)}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="font-semibold dash-text">Overall Risk Assessment:</span>
                    <span className={`text-2xl font-bold uppercase ${getRiskColor(selectedResult.report.overall_risk)}`}>
                      {selectedResult.report.overall_risk}
                    </span>
                    <AIRiskBadge submissionId={selectedResult.submission.id} companyId={companyId} />
                  </div>
                  {selectedResult.report.overall_risk === 'low' ? (
                    <CheckCircle className="w-8 h-8 text-[var(--color-success)]" />
                  ) : selectedResult.report.overall_risk === 'medium' ? (
                    <AlertTriangle className="w-8 h-8 text-[var(--color-warning)]" />
                  ) : (
                    <AlertCircle className="w-8 h-8 text-[var(--color-danger)]" />
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-semibold dash-text mb-3">Content</h4>
                <div className="dash-surface-alt rounded-lg p-4 border dash-border">
                  <p className="text-sm dash-text whitespace-pre-wrap">{selectedResult.submission.content_text}</p>
                </div>
              </div>

              {(selectedResult.report.issues as unknown as any[]) && (selectedResult.report.issues as unknown as any[]).length > 0 && (
                <>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-[var(--color-danger)]" />
                      <span className="dash-text-secondary">
                        {(selectedResult.report.issues as unknown as any[]).filter((i) => i.severity === 'Red').length} Critical
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-[var(--color-warning)]" />
                      <span className="dash-text-secondary">
                        {(selectedResult.report.issues as unknown as any[]).filter((i) => i.severity === 'Yellow').length} Warning
                      </span>
                    </span>
                  </div>

                  <div>
                    <h4 className="font-semibold dash-text mb-3 flex items-center space-x-2">
                      <AlertCircle className="w-5 h-5 text-[var(--color-danger)]" />
                      <span>Compliance Issues ({(selectedResult.report.issues as unknown as any[]).length})</span>
                    </h4>
                    <div className="space-y-3">
                      {(selectedResult.report.issues as unknown as any[]).map((issue, index) => (
                        <div
                          key={index}
                          className={`rounded-lg border-l-4 p-4 ${issue.severity === 'Red'
                            ? 'border-l-[#D32F2F] bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20'
                            : 'border-l-[#F59E0B] bg-behance-amber-50 border border-behance-amber-200'
                            }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p
                                className={`font-semibold text-sm ${issue.severity === 'Red' ? 'text-[var(--color-danger)]' : 'text-behance-amber-900'
                                  }`}
                              >
                                {issue.issue}
                              </p>
                              {getCategoryBadge((issue as any).category)}
                            </div>
                            <span
                              className={`flex-shrink-0 ml-3 px-2.5 py-0.5 rounded-full text-xs font-bold ${issue.severity === 'Red'
                                ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                                : 'bg-behance-amber-100 text-behance-amber-800'
                                }`}
                            >
                              {issue.severity}
                            </span>
                          </div>
                          <p className="text-xs dash-text-secondary mb-2 font-mono leading-relaxed">{issue.regulation_cited}</p>
                          <div className="dash-card bg-opacity-60 rounded p-2.5 mt-2">
                            <p className="text-xs font-medium dash-text-secondary uppercase mb-1">Compliant Alternative</p>
                            <p className="text-sm text-[var(--color-success)] font-medium">{issue.suggestion}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Substantiation Panel — must source all critical claims before sending to Legal */}
              {(selectedResult.report.issues as unknown as any[]) && (selectedResult.report.issues as unknown as any[]).length > 0 && selectedResult.submission.signoff_status === 'analyzed' && (
                <SubstantiationPanel
                  issues={selectedResult.report.issues as unknown as any[]}
                  onSubstantiationsChange={(subs, allDone) => {
                    setCurrentSubstantiations(subs);
                    setSubstantiationsComplete(allDone);
                  }}
                />
              )}

              <div className="flex flex-col md:flex-row gap-3 pt-4 border-t dash-border">
                {selectedResult.submission.signoff_status === 'analyzed' ? (
                  <button
                    onClick={() => sendToLegal(selectedResult.submission.id)}
                    disabled={!substantiationsComplete && (selectedResult.report.issues as unknown as any[])?.some((i: any) => i.severity === 'Red' || i.severity === 'High' || i.severity === 'Critical')}
                    className="flex-1 flex items-center justify-center space-x-2 bg-[var(--color-bg)] text-white py-3 px-6 rounded-lg hover:bg-black transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>{substantiationsComplete ? 'Send to Legal Review' : 'Source All Claims First'}</span>
                  </button>
                ) : selectedResult.submission.signoff_status === 'awaiting_legal' ? (
                  <button
                    disabled
                    className="flex-1 flex items-center justify-center space-x-2 bg-[var(--color-surface-alt)] dash-text-secondary py-3 px-6 rounded-lg cursor-not-allowed font-medium"
                  >
                    <span>Already sent to Legal</span>
                  </button>
                ) : null}

                <button
                  onClick={() => handleExportPDF(selectedResult)}
                  className="flex-1 flex items-center justify-center space-x-2 bg-[var(--color-behance-blue)] text-white py-3 px-6 rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors font-medium"
                >
                  <Download className="w-5 h-5" />
                  <span>Export PDF Report</span>
                </button>

                <button
                  onClick={() => setSelectedResult(null)}
                  className="px-6 py-3 border border-[var(--color-border)] dash-text rounded-lg hover:dash-surface-alt transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
