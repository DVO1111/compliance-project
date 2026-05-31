import JSZip from 'jszip';
import { supabase } from './supabase';
import { generateReportHTML } from './pdfExport';
import type { ContentSubmission, ComplianceReport } from './pdfExport';
import type { ContentWithReport } from '../hooks/useArchiveData';

/* ─── helpers ──────────────────────────────────────────────────────── */

function sanitizeFilename(name: string): string {
    return name
        .replace(/[<>:"/\\|?*]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 80);
}

function csvEscape(value: string | number | boolean | null | undefined): string {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

type ProfileLite = { id: string; full_name: string | null; email: string | null };

function shortId(id?: string | null) {
    if (!id) return '—';
    return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

/* ─── main export ──────────────────────────────────────────────────── */

export async function generateAuditZip(items: ContentWithReport[]): Promise<void> {
    if (items.length === 0) return;

    const zip = new JSZip();
    const certsFolder = zip.folder('compliance_certificates')!;

    // ── Collect user IDs for name resolution ──
    const userIds = new Set<string>();
    items.forEach((item) => {
        const c = item as any;
        if (c.corrected_by) userIds.add(c.corrected_by);
        if (c.legal_decided_by) userIds.add(c.legal_decided_by);
        if (c.submitted_for_legal_by) userIds.add(c.submitted_for_legal_by);
    });

    let nameMap = new Map<string, string>();
    if (userIds.size > 0) {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', [...userIds]);
        if (!error && data) {
            (data as ProfileLite[]).forEach((p) => {
                nameMap.set(p.id, p.full_name || p.email || shortId(p.id));
            });
        }
    }

    // ── Generate each certificate ──
    for (const item of items) {
        if (!item.report) continue; // skip items without a compliance report

        const c = item as any;
        const correctedText = (c.corrected_text ?? '').trim();
        const correctedBy = c.corrected_by as string | null;
        const correctedAt = c.corrected_at as string | null;
        const legalDecidedAt = c.legal_decided_at as string | null;
        const legalDecidedBy = c.legal_decided_by as string | null;
        const submittedForLegalAt = c.submitted_for_legal_at as string | null;
        const submittedForLegalBy = c.submitted_for_legal_by as string | null;

        const correctedByName = correctedBy ? (nameMap.get(correctedBy) || shortId(correctedBy)) : '—';
        const legalByName = legalDecidedBy ? (nameMap.get(legalDecidedBy) || shortId(legalDecidedBy)) : '—';
        const submittedByName = submittedForLegalBy ? (nameMap.get(submittedForLegalBy) || shortId(submittedForLegalBy)) : '—';

        // Try to get latest legal comment
        let latestLegalComment: string | null = null;
        try {
            const { data } = await supabase
                .from('legal_reviews')
                .select('comments, created_at')
                .eq('content_id', item.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            latestLegalComment = (data as any)?.comments ?? null;
        } catch {
            // ignore
        }

        const html = generateReportHTML({
            content: item as ContentSubmission,
            report: item.report as ComplianceReport,
            correctedText,
            correctedAt,
            correctedByName,
            submittedForLegalAt,
            submittedByName,
            legalDecidedAt,
            legalByName,
            signoffStatus: c.signoff_status ?? '—',
            latestLegalComment,
        });

        const filename = `${sanitizeFilename(item.title)}_certificate.html`;
        certsFolder.file(filename, html);
    }

    // ── Generate summary CSV ──
    const csvHeader = [
        'Title',
        'Platform',
        'Content Topic',
        'Status',
        'Risk Level',
        'Sign-Off Status',
        'Submitted Date',
        'Flagged Phrases',
        'Issues Count',
    ].join(',');

    const csvRows = items.map((item) => {
        const flaggedCount = (item.report?.flagged_phrases as unknown as any[])?.length ?? 0;
        const issueCount = (item.report?.issues as unknown as any[])?.length ?? 0;
        const riskLevel = item.report?.overall_risk ?? 'N/A';
        const signoff = (item as any).signoff_status ?? 'N/A';
        const date = new Date(item.created_at || '').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });

        return [
            csvEscape(item.title),
            csvEscape(item.platform),
            csvEscape(item.content_topic),
            csvEscape(item.status),
            csvEscape(riskLevel),
            csvEscape(signoff),
            csvEscape(date),
            csvEscape(flaggedCount),
            csvEscape(issueCount),
        ].join(',');
    });

    const csvContent = [csvHeader, ...csvRows].join('\r\n');
    zip.file('compliance_summary.csv', csvContent);

    // ── Download the ZIP ──
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `Audit_Export_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
