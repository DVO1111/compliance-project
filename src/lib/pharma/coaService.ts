/**
 * coaService — Certificate of Analysis generation.
 *
 * Auto-populates a CoA from a released batch's QC results, synthesises a
 * conformance statement via the LLM gateway, supports a QA approval
 * (timestamped e-signature), and renders a printable PDF.
 */

import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';
import { generateText } from '../geminiClient';
import { getBatchRecord, listQcResults, type BatchQcResult } from './batchReleaseService';

export type CoaStatus = 'draft' | 'qa_approved';

export interface CoaResultLine {
  test_name: string;
  test_method: string | null;
  specification: string | null;
  result: string;
  pass: boolean;
}

export interface CoaRecord {
  id: string;
  company_id: string;
  batch_id: string;
  coa_number: string;
  product_name: string;
  batch_number: string | null;
  conformance_statement: string | null;
  results: CoaResultLine[];
  status: CoaStatus;
  qa_approved_by: string | null;
  qa_approved_by_name: string | null;
  qa_approved_at: string | null;
  pdf_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Every CoA issued by a company, newest first — backs the CoA register page.
 * Certificates were previously only reachable per-batch, from inside the batch
 * detail modal, so there was no way to find or re-issue one after the fact.
 */
export async function listCoasForCompany(companyId: string): Promise<CoaRecord[]> {
  const { data, error } = await (supabase as any)
    .from('certificate_of_analysis')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) { logger.error('listCoasForCompany:', error); return []; }
  return data ?? [];
}

export async function listCoasForBatch(batchId: string): Promise<CoaRecord[]> {
  const { data, error } = await (supabase as any)
    .from('certificate_of_analysis')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false });
  if (error) { logger.error('listCoasForBatch:', error); return []; }
  return data ?? [];
}

function buildConformancePrompt(productName: string, batchNumber: string, results: CoaResultLine[]): string {
  const lines = results
    .map(r => `- ${r.test_name}${r.test_method ? ` (${r.test_method})` : ''}: result "${r.result}"${r.specification ? `, spec "${r.specification}"` : ''} — ${r.pass ? 'PASS' : 'FAIL'}`)
    .join('\n');
  return [
    'You are a pharmaceutical QA specialist drafting a Certificate of Analysis.',
    `Write a concise (2–3 sentences) conformance statement for product "${productName}", batch "${batchNumber}".`,
    'State whether the batch was manufactured and tested in accordance with GMP and conforms to its registered specifications, grounded ONLY in the QC results below.',
    'If any test failed, the statement must clearly say the batch does NOT conform. Return plain text only — no markdown, no headings.',
    '',
    'QC results:',
    lines || '(no QC results recorded)',
  ].join('\n');
}

function fallbackStatement(productName: string, batchNumber: string, allPass: boolean): string {
  return allPass
    ? `Batch ${batchNumber} of ${productName} was manufactured and tested in accordance with current Good Manufacturing Practice (cGMP) and conforms to all registered specifications based on the quality-control results recorded herein.`
    : `Batch ${batchNumber} of ${productName} does NOT conform to its registered specifications: one or more quality-control tests recorded herein returned a failing result. This batch must not be released.`;
}

/**
 * Generate a draft CoA for a released batch. Snapshots the batch's QC results
 * and synthesises a conformance statement. Throws if the batch is not released.
 */
