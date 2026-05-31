import type { Database } from './database.types';
import { supabase } from './supabase';

export type ContentSubmission = Database['public']['Tables']['content_submissions']['Row'];
export type ComplianceReport = Database['public']['Tables']['compliance_reports']['Row'];

type ProfileLite = { id: string; full_name: string | null; email: string | null };

function formatDate(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return `${dt.toLocaleDateString()} • ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function shortId(id?: string | null) {
  if (!id) return '—';
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export async function exportToPDF(content: ContentSubmission, report: ComplianceReport) {
  // Pull signature fields safely (they exist in your table)
  const correctedText = (((content as any)?.corrected_text as string) ?? '').trim();
  const correctedAt = (content as any)?.corrected_at as string | null | undefined;
  const correctedBy = (content as any)?.corrected_by as string | null | undefined;

  const legalDecidedAt = (content as any)?.legal_decided_at as string | null | undefined;
  const legalDecidedBy = (content as any)?.legal_decided_by as string | null | undefined;

  const submittedForLegalAt = (content as any)?.submitted_for_legal_at as string | null | undefined;
  const submittedForLegalBy = (content as any)?.submitted_for_legal_by as string | null | undefined;

  // Load names (best-effort; if blocked, fallback to short IDs)
  const ids = [correctedBy, legalDecidedBy, submittedForLegalBy].filter(Boolean) as string[];

  let nameMap = new Map<string, string>();
  if (ids.length > 0) {
    const { data, error } = await supabase.from('profiles').select('id, full_name, email').in('id', ids);
    if (!error && data) {
      (data as ProfileLite[]).forEach((p) => {
        nameMap.set(p.id, p.full_name || p.email || shortId(p.id));
      });
    }
  }

  const correctedByName = correctedBy ? (nameMap.get(correctedBy) || shortId(correctedBy)) : '—';
  const legalByName = legalDecidedBy ? (nameMap.get(legalDecidedBy) || shortId(legalDecidedBy)) : '—';
  const submittedByName = submittedForLegalBy ? (nameMap.get(submittedForLegalBy) || shortId(submittedForLegalBy)) : '—';

  // Optional: latest legal review comment (best-effort)
  let latestLegalComment: string | null = null;
  try {
    const { data } = await supabase
      .from('legal_reviews')
      .select('comments, created_at')
      .eq('content_id', content.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    latestLegalComment = (data as any)?.comments ?? null;
  } catch {
    // ignore
  }

  const html = generateReportHTML({
    content,
    report,
    correctedText,
    correctedAt: correctedAt ?? null,
    correctedByName,
    submittedForLegalAt: submittedForLegalAt ?? null,
    submittedByName,
    legalDecidedAt: legalDecidedAt ?? null,
    legalByName,
    signoffStatus: (content as any)?.signoff_status ?? '—',
    latestLegalComment,
  });

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow pop-ups to export PDF reports');
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.print();
  };
}

export function generateReportHTML(args: {
  content: ContentSubmission;
  report: ComplianceReport;
  correctedText: string;
  correctedAt: string | null;
  correctedByName: string;
  submittedForLegalAt: string | null;
  submittedByName: string;
  legalDecidedAt: string | null;
  legalByName: string;
  signoffStatus: string;
  latestLegalComment: string | null;
}): string {
  const {
    content,
    report,
    correctedText,
    correctedAt,
    correctedByName,
    submittedForLegalAt,
    submittedByName,
    legalDecidedAt,
    legalByName,
    signoffStatus,
    latestLegalComment,
  } = args;

  const safeTargetAudience =
    (content as any)?.target_audience ? String((content as any).target_audience).replace('_', ' ') : '—';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Compliance Report - ${escapeHtml(content.title)}</title>
  <style>
    @media print {
      @page { margin: 1in; size: letter; }
      body { margin: 0; padding: 0; }
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.6;
      color: #1f2937;
      max-width: 8.5in;
      margin: 0 auto;
      padding: 20px;
    }

    .header {
      border-bottom: 3px solid #004A99;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }

    .logo-icon {
      width: 40px;
      height: 40px;
      background-color: #004A99;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 20px;
    }

    h1 { color: #004A99; font-size: 24px; margin: 0 0 6px 0; }
    .subtitle { color: #6b7280; font-size: 14px; margin: 0; }

    .report-meta {
      background-color: #f3f4f6;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 18px;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .meta-item { display: flex; flex-direction: column; }
    .meta-label { font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
    .meta-value { font-size: 14px; color: #1f2937; }

    .risk-badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .risk-low { background-color: #d1fae5; color: #065f46; }
    .risk-medium { background-color: #fef3c7; color: #92400e; }
    .risk-high { background-color: #fed7aa; color: #9a3412; }
    .risk-critical { background-color: #fee2e2; color: #991b1b; }

    .section { margin-bottom: 22px; page-break-inside: avoid; }
    .section-title { font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }

    .content-box {
      background-color: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 10px;
      white-space: pre-wrap;
    }

    .signature-box {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 14px;
    }

    .sig-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .sig-item { background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px; }
    .sig-title { font-size: 11px; color:#6b7280; text-transform: uppercase; font-weight:700; margin:0 0 4px 0; }
    .sig-value { font-size: 13px; color:#111827; margin:0; }

    .issue-card {
      background-color: white;
      border: 1px solid #e5e7eb;
      border-left: 4px solid #ef4444;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .issue-card.warning { border-left-color: #f59e0b; }

    .issue-title { font-weight: 600; color: #111827; margin-bottom: 6px; }
    .issue-text { color: #4b5563; font-size: 14px; margin-bottom: 4px; }

    .footer {
      margin-top: 30px;
      padding-top: 16px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }

    .audit-notice {
      background-color: #fef3c7;
      border: 1px solid #fbbf24;
      border-radius: 6px;
      padding: 12px;
      margin-top: 12px;
      font-size: 12px;
    }
    .audit-notice strong { color: #92400e; }

    .small-muted { font-size: 12px; color:#6b7280; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">
      <div class="logo-icon">C</div>
      <div>
        <h1>Criateur Healthcare Compliance</h1>
        <p class="subtitle">Pharmaceutical Marketing Compliance Report</p>
      </div>
    </div>
  </div>

  <div class="report-meta">
    <div class="meta-grid">
      <div class="meta-item">
        <span class="meta-label">Content Title</span>
        <span class="meta-value">${escapeHtml(content.title)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Platform</span>
        <span class="meta-value">${escapeHtml(content.platform)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Target Audience</span>
        <span class="meta-value">${escapeHtml(safeTargetAudience)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Analysis Date</span>
        <span class="meta-value">${new Date(report.analysis_timestamp || '').toLocaleDateString()}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Regulation Version</span>
        <span class="meta-value">${escapeHtml(report.regulation_version)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Overall Risk</span>
        <span class="risk-badge risk-${escapeHtml(report.overall_risk)}">${escapeHtml(report.overall_risk)}</span>
      </div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Signature Trail</h2>
    <div class="signature-box">
      <div class="sig-grid">
        <div class="sig-item">
          <p class="sig-title">Corrected By (Marketing)</p>
          <p class="sig-value">${escapeHtml(correctedText ? correctedByName : '—')}</p>
          <p class="small-muted">At: ${escapeHtml(correctedText ? formatDate(correctedAt) : '—')}</p>
        </div>
        <div class="sig-item">
          <p class="sig-title">Sent For Legal Review</p>
          <p class="sig-value">${escapeHtml(submittedForLegalAt ? submittedByName : '—')}</p>
          <p class="small-muted">At: ${escapeHtml(formatDate(submittedForLegalAt))}</p>
        </div>
        <div class="sig-item">
          <p class="sig-title">Legal Decision</p>
          <p class="sig-value">${escapeHtml(legalDecidedAt ? legalByName : '—')}</p>
          <p class="small-muted">At: ${escapeHtml(formatDate(legalDecidedAt))}</p>
        </div>
        <div class="sig-item">
          <p class="sig-title">Current Status</p>
          <p class="sig-value">${escapeHtml(signoffStatus)}</p>
          <p class="small-muted">Content ID: ${escapeHtml(content.id)}</p>
        </div>
      </div>

      ${latestLegalComment
      ? `<div style="margin-top:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;">
               <div class="sig-title" style="margin:0 0 6px 0;">Latest Legal Comment</div>
               <div style="font-size:13px;color:#111827;white-space:pre-wrap;">${escapeHtml(latestLegalComment)}</div>
             </div>`
      : ''
    }
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Original Content (Uploaded)</h2>
    <div class="content-box">${escapeHtml(content.content_text)}</div>
  </div>

  <div class="section">
    <h2 class="section-title">Corrected Version (Marketing)</h2>
    ${correctedText
      ? `<div class="content-box">${escapeHtml(correctedText)}</div>`
      : `<div class="content-box" style="background:#fffbeb;border-color:#fbbf24;">
             <strong>No corrected version saved.</strong>
           </div>`
    }
  </div>

  ${(report.issues as unknown as any[]) && (report.issues as unknown as any[]).length > 0
      ? `
  <div class="section">
    <h2 class="section-title">Compliance Issues (${(report.issues as unknown as any[]).length})</h2>
    <div style="display:flex;gap:16px;margin-bottom:16px;">
      <span style="display:flex;align-items:center;gap:6px;">
        <span style="width:12px;height:12px;border-radius:50%;background:#D32F2F;display:inline-block;"></span>
        <span style="font-size:13px;color:#4b5563;">${(report.issues as unknown as any[]).filter((i: any) => i.severity === 'Red').length} Critical</span>
      </span>
      <span style="display:flex;align-items:center;gap:6px;">
        <span style="width:12px;height:12px;border-radius:50%;background:#F59E0B;display:inline-block;"></span>
        <span style="font-size:13px;color:#4b5563;">${(report.issues as unknown as any[]).filter((i: any) => i.severity === 'Yellow').length} Warning</span>
      </span>
    </div>
    ${(report.issues as unknown as any[])
        .map(
          (issue: any) => `
    <div class="issue-card ${issue.severity === 'Yellow' ? 'warning' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div class="issue-title">${escapeHtml(issue.issue)}</div>
        <span style="flex-shrink:0;margin-left:12px;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;${issue.severity === 'Red'
              ? 'background:#fee2e2;color:#991b1b;'
              : 'background:#fef3c7;color:#92400e;'
            }">${escapeHtml(issue.severity)}</span>
      </div>
      <div class="issue-text" style="font-family:monospace;font-size:12px;color:#6b7280;margin-bottom:8px;">${escapeHtml(issue.regulation_cited)}</div>
      <div style="background:#f9fafb;border-radius:4px;padding:8px;margin-top:6px;">
        <div style="font-size:10px;text-transform:uppercase;color:#6b7280;font-weight:600;margin-bottom:4px;">Compliant Alternative</div>
        <div style="font-size:13px;color:#065f46;font-weight:500;">${escapeHtml(issue.suggestion)}</div>
      </div>
    </div>
    `
        )
        .join('')}
  </div>
  `
      : ''
    }

  <div class="audit-notice">
    <strong>Audit Trail Notice:</strong> This compliance report was generated using regulation version ${escapeHtml(
      report.regulation_version
    )} and serves as an official record of content analysis. The strictness level applied was "${escapeHtml(
      report.strictness_level
    )}" based on the selected platform and target audience.
  </div>

  <div class="footer">
    <p><strong>Criateur Healthcare Compliance Dashboard</strong></p>
    <p>RegTech Platform for Pharmaceutical Marketing Compliance</p>
    <p>Generated on ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
  `;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return String(text ?? '').replace(/[&<>"']/g, (m) => map[m]);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Audit Trail PDF Export
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AuditEntryForExport {
  id: string;
  sequence_number: number | null;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  integrity_hash: string | null;
  previous_hash: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
}

interface ChainStatusForExport {
  verified: boolean;
  totalEntries: number;
  brokenAt: string | null;
  checkedAt: string;
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  upload: 'Content Upload',
  sent_for_legal: 'Sent to Legal',
  request_legal_signoff: 'Legal Sign-off Requested',
  legal_approve: 'Legal Approved',
  legal_reject: 'Legal Rejected',
  legal_amend: 'Amendment Requested',
  publish: 'Published',
  approve_content: 'Content Approved',
  reject_content: 'Content Rejected',
  CHAIN_REANCHOR: 'Chain Re-anchor (Forensic)',
};

function fmtActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

function fmtTs(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'Africa/Lagos',
    }) + ' WAT';
  } catch {
    return iso;
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function truncId(id: string | null): string {
  if (!id) return '—';
  return `${id.slice(0, 8)}…`;
}

function truncHash(hash: string | null): string {
  if (!hash) return '—';
  return `${hash.slice(0, 12)}…${hash.slice(-6)}`;
}

/**
 * Export a formatted audit trail PDF suitable for regulatory submission.
 * Opens a print dialog in a new tab — no external dependencies.
 */
export async function exportAuditTrailPDF(
  entries: AuditEntryForExport[],
  chainStatus: ChainStatusForExport,
  companyId: string,
): Promise<void> {
  if (entries.length === 0) return;

  // Sort chronologically for the report
  const sorted = [...entries].sort((a, b) => {
    const sa = a.sequence_number ?? 0;
    const sb = b.sequence_number ?? 0;
    return sa - sb;
  });

  const firstEntry = sorted[0];
  const lastEntry = sorted[sorted.length - 1];

  // Count by action category
  const actionCounts: Record<string, number> = {};
  for (const e of sorted) {
    const label = fmtActionLabel(e.action);
    actionCounts[label] = (actionCounts[label] ?? 0) + 1;
  }

  const reportRef = `CAR-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`;
  const generatedAt = fmtTs(new Date().toISOString());

  // Build table rows (batched into pages implicitly by browser)
  const tableRows = sorted.map((e, idx) => {
    const isReanchor = e.action === 'CHAIN_REANCHOR';
    const rowBg = isReanchor
      ? 'background:#fff7ed;'
      : idx % 2 === 0
        ? 'background:#ffffff;'
        : 'background:#f9fafb;';

    return `
      <tr style="${rowBg}">
        <td style="padding:7px 10px;font-size:11px;color:#6b7280;text-align:center;font-family:monospace;">${e.sequence_number ?? '—'}</td>
        <td style="padding:7px 10px;font-size:11px;white-space:nowrap;">${fmtTs(e.created_at)}</td>
        <td style="padding:7px 10px;font-size:11px;font-weight:600;${isReanchor ? 'color:#b45309;' : ''}">${escapeHtml(fmtActionLabel(e.action))}</td>
        <td style="padding:7px 10px;font-size:11px;font-family:monospace;color:#6b7280;">${truncId(e.user_id)}</td>
        <td style="padding:7px 10px;font-size:11px;">${escapeHtml(e.entity_type)}</td>
        <td style="padding:7px 10px;font-size:11px;font-family:monospace;color:#6b7280;">${truncId(e.entity_id)}</td>
        <td style="padding:7px 10px;font-size:11px;font-family:monospace;color:#374151;">${truncHash(e.integrity_hash)}</td>
      </tr>`;
  }).join('');

  // Action count summary rows
  const summaryRows = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `
      <tr>
        <td style="padding:6px 12px;font-size:12px;">${escapeHtml(label)}</td>
        <td style="padding:6px 12px;font-size:12px;font-weight:700;text-align:right;">${count}</td>
      </tr>`)
    .join('');

  const chainBg = chainStatus.verified ? '#f0fdf4' : '#fef2f2';
  const chainBorder = chainStatus.verified ? '#86efac' : '#fca5a5';
  const chainColor = chainStatus.verified ? '#166534' : '#991b1b';
  const chainLabel = chainStatus.verified ? '✓ VERIFIED — No Tampering Detected' : '⚠ INTEGRITY BROKEN';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Audit Trail Report — ${reportRef}</title>
  <style>
    @media print {
      @page { margin: 0.75in; size: A4; }
      body { margin: 0; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
    }

    * { box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #111827;
      background: #fff;
      max-width: 900px;
      margin: 0 auto;
      padding: 24px;
    }

    /* ── Cover / Header ── */
    .cover {
      border-bottom: 3px solid #1e3a8a;
      padding-bottom: 24px;
      margin-bottom: 28px;
    }
    .cover-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon {
      width: 44px; height: 44px;
      background: #1e3a8a;
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-weight: 800; font-size: 20px;
    }
    .brand-name { font-size: 18px; font-weight: 800; color: #1e3a8a; margin: 0; }
    .brand-sub { font-size: 12px; color: #6b7280; margin: 2px 0 0; }

    .report-title {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      margin: 20px 0 4px;
    }
    .report-subtitle { font-size: 13px; color: #6b7280; margin: 0 0 20px; }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 16px;
    }
    .meta-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 14px;
    }
    .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; font-weight: 600; margin: 0 0 3px; }
    .meta-value { font-size: 13px; font-weight: 600; color: #1e293b; margin: 0; }

    /* ── Chain status ── */
    .chain-banner {
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 24px;
      border: 1px solid ${chainBorder};
      background: ${chainBg};
    }
    .chain-title { font-size: 14px; font-weight: 700; color: ${chainColor}; margin: 0 0 4px; }
    .chain-meta { font-size: 11px; color: #6b7280; margin: 0; }

    /* ── Section headings ── */
    .section { margin-bottom: 28px; }
    .section-heading {
      font-size: 14px;
      font-weight: 700;
      color: #1e3a8a;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 6px;
      margin: 0 0 14px;
    }

    /* ── Summary table ── */
    .summary-table {
      width: 280px;
      border-collapse: collapse;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    .summary-table th {
      background: #1e3a8a;
      color: #fff;
      font-size: 11px;
      padding: 8px 12px;
      text-align: left;
    }
    .summary-table td { border-top: 1px solid #f1f5f9; }
    .summary-table tr:last-child td { border-bottom: none; }

    /* ── Audit ledger table ── */
    .ledger-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    .ledger-table thead tr {
      background: #1e3a8a;
      color: #fff;
    }
    .ledger-table th {
      padding: 9px 10px;
      text-align: left;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      white-space: nowrap;
    }
    .ledger-table tbody tr { border-bottom: 1px solid #f1f5f9; }
    .ledger-table tbody tr:last-child { border-bottom: none; }

    /* ── Legal notice ── */
    .legal-notice {
      background: #fefce8;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 14px 16px;
      font-size: 11px;
      color: #713f12;
      line-height: 1.6;
      margin-bottom: 20px;
    }

    /* ── Footer ── */
    .footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 14px;
      text-align: center;
      font-size: 10px;
      color: #9ca3af;
      line-height: 1.7;
    }

    /* ── Print button (screen only) ── */
    .print-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: #1e3a8a;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      margin-bottom: 24px;
    }
  </style>
</head>
<body>

  <!-- Print Button (hidden when printing) -->
  <div class="no-print" style="text-align:right;margin-bottom:16px;">
    <button class="print-btn" onclick="window.print()">
      &#128438; Print / Save as PDF
    </button>
  </div>

  <!-- ── Cover ── -->
  <div class="cover">
    <div class="cover-top">
      <div class="brand">
        <div class="brand-icon">C</div>
        <div>
          <p class="brand-name">Criateur OS</p>
          <p class="brand-sub">Pharmaceutical Compliance Operating System</p>
        </div>
      </div>
      <div style="text-align:right;">
        <p style="margin:0;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Report Reference</p>
        <p style="margin:4px 0 0;font-size:13px;font-weight:700;font-family:monospace;color:#374151;">${reportRef}</p>
      </div>
    </div>

    <p class="report-title">Compliance Audit Trail Report</p>
    <p class="report-subtitle">Tamper-evident, cryptographically sealed audit ledger — for regulatory submission</p>

    <div class="meta-grid">
      <div class="meta-card">
        <p class="meta-label">Report Period</p>
        <p class="meta-value">${fmtDate(firstEntry.created_at)} –<br>${fmtDate(lastEntry.created_at)}</p>
      </div>
      <div class="meta-card">
        <p class="meta-label">Total Audit Entries</p>
        <p class="meta-value" style="font-size:20px;">${sorted.length.toLocaleString()}</p>
      </div>
      <div class="meta-card">
        <p class="meta-label">Generated</p>
        <p class="meta-value" style="font-size:11px;">${generatedAt}</p>
      </div>
      <div class="meta-card">
        <p class="meta-label">Company ID</p>
        <p class="meta-value" style="font-family:monospace;font-size:11px;">${truncId(companyId)}…</p>
      </div>
      <div class="meta-card">
        <p class="meta-label">Ledger Start Hash</p>
        <p class="meta-value" style="font-family:monospace;font-size:10px;">${truncHash(firstEntry.integrity_hash)}</p>
      </div>
      <div class="meta-card">
        <p class="meta-label">Ledger End Hash</p>
        <p class="meta-value" style="font-family:monospace;font-size:10px;">${truncHash(lastEntry.integrity_hash)}</p>
      </div>
    </div>
  </div>

  <!-- ── Chain Integrity ── -->
  <div class="chain-banner">
    <p class="chain-title">Chain Integrity: ${chainLabel}</p>
    <p class="chain-meta">
      ${chainStatus.totalEntries} entries verified
      ${chainStatus.checkedAt ? ` · Checked at ${fmtTs(chainStatus.checkedAt)}` : ''}
      ${!chainStatus.verified && chainStatus.brokenAt ? ` · Break detected near entry ${chainStatus.brokenAt.slice(0, 8)}` : ''}
    </p>
  </div>

  <!-- ── Event Summary ── -->
  <div class="section">
    <h2 class="section-heading">Event Summary</h2>
    <table class="summary-table">
      <thead>
        <tr>
          <th>Event Type</th>
          <th style="text-align:right;">Count</th>
        </tr>
      </thead>
      <tbody>
        ${summaryRows}
        <tr style="background:#f8fafc;border-top:2px solid #e2e8f0;">
          <td style="padding:8px 12px;font-size:12px;font-weight:700;">Total</td>
          <td style="padding:8px 12px;font-size:12px;font-weight:700;text-align:right;">${sorted.length}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- ── Legal Notice ── -->
  <div class="legal-notice">
    <strong>Regulatory Notice:</strong> This audit trail has been generated by Criateur OS, a pharmaceutical
    compliance management system. Each entry in this ledger is cryptographically linked via SHA-256 hash
    chaining, making retroactive modification detectable. The chain integrity status above confirms whether
    this ledger has remained tamper-free since its inception. This document may be presented to regulatory
    authorities including NAFDAC, FDA, and EMA as evidence of compliance governance activities.
  </div>

  <!-- ── Full Audit Ledger ── -->
  <div class="section page-break">
    <h2 class="section-heading">Full Audit Ledger (${sorted.length} Entries)</h2>
    <table class="ledger-table">
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th style="width:170px;">Timestamp (WAT)</th>
          <th>Event</th>
          <th style="width:90px;">Actor ID</th>
          <th style="width:100px;">Resource Type</th>
          <th style="width:90px;">Resource ID</th>
          <th style="width:140px;">Entry Hash</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </div>

  <!-- ── Footer ── -->
  <div class="footer">
    <p><strong>Criateur OS</strong> — Pharmaceutical Compliance Operating System</p>
    <p>Report Reference: ${reportRef} · Generated: ${generatedAt}</p>
    <p>This document is system-generated and does not require a physical signature. Chain integrity verification serves as the digital seal.</p>
  </div>

</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow pop-ups to export PDF reports');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
}
