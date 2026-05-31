import { supabase } from './supabase';
import { logger } from './logger';

export type ClaimType = 'efficacy' | 'safety' | 'comparative' | 'economic' | 'mechanism' | 'general';
export type ClaimStatus = 'unreviewed' | 'approved' | 'rejected' | 'needs_evidence';
export type EvidenceType = 'clinical_trial' | 'meta_analysis' | 'real_world_data' | 'label_reference' | 'guideline' | 'expert_opinion';

export type ExtractedClaim = {
  id: string; company_id: string; source_document: string; claim_text: string;
  claim_type: ClaimType; confidence: number; has_evidence: boolean;
  status: ClaimStatus; extracted_by: string | null; extracted_at: string;
  evidence?: ClaimEvidence[];
};

export type ClaimEvidence = {
  id: string; claim_id: string; evidence_type: EvidenceType; reference_title: string;
  reference_url: string | null; strength: string; linked_at: string;
};

/* ── Client-side NLP claim extraction ───────────────── */

const CLAIM_PATTERNS: { pattern: RegExp; type: ClaimType; confidence: number }[] = [
  { pattern: /(?:demonstrated?|shown?|proven?|achieved?)\s+(?:superior|greater|better|improved)\s+\w+/gi, type: 'comparative', confidence: 0.9 },
  { pattern: /(?:reduces?|decreases?|lowers?|improves?|increases?)\s+\w+\s+(?:by|to|from)\s+[\d.]+%?/gi, type: 'efficacy', confidence: 0.85 },
  { pattern: /(?:safe|well.?tolerated|favorable?\s+(?:safety|tolerability)|no\s+significant\s+(?:adverse|side))/gi, type: 'safety', confidence: 0.8 },
  { pattern: /(?:cost.?effective|reduces?\s+(?:cost|spend|expenditure)|saves?\s+\$[\d,]+)/gi, type: 'economic', confidence: 0.85 },
  { pattern: /(?:works?\s+by|mechanism\s+of\s+action|inhibits?|blocks?|activates?|modulates?)\s+\w+/gi, type: 'mechanism', confidence: 0.7 },
  { pattern: /(?:clinically\s+(?:proven|demonstrated)|FDA.?approved|indicated\s+for|first.?(?:line|in.?class))/gi, type: 'efficacy', confidence: 0.9 },
  { pattern: /(?:significant(?:ly)?|statistically)\s+(?:more|less|better|worse|higher|lower)/gi, type: 'comparative', confidence: 0.85 },
  { pattern: /(?:patients?\s+(?:reported|experienced|showed|achieved))\s+\w+/gi, type: 'efficacy', confidence: 0.75 },
];

export function extractClaimsFromText(text: string, sourceDocument: string): Omit<ExtractedClaim, 'id' | 'company_id' | 'extracted_by' | 'extracted_at' | 'evidence'>[] {
  const claims: Omit<ExtractedClaim, 'id' | 'company_id' | 'extracted_by' | 'extracted_at' | 'evidence'>[] = [];
  const seen = new Set<string>();

  for (const { pattern, type, confidence } of CLAIM_PATTERNS) {
    const matches = text.match(pattern) || [];
    for (const match of matches) {
      const normalized = match.trim().toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      // Find the full sentence containing this match
      const sentenceRegex = new RegExp(`[^.!?]*${match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.!?]*[.!?]?`, 'i');
      const sentenceMatch = text.match(sentenceRegex);
      const claimText = sentenceMatch ? sentenceMatch[0].trim() : match.trim();

      claims.push({ source_document: sourceDocument, claim_text: claimText, claim_type: type, confidence, has_evidence: false, status: 'unreviewed' });
    }
  }
  return claims;
}

/* ── DB operations ─────────────────────────────────── */

export async function saveExtractedClaims(companyId: string, userId: string, claims: Omit<ExtractedClaim, 'id' | 'company_id' | 'extracted_by' | 'extracted_at' | 'evidence'>[]): Promise<boolean> {
  if (claims.length === 0) return true;
  const rows = claims.map(c => ({ company_id: companyId, source_document: c.source_document, claim_text: c.claim_text, claim_type: c.claim_type, confidence: c.confidence, has_evidence: false, status: 'unreviewed', extracted_by: userId }));
  const { error } = await (supabase as any).from('extracted_claims').insert(rows);
  if (error) { logger.error('saveExtractedClaims:', error); return false; }
  return true;
}

export async function getClaims(companyId: string): Promise<ExtractedClaim[]> {
  const { data, error } = await (supabase as any).from('extracted_claims').select('*, evidence:claim_evidence_links(*)').eq('company_id', companyId).order('extracted_at', { ascending: false }).limit(200);
  if (error) { logger.error('getClaims:', error); return []; }
  return data ?? [];
}

export async function updateClaimStatus(claimId: string, status: ClaimStatus): Promise<boolean> {
  const { error } = await (supabase as any).from('extracted_claims').update({ status }).eq('id', claimId);
  if (error) { logger.error('updateClaimStatus:', error); return false; }
  return true;
}

export async function linkEvidence(claimId: string, e: { evidence_type: EvidenceType; reference_title: string; reference_url?: string; strength?: string }): Promise<boolean> {
  const { error } = await (supabase as any).from('claim_evidence_links').insert({ claim_id: claimId, evidence_type: e.evidence_type, reference_title: e.reference_title, reference_url: e.reference_url || null, strength: e.strength || 'moderate' });
  if (error) { logger.error('linkEvidence:', error); return false; }
  await (supabase as any).from('extracted_claims').update({ has_evidence: true }).eq('id', claimId);
  return true;
}

export const CLAIM_TYPE_LABELS: Record<ClaimType, string> = { efficacy: 'Efficacy', safety: 'Safety', comparative: 'Comparative', economic: 'Economic', mechanism: 'Mechanism', general: 'General' };
export const EVIDENCE_TYPES: { id: EvidenceType; label: string }[] = [
  { id: 'clinical_trial', label: 'Clinical Trial' }, { id: 'meta_analysis', label: 'Meta-Analysis' },
  { id: 'real_world_data', label: 'Real-World Data' }, { id: 'label_reference', label: 'Label Reference' },
  { id: 'guideline', label: 'Guideline' }, { id: 'expert_opinion', label: 'Expert Opinion' },
];