export async function generateCoaForBatch(
  batchId: string,
  companyId: string,
  userId: string,
): Promise<CoaRecord> {
  const batch = await getBatchRecord(batchId, companyId);
  if (!batch) throw new Error('Batch not found.');
  if (batch.status !== 'released') {
    throw new Error('A Certificate of Analysis can only be generated for a released batch.');
  }

  const qc: BatchQcResult[] = await listQcResults(batchId);
  if (qc.length === 0) {
    throw new Error('No QC results recorded for this batch — add release QC results before generating a CoA.');
  }

  const results: CoaResultLine[] = qc.map(r => ({
    test_name: r.test_name,
    test_method: r.test_method,
    specification: r.specification,
    result: r.result,
    pass: r.pass,
  }));
  const allPass = results.every(r => r.pass);

  // Synthesise conformance text; fall back to a deterministic template on failure.
  let conformance: string;
  try {
    conformance = (await generateText(buildConformancePrompt(batch.product_name, batch.batch_number, results))).trim();
    if (!conformance) conformance = fallbackStatement(batch.product_name, batch.batch_number, allPass);
  } catch (err) {
    logger.warn('generateCoaForBatch: LLM conformance synthesis failed, using fallback', err);
    conformance = fallbackStatement(batch.product_name, batch.batch_number, allPass);
  }

  const coaNumber = `COA-${batch.batch_number}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

  const { data, error } = await (supabase as any)
    .from('certificate_of_analysis')
    .insert({
      company_id: companyId,
      batch_id: batchId,
      coa_number: coaNumber,
      product_name: batch.product_name,
      batch_number: batch.batch_number,
      conformance_statement: conformance,
      results,
      status: 'draft',
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;

  await recordAuditEvent({
    userId,
    companyId,
    action: 'generate_coa',
    entityType: 'certificate_of_analysis',
    entityId: data.id,
    metadata: { coa_number: coaNumber, batch_number: batch.batch_number, all_pass: allPass },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for generate_coa:', e));

  return data;
}

/** Update the (editable) draft conformance statement before approval. */
export async function updateCoaStatement(coaId: string, companyId: string, statement: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('certificate_of_analysis')
    .update({ conformance_statement: statement })
    .eq('id', coaId)
    .eq('company_id', companyId)
    .eq('status', 'draft');
  if (error) throw error;
}

/** QA approval — records a timestamped e-signature and locks the CoA. */
export async function approveCoa(
  coaId: string,
  companyId: string,
  userId: string,
  approverName: string,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('certificate_of_analysis')
    .update({
      status: 'qa_approved',
      qa_approved_by: userId,
      qa_approved_by_name: approverName,
      qa_approved_at: new Date().toISOString(),
    })
    .eq('id', coaId)
    .eq('company_id', companyId);
  if (error) throw error;

  await recordAuditEvent({
    userId,
    companyId,
    action: 'approve_coa',
    entityType: 'certificate_of_analysis',
    entityId: coaId,
    metadata: { approver_name: approverName },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for approve_coa:', e));
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text ?? '').replace(/[&<>"']/g, m => map[m]);
}

/** Render a printable CoA PDF (opens a print window, no external deps). */
export function exportCoaPdf(coa: CoaRecord): void {
  const rows = (coa.results ?? [])
    .map(r => `
      <tr>
        <td>${escapeHtml(r.test_name)}</td>
        <td>${escapeHtml(r.test_method ?? '—')}</td>
        <td>${escapeHtml(r.specification ?? '—')}</td>
        <td>${escapeHtml(r.result)}</td>
        <td style="font-weight:700;color:${r.pass ? '#065f46' : '#991b1b'};">${r.pass ? 'PASS' : 'FAIL'}</td>
      </tr>`)
    .join('');

  const approval = coa.status === 'qa_approved'
    ? `<p><strong>QA Approved by:</strong> ${escapeHtml(coa.qa_approved_by_name ?? '—')} · ${coa.qa_approved_at ? new Date(coa.qa_approved_at).toLocaleString() : '—'}</p>`
    : `<p style="color:#b45309;"><strong>DRAFT — pending QA approval</strong></p>`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(coa.coa_number)}</title>
  <style>
    @media print { @page { margin: 1in; size: letter; } }
    body { font-family: 'Inter', -apple-system, sans-serif; color:#1f2937; max-width:8.5in; margin:0 auto; padding:24px; }
    h1 { color:#004A99; font-size:22px; margin:0 0 4px; }
    .sub { color:#6b7280; font-size:13px; margin:0 0 20px; }
    .meta { background:#f3f4f6; border-radius:8px; padding:14px; margin-bottom:18px; display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .meta div span { display:block; font-size:11px; text-transform:uppercase; color:#6b7280; font-weight:700; }
    table { width:100%; border-collapse:collapse; margin:12px 0; font-size:13px; }
    th { background:#004A99; color:#fff; padding:8px 10px; text-align:left; font-size:11px; text-transform:uppercase; }
    td { padding:8px 10px; border-bottom:1px solid #e5e7eb; }
    .statement { background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:14px; margin:12px 0; white-space:pre-wrap; }
    .footer { margin-top:24px; border-top:2px solid #e5e7eb; padding-top:12px; font-size:11px; color:#6b7280; text-align:center; }
  </style></head><body>
    <h1>Certificate of Analysis</h1>
    <p class="sub">${escapeHtml(coa.coa_number)}</p>
    <div class="meta">
      <div><span>Product</span>${escapeHtml(coa.product_name)}</div>
      <div><span>Batch Number</span>${escapeHtml(coa.batch_number ?? '—')}</div>
      <div><span>CoA Number</span>${escapeHtml(coa.coa_number)}</div>
      <div><span>Issued</span>${new Date(coa.created_at).toLocaleDateString()}</div>
    </div>
    <h3 style="font-size:14px;color:#111827;">Conformance Statement</h3>
    <div class="statement">${escapeHtml(coa.conformance_statement ?? '—')}</div>
    <h3 style="font-size:14px;color:#111827;">Quality Control Results</h3>
    <table>
      <thead><tr><th>Test</th><th>Method</th><th>Specification</th><th>Result</th><th>Outcome</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">No results</td></tr>'}</tbody>
    </table>
    ${approval}
    <div class="footer"><p><strong>Criateur Governance OS</strong> — Generated ${new Date().toLocaleString()}</p></div>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups to export the CoA PDF.'); return; }
  w.document.write(html);
  w.document.close();
  w.onload = () => w.print();
}
