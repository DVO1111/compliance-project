import { supabase } from './supabase';
import type { Database } from './database.types';

type ComplianceIssueRecord = any;
type FlaggedPhrase = any;
type ViolatedRegulation = any;

type ContentSubmission = Database['public']['Tables']['content_submissions']['Row'];
type ComplianceReport = Database['public']['Tables']['compliance_reports']['Row'];
type LegalReview = Database['public']['Tables']['legal_reviews']['Row'];
type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

/* ─── helpers ──────────────────────────────────────────────────── */

function esc(text: string | null | undefined): string {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text ?? '').replace(/[&<>"']/g, (m) => map[m]);
}

function fmtDate(d?: string | null): string {
    if (!d) return '—';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtDateTime(d?: string | null): string {
    if (!d) return '—';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    return `${dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} at ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function shortId(id?: string | null): string {
    if (!id) return '—';
    return `${id.slice(0, 8)}`;
}

function riskColor(risk: string): string {
    switch (risk) {
        case 'low': return '#059669';
        case 'medium': return '#D97706';
        case 'high': return '#EA580C';
        case 'critical': return '#DC2626';
        default: return '#6B7280';
    }
}

function severityBadge(sev: string): string {
    const color = sev === 'Red' ? '#DC2626' : '#D97706';
    const bg = sev === 'Red' ? '#FEE2E2' : '#FEF3C7';
    return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;color:${color};background:${bg};">${esc(sev)}</span>`;
}

function statusLabel(s: string): string {
    return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─── main export ──────────────────────────────────────────────── */

export async function generateDossier(contentId: string): Promise<void> {
    // ── 1. Fetch all data in parallel ──
    const [contentRes, reportRes, reviewsRes, auditRes] = await Promise.all([
        supabase.from('content_submissions').select('*').eq('id', contentId).maybeSingle(),
        supabase.from('compliance_reports').select('*').eq('content_id', contentId).maybeSingle(),
        supabase.from('legal_reviews').select('*').eq('content_id', contentId).order('created_at', { ascending: true }),
        supabase.from('audit_logs').select('*').eq('entity_id', contentId).eq('entity_type', 'content_submission').order('created_at', { ascending: true }),
    ]);

    const content = contentRes.data as ContentSubmission | null;
    if (!content) {
        alert('Content not found. Cannot generate dossier.');
        return;
    }

    const report = reportRes.data as ComplianceReport | null;
    const reviews = (reviewsRes.data || []) as LegalReview[];
    const auditLogs = (auditRes.data || []) as AuditLog[];

    // ── 2. Resolve user names ──
    const userIds = new Set<string>();
    userIds.add(content.user_id);
    if ((content as any).corrected_by) userIds.add((content as any).corrected_by);
    if (content.legal_decided_by) userIds.add(content.legal_decided_by);
    if ((content as any).submitted_for_legal_by) userIds.add((content as any).submitted_for_legal_by);
    if (content.published_by) userIds.add(content.published_by);
    if (content.locked_by) userIds.add(content.locked_by);
    reviews.forEach((r) => { if (r.reviewer_id) userIds.add(r.reviewer_id); });
    auditLogs.forEach((a) => { if (a.user_id) userIds.add(a.user_id); });

    let nameMap = new Map<string, string>();
    if (userIds.size > 0) {
        const { data } = await supabase.from('profiles').select('id, full_name, email, organization').in('id', [...userIds]);
        if (data) {
            (data as Profile[]).forEach((p) => {
                nameMap.set(p.id, p.full_name || p.email || shortId(p.id));
            });
        }
    }

    const getName = (id?: string | null) => id ? (nameMap.get(id) || shortId(id)) : '—';

    // ── 3. Get organization name ──
    let orgName = 'Organization';
    if (content.company_id) {
        const { data: companyProfiles } = await supabase
            .from('profiles')
            .select('organization')
            .eq('company_id', content.company_id)
            .limit(1);
        if (companyProfiles && companyProfiles.length > 0 && (companyProfiles[0] as Profile).organization) {
            orgName = (companyProfiles[0] as Profile).organization!;
        }
    }

    // ── 4. Build the HTML document ──
    const correctedText = ((content as any)?.corrected_text as string) ?? '';
    const signoffStatus = (content as any)?.signoff_status ?? 'draft';
    const jurisdiction = content.jurisdiction || 'Nigeria (NAFDAC)';

    const html = buildDossierHTML({
        content,
        report,
        reviews,
        auditLogs,
        correctedText,
        signoffStatus,
        jurisdiction,
        orgName,
        getName,
    });

    // ── 5. Open in new window for print ──
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Please allow pop-ups to generate the dossier.');
        return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HTML BUILDER                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function buildDossierHTML(args: {
    content: ContentSubmission;
    report: ComplianceReport | null;
    reviews: LegalReview[];
    auditLogs: AuditLog[];
    correctedText: string;
    signoffStatus: string;
    jurisdiction: string;
    orgName: string;
    getName: (id?: string | null) => string;
}): string {
    const { content, report, reviews, auditLogs, correctedText, signoffStatus, jurisdiction, orgName, getName } = args;
    const now = new Date();
    const refId = `DOSSIER-${shortId(content.id).toUpperCase()}-${now.getFullYear()}`;
    const targetAudience = ((content as any)?.target_audience ?? '').replace(/_/g, ' ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Regulatory Dossier — ${esc(content.title)}</title>
  <style>${DOSSIER_CSS}</style>
</head>
<body>

<!-- ═══════ SECTION 1: COVER PAGE ═══════ -->
<div class="cover-page">
  <div class="cover-badge">REGULATORY SUBMISSION DOSSIER</div>
  <div class="cover-logo">
    <div class="logo-icon">C</div>
    <div>
      <div class="cover-company">Criateur Healthcare Compliance</div>
      <div class="cover-tagline">RegTech Platform for Pharmaceutical Marketing</div>
    </div>
  </div>
  <h1 class="cover-title">${esc(content.title)}</h1>
  <div class="cover-meta">
    <div class="cover-meta-row"><span class="cover-label">Prepared For</span><span class="cover-value">${esc(jurisdiction)}</span></div>
    <div class="cover-meta-row"><span class="cover-label">Organization</span><span class="cover-value">${esc(orgName)}</span></div>
    <div class="cover-meta-row"><span class="cover-label">Reference ID</span><span class="cover-value">${esc(refId)}</span></div>
    <div class="cover-meta-row"><span class="cover-label">Submission Date</span><span class="cover-value">${fmtDate(now.toISOString())}</span></div>
    <div class="cover-meta-row"><span class="cover-label">Platform</span><span class="cover-value">${esc(content.platform)}</span></div>
    <div class="cover-meta-row"><span class="cover-label">Sign-Off Status</span><span class="cover-value status-badge">${esc(statusLabel(signoffStatus))}</span></div>
  </div>
  <div class="cover-footer">
    <p><strong>CONFIDENTIAL</strong> — This dossier is prepared for regulatory review purposes only.</p>
    <p>Generated by Criateur Healthcare Compliance Platform on ${fmtDateTime(now.toISOString())}</p>
  </div>
</div>

<!-- ═══════ SECTION 2: TABLE OF CONTENTS ═══════ -->
<div class="page-break"></div>
<div class="section">
  <h2 class="section-number">Section I</h2>
  <h2 class="section-title">Table of Contents</h2>
  <div class="toc">
    <div class="toc-item"><span class="toc-num">I</span><span class="toc-text">Table of Contents</span></div>
    <div class="toc-item"><span class="toc-num">II</span><span class="toc-text">Product / Campaign Summary</span></div>
    <div class="toc-item"><span class="toc-num">III</span><span class="toc-text">Original Advertisement Copy</span></div>
    <div class="toc-item"><span class="toc-num">IV</span><span class="toc-text">AI Compliance Analysis Certificate</span></div>
    <div class="toc-item"><span class="toc-num">V</span><span class="toc-text">Corrected Advertisement Copy</span></div>
    <div class="toc-item"><span class="toc-num">VI</span><span class="toc-text">Compliance Issues & Remediation Log</span></div>
    <div class="toc-item"><span class="toc-num">VII</span><span class="toc-text">Flagged Phrases Registry</span></div>
    <div class="toc-item"><span class="toc-num">VIII</span><span class="toc-text">Violated Regulations Reference</span></div>
    <div class="toc-item"><span class="toc-num">IX</span><span class="toc-text">Legal Review History</span></div>
    <div class="toc-item"><span class="toc-num">X</span><span class="toc-text">Sign-Off & Publication Record</span></div>
    <div class="toc-item"><span class="toc-num">XI</span><span class="toc-text">Complete Audit Trail</span></div>
    <div class="toc-item"><span class="toc-num">XII</span><span class="toc-text">Regulatory Declaration</span></div>
  </div>
</div>

<!-- ═══════ SECTION 3: PRODUCT / CAMPAIGN SUMMARY ═══════ -->
<div class="page-break"></div>
<div class="section">
  <h2 class="section-number">Section II</h2>
  <h2 class="section-title">Product / Campaign Summary</h2>
  <table class="info-table">
    <tr><td class="info-label">Content Title</td><td class="info-value">${esc(content.title)}</td></tr>
    <tr><td class="info-label">Content Topic</td><td class="info-value">${esc(content.content_topic)}</td></tr>
    <tr><td class="info-label">Platform</td><td class="info-value">${esc(content.platform)}</td></tr>
    <tr><td class="info-label">Target Audience</td><td class="info-value">${esc(targetAudience)}</td></tr>
    <tr><td class="info-label">Jurisdiction</td><td class="info-value">${esc(jurisdiction)}</td></tr>
    <tr><td class="info-label">Priority</td><td class="info-value">${esc(content.priority)}</td></tr>
    <tr><td class="info-label">Department</td><td class="info-value">${esc(content.department || '—')}</td></tr>
    <tr><td class="info-label">Scheduled Date</td><td class="info-value">${fmtDate(content.scheduled_date)}</td></tr>
    <tr><td class="info-label">Submitted By</td><td class="info-value">${esc(getName(content.user_id))}</td></tr>
    <tr><td class="info-label">Submission Date</td><td class="info-value">${fmtDateTime(content.created_at)}</td></tr>
    <tr><td class="info-label">File Name</td><td class="info-value">${esc(content.file_name)} (${esc(content.file_type)})</td></tr>
    <tr><td class="info-label">Reference ID</td><td class="info-value" style="font-family:monospace;">${esc(content.id)}</td></tr>
  </table>
</div>

<!-- ═══════ SECTION 4: ORIGINAL ADVERTISEMENT COPY ═══════ -->
<div class="page-break"></div>
<div class="section">
  <h2 class="section-number">Section III</h2>
  <h2 class="section-title">Original Advertisement Copy</h2>
  <p class="section-desc">The verbatim content as submitted for compliance review.</p>
  <div class="content-box">${esc(content.content_text)}</div>
</div>

<!-- ═══════ SECTION 5: AI COMPLIANCE ANALYSIS CERTIFICATE ═══════ -->
<div class="page-break"></div>
<div class="section">
  <h2 class="section-number">Section IV</h2>
  <h2 class="section-title">AI Compliance Analysis Certificate</h2>
  ${report ? `
  <div class="certificate-box">
    <div class="cert-header">
      <div class="cert-seal">✓</div>
      <div>
        <h3 class="cert-title">Compliance Analysis Completed</h3>
        <p class="cert-sub">Automated analysis performed on ${fmtDate(report.analysis_timestamp)}</p>
      </div>
    </div>
    <div class="cert-grid">
      <div class="cert-item">
        <span class="cert-label">Overall Risk Level</span>
        <span class="cert-value" style="color:${riskColor(report.overall_risk)};font-weight:800;font-size:18px;text-transform:uppercase;">${esc(report.overall_risk)}</span>
      </div>
      <div class="cert-item">
        <span class="cert-label">Regulation Version</span>
        <span class="cert-value">${esc(report.regulation_version)}</span>
      </div>
      <div class="cert-item">
        <span class="cert-label">Strictness Level</span>
        <span class="cert-value">${esc(report.strictness_level)}</span>
      </div>
      <div class="cert-item">
        <span class="cert-label">Jurisdiction</span>
        <span class="cert-value">${esc(report.jurisdiction)}</span>
      </div>
      <div class="cert-item">
        <span class="cert-label">Issues Found</span>
        <span class="cert-value">${report.issues?.length ?? 0} issue(s)</span>
      </div>
      <div class="cert-item">
        <span class="cert-label">Flagged Phrases</span>
        <span class="cert-value">${report.flagged_phrases?.length ?? 0} phrase(s)</span>
      </div>
      <div class="cert-item">
        <span class="cert-label">Violated Regulations</span>
        <span class="cert-value">${report.violated_regulations?.length ?? 0} regulation(s)</span>
      </div>
      <div class="cert-item">
        <span class="cert-label">Content Status</span>
        <span class="cert-value">${esc(statusLabel((content as any).status))}</span>
      </div>
    </div>
  </div>
  ` : `<div class="notice-box warning">No compliance analysis report found for this content submission.</div>`}
</div>

<!-- ═══════ SECTION 6: CORRECTED ADVERTISEMENT COPY ═══════ -->
<div class="page-break"></div>
<div class="section">
  <h2 class="section-number">Section V</h2>
  <h2 class="section-title">Corrected Advertisement Copy</h2>
  ${correctedText.trim() ? `
  <p class="section-desc">The revised content after compliance remediation by the marketing team.</p>
  <div class="content-box corrected">${esc(correctedText)}</div>
  <div class="sig-row">
    <div class="sig-item-small"><span class="sig-label">Corrected By</span><span class="sig-val">${esc(getName((content as any).corrected_by))}</span></div>
    <div class="sig-item-small"><span class="sig-label">Corrected At</span><span class="sig-val">${fmtDateTime((content as any).corrected_at)}</span></div>
  </div>
  ` : `<div class="notice-box warning">No corrected version has been submitted for this content.</div>`}
</div>

<!-- ═══════ SECTION 7: COMPLIANCE ISSUES & REMEDIATION LOG ═══════ -->
<div class="page-break"></div>
<div class="section">
  <h2 class="section-number">Section VI</h2>
  <h2 class="section-title">Compliance Issues & Remediation Log</h2>
  ${report && report.issues && (report.issues as unknown as any[]).length > 0 ? `
  <p class="section-desc">${(report.issues as unknown as any[]).length} compliance issue(s) identified during analysis.</p>
  <div class="issues-summary">
    <span class="issue-count red">${(report.issues as unknown as any[]).filter((i: any) => i.severity === 'Red').length} Critical</span>
    <span class="issue-count yellow">${(report.issues as unknown as any[]).filter((i: any) => i.severity === 'Yellow').length} Warning</span>
  </div>
  ${(report.issues as unknown as any[]).map((issue: ComplianceIssueRecord, idx: number) => `
  <div class="issue-card ${issue.severity === 'Yellow' ? 'warning' : 'critical'}">
    <div class="issue-header">
      <span class="issue-num">#${idx + 1}</span>
      <span class="issue-title">${esc(issue.issue)}</span>
      ${severityBadge(issue.severity)}
    </div>
    <table class="issue-detail-table">
      <tr><td class="detail-label">Regulation Cited</td><td>${esc(issue.regulation_cited)}</td></tr>
      <tr><td class="detail-label">Category</td><td>${esc(statusLabel(issue.category || 'general'))}</td></tr>
      ${issue.jurisdiction ? `<tr><td class="detail-label">Jurisdiction</td><td>${esc(issue.jurisdiction)}</td></tr>` : ''}
      <tr><td class="detail-label">Suggested Remediation</td><td class="suggestion">${esc(issue.suggestion)}</td></tr>
    </table>
  </div>
  `).join('')}
  ` : `<div class="notice-box success">No compliance issues were identified. The content passed all automated checks.</div>`}
</div>

<!-- ═══════ SECTION 8: FLAGGED PHRASES REGISTRY ═══════ -->
<div class="page-break"></div>
<div class="section">
  <h2 class="section-number">Section VII</h2>
  <h2 class="section-title">Flagged Phrases Registry</h2>
  ${report && report.flagged_phrases && (report.flagged_phrases as unknown as any[]).length > 0 ? `
  <p class="section-desc">Specific phrases identified as potentially non-compliant.</p>
  <table class="data-table">
    <thead><tr><th>#</th><th>Phrase</th><th>Position</th><th>Context</th></tr></thead>
    <tbody>
    ${(report.flagged_phrases as unknown as any[]).map((fp: FlaggedPhrase, idx: number) => `
      <tr>
        <td class="center">${idx + 1}</td>
        <td class="phrase-cell">${esc(fp.phrase)}</td>
        <td class="center">${fp.position}</td>
        <td>${esc(fp.context)}</td>
      </tr>
    `).join('')}
    </tbody>
  </table>
  ` : `<div class="notice-box success">No phrases were flagged during compliance analysis.</div>`}
</div>

<!-- ═══════ SECTION 9: VIOLATED REGULATIONS REFERENCE ═══════ -->
<div class="page-break"></div>
<div class="section">
  <h2 class="section-number">Section VIII</h2>
  <h2 class="section-title">Violated Regulations Reference</h2>
  ${report && report.violated_regulations && (report.violated_regulations as unknown as any[]).length > 0 ? `
  <p class="section-desc">Specific regulations cited as violated by the content.</p>
  <table class="data-table">
    <thead><tr><th>#</th><th>Regulation</th><th>Violated Clause</th><th>Severity</th></tr></thead>
    <tbody>
    ${(report.violated_regulations as unknown as any[]).map((vr: ViolatedRegulation, idx: number) => `
      <tr>
        <td class="center">${idx + 1}</td>
        <td><strong>${esc(vr.regulation_title)}</strong><br><span class="mono-small">${esc(vr.regulation_id)}</span></td>
        <td>${esc(vr.violated_clause)}</td>
        <td class="center"><span style="color:${riskColor(vr.severity)};font-weight:700;text-transform:uppercase;">${esc(vr.severity)}</span></td>
      </tr>
    `).join('')}
    </tbody>
  </table>
  ` : `<div class="notice-box success">No regulation violations were identified.</div>`}
</div>

<!-- ═══════ SECTION 10: LEGAL REVIEW HISTORY ═══════ -->
<div class="page-break"></div>
<div class="section">
  <h2 class="section-number">Section IX</h2>
  <h2 class="section-title">Legal Review History</h2>
  ${reviews.length > 0 ? `
  <p class="section-desc">${reviews.length} legal review round(s) documented.</p>
  ${reviews.map((rev, idx) => `
  <div class="review-card">
    <div class="review-header">
      <span class="review-round">Round ${idx + 1}</span>
      <span class="review-status ${rev.status}">${esc(statusLabel(rev.status))}</span>
    </div>
    <table class="info-table compact">
      <tr><td class="info-label">Reviewer</td><td class="info-value">${esc(getName(rev.reviewer_id))}</td></tr>
      <tr><td class="info-label">Decision</td><td class="info-value"><strong>${esc(statusLabel(rev.status))}</strong></td></tr>
      <tr><td class="info-label">Date</td><td class="info-value">${fmtDateTime(rev.created_at)}</td></tr>
      ${rev.comments ? `<tr><td class="info-label">Comments</td><td class="info-value">${esc(rev.comments)}</td></tr>` : ''}
    </table>
  </div>
  `).join('')}
  ` : `<div class="notice-box info">No legal review records found for this submission.</div>`}
</div>

<!-- ═══════ SECTION 11: SIGN-OFF & PUBLICATION RECORD ═══════ -->
<div class="page-break"></div>
<div class="section">
  <h2 class="section-number">Section X</h2>
  <h2 class="section-title">Sign-Off & Publication Record</h2>
  <div class="timeline">
    <div class="timeline-item">
      <div class="timeline-dot submitted"></div>
      <div class="timeline-content">
        <div class="timeline-title">Content Submitted</div>
        <div class="timeline-detail">${esc(getName(content.user_id))} • ${fmtDateTime(content.created_at)}</div>
      </div>
    </div>
    ${(content as any).submitted_for_legal_at ? `
    <div class="timeline-item">
      <div class="timeline-dot legal"></div>
      <div class="timeline-content">
        <div class="timeline-title">Submitted for Legal Review</div>
        <div class="timeline-detail">${esc(getName((content as any).submitted_for_legal_by))} • ${fmtDateTime((content as any).submitted_for_legal_at)}</div>
      </div>
    </div>
    ` : ''}
    ${content.legal_decided_at ? `
    <div class="timeline-item">
      <div class="timeline-dot ${signoffStatus === 'rejected' ? 'rejected' : 'approved'}"></div>
      <div class="timeline-content">
        <div class="timeline-title">Legal Decision: ${esc(statusLabel(signoffStatus))}</div>
        <div class="timeline-detail">${esc(getName(content.legal_decided_by))} • ${fmtDateTime(content.legal_decided_at)}</div>
      </div>
    </div>
    ` : ''}
    ${content.published_at ? `
    <div class="timeline-item">
      <div class="timeline-dot published"></div>
      <div class="timeline-content">
        <div class="timeline-title">Published</div>
        <div class="timeline-detail">${esc(getName(content.published_by))} • ${fmtDateTime(content.published_at)}</div>
      </div>
    </div>
    ` : ''}
  </div>
  <div class="current-status-box">
    <span class="cs-label">Current Sign-Off Status:</span>
    <span class="cs-value">${esc(statusLabel(signoffStatus))}</span>
  </div>
</div>

<!-- ═══════ SECTION 12: COMPLETE AUDIT TRAIL ═══════ -->
<div class="page-break"></div>
<div class="section">
  <h2 class="section-number">Section XI</h2>
  <h2 class="section-title">Complete Audit Trail</h2>
  ${auditLogs.length > 0 ? `
  <p class="section-desc">${auditLogs.length} audited action(s) recorded for this submission.</p>
  <table class="data-table">
    <thead><tr><th>#</th><th>Action</th><th>User</th><th>Timestamp</th></tr></thead>
    <tbody>
    ${auditLogs.map((log, idx) => `
      <tr>
        <td class="center">${idx + 1}</td>
        <td>${esc(statusLabel(log.action))}</td>
        <td>${esc(getName(log.user_id))}</td>
        <td>${fmtDateTime(log.created_at)}</td>
      </tr>
    `).join('')}
    </tbody>
  </table>
  ` : `<div class="notice-box info">No audit trail entries found.</div>`}
</div>

<!-- ═══════ SECTION 13: REGULATORY DECLARATION ═══════ -->
<div class="page-break"></div>
<div class="section">
  <h2 class="section-number">Section XII</h2>
  <h2 class="section-title">Declaration of Compliance</h2>
  <div class="declaration-box">
    <p>We, the undersigned, hereby declare that the above pharmaceutical marketing content identified as <strong>"${esc(content.title)}"</strong> (Reference: <code>${esc(content.id)}</code>) has been:</p>
    <ol>
      <li>Subjected to automated compliance analysis against applicable ${esc(jurisdiction)} regulations;</li>
      <li>Reviewed and remediated by the marketing team to address all identified compliance issues;</li>
      <li>Reviewed by qualified legal counsel for regulatory compliance;</li>
      <li>Approved for dissemination through the designated platform (${esc(content.platform)});</li>
      <li>All supporting documentation has been preserved and is available for inspection.</li>
    </ol>
    <p>This dossier constitutes a complete record of the compliance review process and is submitted in support of the advertisement application to the relevant regulatory authority.</p>
    <div class="sig-grid">
      <div class="sig-block">
        <div class="sig-line"></div>
        <p class="sig-label-under">Marketing Officer</p>
        <p class="sig-name-small">${esc(getName(content.user_id))}</p>
        <p class="sig-date-small">Date: _______________</p>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <p class="sig-label-under">Legal / Compliance Officer</p>
        <p class="sig-name-small">${esc(getName(content.legal_decided_by))}</p>
        <p class="sig-date-small">Date: _______________</p>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <p class="sig-label-under">Regulatory Affairs Manager</p>
        <p class="sig-name-small">&nbsp;</p>
        <p class="sig-date-small">Date: _______________</p>
      </div>
    </div>
  </div>
</div>

<!-- ═══════ SECTION 14: FOOTER ═══════ -->
<div class="document-footer">
  <div class="footer-line"></div>
  <p><strong>Criateur Healthcare Compliance — Regulatory Submission Dossier</strong></p>
  <p>Reference: ${esc(refId)} • Generated: ${fmtDateTime(now.toISOString())}</p>
  <p class="confidential">CONFIDENTIAL — For regulatory review purposes only. Unauthorized distribution is prohibited.</p>
</div>

</body>
</html>`;
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CSS                                                           */
/* ═══════════════════════════════════════════════════════════════ */

const DOSSIER_CSS = `
  @media print {
    @page { margin: 0.8in; size: letter; }
    body { margin: 0; padding: 0; }
    .page-break { page-break-before: always; }
    .cover-page { page-break-after: always; }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
    line-height: 1.7;
    color: #1a1a2e;
    max-width: 8.5in;
    margin: 0 auto;
    padding: 0;
    background: white;
  }

  /* ── Cover Page ── */
  .cover-page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 60px 40px;
    text-align: center;
    position: relative;
    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  }

  .cover-badge {
    position: absolute;
    top: 40px;
    left: 50%;
    transform: translateX(-50%);
    background: #004A99;
    color: white;
    padding: 6px 20px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
  }

  .cover-logo {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 40px;
  }

  .logo-icon {
    width: 48px;
    height: 48px;
    background: #004A99;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 800;
    font-size: 24px;
  }

  .cover-company { font-size: 16px; font-weight: 700; color: #004A99; }
  .cover-tagline { font-size: 12px; color: #64748b; }

  .cover-title {
    font-size: 32px;
    font-weight: 800;
    color: #1a1a2e;
    margin-bottom: 40px;
    max-width: 500px;
    line-height: 1.3;
  }

  .cover-meta {
    background: white;
    border-radius: 12px;
    padding: 24px 32px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.06);
    width: 100%;
    max-width: 440px;
  }

  .cover-meta-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #f1f5f9;
  }
  .cover-meta-row:last-child { border-bottom: none; }
  .cover-label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; }
  .cover-value { font-size: 13px; color: #1a1a2e; font-weight: 600; }
  .status-badge { color: #004A99; }

  .cover-footer {
    position: absolute;
    bottom: 40px;
    text-align: center;
  }
  .cover-footer p { font-size: 10px; color: #94a3b8; margin-bottom: 4px; }

  /* ── Sections ── */
  .section { padding: 40px; }
  .section-number { font-size: 12px; color: #004A99; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
  .section-title { font-size: 22px; font-weight: 800; color: #1a1a2e; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 3px solid #004A99; }
  .section-desc { font-size: 13px; color: #64748b; margin-bottom: 16px; }

  .page-break { height: 0; }

  /* ── TOC ── */
  .toc { margin-top: 12px; }
  .toc-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px dotted #e2e8f0; }
  .toc-num { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: #004A99; color: white; font-size: 11px; font-weight: 700; flex-shrink: 0; }
  .toc-text { font-size: 14px; color: #1a1a2e; font-weight: 500; }

  /* ── Info Table ── */
  .info-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  .info-table td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
  .info-table .info-label { width: 180px; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; background: #f8fafc; }
  .info-table .info-value { color: #1a1a2e; }
  .info-table.compact td { padding: 6px 10px; font-size: 12px; }

  /* ── Content Box ── */
  .content-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 20px;
    white-space: pre-wrap;
    font-size: 13px;
    line-height: 1.8;
    color: #1a1a2e;
    margin-bottom: 12px;
  }
  .content-box.corrected { border-left: 4px solid #059669; background: #f0fdf4; }

  /* ── Certificate Box ── */
  .certificate-box {
    border: 2px solid #004A99;
    border-radius: 12px;
    padding: 24px;
    background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%);
  }
  .cert-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
  .cert-seal {
    width: 48px; height: 48px;
    border-radius: 50%;
    background: #059669;
    color: white;
    display: flex; align-items: center; justify-content: center;
    font-size: 24px; font-weight: 800;
  }
  .cert-title { font-size: 16px; font-weight: 700; color: #1a1a2e; }
  .cert-sub { font-size: 12px; color: #64748b; }
  .cert-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .cert-item { background: white; border-radius: 8px; padding: 12px; border: 1px solid #e2e8f0; }
  .cert-label { display: block; font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
  .cert-value { display: block; font-size: 14px; color: #1a1a2e; font-weight: 600; }

  /* ── Data Tables ── */
  .data-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
  .data-table th { background: #004A99; color: white; padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .data-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .data-table tr:nth-child(even) td { background: #f8fafc; }
  .data-table .center { text-align: center; }
  .data-table .phrase-cell { font-family: monospace; font-weight: 600; color: #DC2626; }
  .mono-small { font-family: monospace; font-size: 10px; color: #94a3b8; }

  /* ── Issues ── */
  .issues-summary { display: flex; gap: 16px; margin-bottom: 16px; }
  .issue-count { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; }
  .issue-count.red::before { content: ''; width: 12px; height: 12px; border-radius: 50%; background: #DC2626; }
  .issue-count.yellow::before { content: ''; width: 12px; height: 12px; border-radius: 50%; background: #D97706; }

  .issue-card { border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 14px; overflow: hidden; }
  .issue-card.critical { border-left: 5px solid #DC2626; }
  .issue-card.warning { border-left: 5px solid #D97706; }
  .issue-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: #f8fafc; }
  .issue-num { font-size: 11px; font-weight: 700; color: #64748b; }
  .issue-title { flex: 1; font-size: 13px; font-weight: 600; color: #1a1a2e; }

  .issue-detail-table { width: 100%; border-collapse: collapse; }
  .issue-detail-table td { padding: 8px 16px; border-top: 1px solid #f1f5f9; font-size: 12px; }
  .issue-detail-table .detail-label { width: 160px; font-weight: 600; color: #64748b; text-transform: uppercase; font-size: 10px; }
  .suggestion { color: #059669; font-weight: 500; }

  /* ── Reviews ── */
  .review-card { border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 14px; overflow: hidden; }
  .review-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #f8fafc; }
  .review-round { font-size: 13px; font-weight: 700; color: #1a1a2e; }
  .review-status { font-size: 11px; font-weight: 700; padding: 3px 12px; border-radius: 12px; text-transform: uppercase; }
  .review-status.approved { background: #d1fae5; color: #065f46; }
  .review-status.rejected { background: #fee2e2; color: #991b1b; }
  .review-status.pending { background: #fef3c7; color: #92400e; }

  /* ── Timeline ── */
  .timeline { margin: 20px 0; padding-left: 20px; border-left: 3px solid #e2e8f0; }
  .timeline-item { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 20px; position: relative; }
  .timeline-dot { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; margin-left: -27px; border: 3px solid white; }
  .timeline-dot.submitted { background: #004A99; }
  .timeline-dot.legal { background: #D97706; }
  .timeline-dot.approved { background: #059669; }
  .timeline-dot.rejected { background: #DC2626; }
  .timeline-dot.published { background: #7C3AED; }
  .timeline-title { font-size: 13px; font-weight: 700; color: #1a1a2e; }
  .timeline-detail { font-size: 11px; color: #64748b; }

  .current-status-box { display: flex; align-items: center; gap: 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 20px; margin-top: 16px; }
  .cs-label { font-size: 12px; font-weight: 700; color: #004A99; text-transform: uppercase; }
  .cs-value { font-size: 16px; font-weight: 800; color: #004A99; }

  /* ── Notices ── */
  .notice-box { border-radius: 8px; padding: 16px; font-size: 13px; margin-bottom: 12px; }
  .notice-box.success { background: #f0fdf4; border: 1px solid #86efac; color: #065f46; }
  .notice-box.warning { background: #fffbeb; border: 1px solid #fbbf24; color: #92400e; }
  .notice-box.info { background: #eff6ff; border: 1px solid #93c5fd; color: #1d4ed8; }

  /* ── Declaration ── */
  .declaration-box {
    background: #fafafa;
    border: 2px solid #1a1a2e;
    border-radius: 8px;
    padding: 28px;
  }
  .declaration-box p { font-size: 13px; margin-bottom: 12px; line-height: 1.8; }
  .declaration-box ol { padding-left: 24px; margin-bottom: 16px; }
  .declaration-box li { font-size: 13px; margin-bottom: 6px; }

  .sig-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 32px; }
  .sig-block { text-align: center; }
  .sig-line { border-bottom: 2px solid #1a1a2e; margin-bottom: 8px; height: 40px; }
  .sig-label-under { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 2px; }
  .sig-name-small { font-size: 11px; color: #1a1a2e; }
  .sig-date-small { font-size: 10px; color: #94a3b8; margin-top: 4px; }

  .sig-row { display: flex; gap: 20px; margin-top: 8px; }
  .sig-item-small { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 14px; flex: 1; }
  .sig-label { display: block; font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; }
  .sig-val { display: block; font-size: 12px; color: #1a1a2e; font-weight: 600; margin-top: 2px; }

  /* ── Footer ── */
  .document-footer {
    text-align: center;
    padding: 28px 40px;
    margin-top: 24px;
  }
  .footer-line { border-top: 3px solid #004A99; margin-bottom: 16px; }
  .document-footer p { font-size: 11px; color: #64748b; margin-bottom: 4px; }
  .confidential { color: #DC2626; font-weight: 700; font-size: 10px; margin-top: 8px; text-transform: uppercase; letter-spacing: 1px; }
`;
