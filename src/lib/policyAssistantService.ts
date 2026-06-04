import { supabase } from './supabase';
import { generateJSON } from './geminiClient';
import { wrapAICall } from './aiResponseValidator';

export interface PolicyTemplate {
  id: string;
  title: string;
  category: string;
  base_content: string;
}

export interface PolicyDraft {
  id: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
}

/* ─── Category Labels ──────────────────────────────────────── */

const CATEGORY_LABELS: Record<string, string> = {
  privacy: 'Privacy & Data Protection',
  pharma: 'Pharmaceutical Marketing',
  medical_devices: 'Medical Devices',
  clinical_trials: 'Clinical Trials',
  general: 'General Compliance',
};

/* ─── Template-based Fallback ──────────────────────────────── */

function buildFallbackDraft(
  prompt: string,
  category: string,
  circulars: any[],
  templateContent: string
): { title: string; content: string } {
  const categoryLabel = CATEGORY_LABELS[category] || 'Compliance';
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // Derive a title from the prompt
  const titleWords = prompt.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const title = titleWords.length > 60
    ? titleWords.slice(0, 60).trim() + ' Policy'
    : titleWords + ' — Compliance Policy';

  // Build regulatory reference section
  const regulatoryRefs = circulars.length > 0
    ? circulars.map((c: any) =>
        `- **${c.circular_number || 'N/A'}** — *${c.title || 'Untitled'}* (${c.source || 'Unknown Source'})\n  ${c.summary || 'No summary available.'}`
      ).join('\n\n')
    : '- No specific circulars found for this category. General NAFDAC/FDA/WHO standards apply.';

  // Build the full policy document
  const content = `# ${title}

**Category:** ${categoryLabel}
**Effective Date:** ${today}
**Version:** 1.0 — Draft
**Classification:** Internal / Confidential

---

## 1. Purpose & Scope

This policy establishes the compliance framework for **${categoryLabel.toLowerCase()}** activities within the organization. It ensures all operations conform to the latest regulatory standards, including the 2026 NAFDAC circulars and applicable FDA/WHO guidelines.

**User Requirement:** ${prompt}

---

## 2. Regulatory References

The following 2026 regulatory circulars and standards are incorporated into this policy:

${regulatoryRefs}

---

## 3. Policy Framework

${templateContent ? `### 3.1 Base Template Guidelines\n\n${templateContent}\n\n### 3.2 Additional Requirements\n` : '### 3.1 Core Requirements\n'}

Based on current regulatory requirements, this policy mandates the following:

- **Compliance Monitoring**: All ${categoryLabel.toLowerCase()} activities must be reviewed for regulatory compliance before publication or distribution.
- **Documentation**: Complete records of compliance reviews, approvals, and amendments must be maintained for a minimum of 5 years.
- **Training**: All personnel involved in ${categoryLabel.toLowerCase()} operations must complete annual compliance training.
- **Reporting**: Any compliance violations must be reported to the designated compliance officer within 24 hours.
${category === 'pharma' ? `- **QR Code Digital Leaflets**: In accordance with 2026 NAFDAC circulars, all pharmaceutical marketing materials must include QR codes linking to digital product leaflets.\n- **Fair Balance**: All promotional materials must present a fair balance of efficacy and safety information.\n- **Healthcare Professional Interactions**: All interactions with HCPs must be documented and comply with anti-kickback regulations.` : ''}
${category === 'privacy' ? `- **Data Encryption**: All patient/user data must be encrypted in transit (TLS 1.3+) and at rest (AES-256).\n- **Consent Management**: Explicit informed consent must be obtained before collecting any personal health information.\n- **Right to Erasure**: Data subjects must be able to request complete deletion of their personal data within 30 days.\n- **Breach Notification**: Data breaches must be reported to relevant authorities within 72 hours of discovery.` : ''}
${category === 'medical_devices' ? `- **Device Classification**: All medical devices must be classified according to NAFDAC/FDA risk categorization before marketing.\n- **Post-Market Surveillance**: Continuous monitoring of device performance and adverse event reporting is mandatory.\n- **Labeling Compliance**: All device labels must include required safety warnings and usage instructions in accordance with 2026 standards.` : ''}
${category === 'clinical_trials' ? `- **Informed Consent**: All trial participants must provide written informed consent before enrollment.\n- **Ethics Committee Approval**: All clinical trials must receive approval from the institutional ethics committee.\n- **Adverse Event Reporting**: All serious adverse events must be reported within 24 hours.\n- **Data Integrity**: Trial data must be collected, stored, and reported in compliance with Good Clinical Practice (GCP) guidelines.` : ''}

---

## 4. Roles & Responsibilities

| Role | Responsibility |
|------|---------------|
| **Compliance Officer** | Oversee policy implementation, conduct audits, report to regulatory bodies |
| **Department Heads** | Ensure team adherence, escalate violations, approve training completion |
| **All Staff** | Follow policy guidelines, complete training, report concerns |
| **Legal Counsel** | Review policy updates, advise on regulatory changes, manage external audits |

---

## 5. Enforcement & Penalties

Non-compliance with this policy may result in:
- Formal written warning
- Mandatory remedial training
- Suspension of ${categoryLabel.toLowerCase()} privileges
- Regulatory reporting as required by law
- Termination of employment in severe cases

---

## 6. Review Schedule

This policy shall be reviewed:
- **Quarterly** for regulatory updates
- **Annually** for comprehensive revision
- **Immediately** upon issuance of new relevant NAFDAC/FDA/WHO circulars

---

*This policy was generated by the Criateur AI Policy Assistant using the latest available regulatory data. It should be reviewed by the Compliance Officer and Legal Counsel before formal adoption.*
`;

  return { title, content };
}

/* ─── Main Generation Function ─────────────────────────────── */

import { complianceCache } from './complianceCache';
import { logger } from './logger';

export async function generatePolicyDraft(
  prompt: string,
  category: string
): Promise<{ title: string; content: string } | null> {
  const cacheKey = `policy_draft_${category}_${prompt.slice(0, 50)}`;

  // 1. Try Cache First
  const cached = await complianceCache.get<{ title: string; content: string }>(cacheKey);
  if (cached) {
    // console.log('[PolicyAssistant] Serving from cache');
    return cached;
  }

  // 1b. Retrieve RAG Context (Circulars & Templates)
  const [circularsRes, templatesRes] = await Promise.all([
    (supabase as any).from('regulatory_circulars').select('*').limit(5),
    (supabase as any).from('policy_templates').select('*').eq('category', category).limit(1),
  ]);

  const circulars = circularsRes.data || [];
  const templateContent = (templatesRes.data || [])[0]?.base_content || '';

  const circularsContext = circulars
    .map((c: any) =>
      `Source: ${c.source}\nCircular: ${c.circular_number}\nTitle: ${c.title}\nSummary: ${c.summary}`
    )
    .join('\n---\n');

  // 2. Try AI synthesis first
  const systemPrompt = `
    You are an expert Healthcare Compliance Policy Writer.
    
    REGULATORY CONTEXT (NAFDAC/FDA/WHO 2026):
    ${circularsContext}

    BASE TEMPLATE:
    ${templateContent}

    USER REQUEST:
    ${prompt}

    TASK:
    Draft a comprehensive, professional compliance policy in Markdown format.
    - Ensure it incorporates any RELEVANT 2026 circular requirements (e.g., QR-code digital leaflets if for pharma/labeling).
    - Use legal but accessible language.
    - Structure with H1, H2, and Bullet Points.

    RESPONSE FORMAT (JSON):
    {
      "title": "Document Title",
      "content": "Full Markdown Content"
    }
  `;

  try {
    const result = await wrapAICall<{ title: string; content: string } | null>(
      () => generateJSON(systemPrompt),
      { title: 'string', content: 'string' },
      null,
      { action: 'policy_draft_generation' }
    );
    if (result && result.title && result.content) {
      await complianceCache.set(cacheKey, result, 3600_000);
      return result;
    }
  } catch (err) {
    logger.warn('AI generation failed, trying stale cache or fallback:', err);
    const stale = await complianceCache.getStale<{ title: string; content: string }>(cacheKey);
    if (stale) return stale;
  }

  // 3. Fallback: build policy from templates + regulatory data
  const fallback = buildFallbackDraft(prompt, category, circulars, templateContent);
  // Also cache the fallback for immediate offline use
  await complianceCache.set(cacheKey, fallback, 300_000);
  return fallback;
}

/* ─── Save / Fetch ─────────────────────────────────────────── */

export async function savePolicyDraft(
  companyId: string,
  title: string,
  content: string
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('policy_drafts')
    .insert({
      company_id: companyId,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      title,
      content,
    });
  return !error;
}

export async function getPolicyTemplates(): Promise<PolicyTemplate[]> {
  const { data } = await (supabase as any).from('policy_templates').select('*');
  return data || [];
}

export async function getPolicyDrafts(companyId: string): Promise<PolicyDraft[]> {
  const { data } = await (supabase as any)
    .from('policy_drafts')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  return data || [];
}
