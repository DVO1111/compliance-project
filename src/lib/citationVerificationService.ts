/**
 * Citation Verification Service — Phase 3.1
 *
 * Verifies regulation citations in AI-generated text against two sources:
 *   1. LIBRARY_DATA — curated regulatory library (regulatoryLibraryService)
 *   2. Rules engine — citations extracted from the compliance rule files
 *
 * Any AI response that cites a regulation should pass through verifyCitation()
 * or verifyAllCitationsInText() before being surfaced to the user.
 * Unverified citations are flagged — not silently dropped.
 */

import { LIBRARY_DATA } from './regulatoryLibraryService';
import { extractAllRegulationCitations } from './ruleSourceExtractor';

/* ── Types ──────────────────────────────────────────────────────────────── */

export type CitationConfidence = 'exact' | 'partial' | 'none';

export interface CitationVerificationResult {
  citation: string;
  verified: boolean;
  confidence: CitationConfidence;
  regulationId: string | null;
  sourceTitle: string | null;
  sourceText: string | null;
  sourceUrl: string | null;
  jurisdiction: string | null;
}

export interface TextCitationScan {
  citations: CitationVerificationResult[];
  verifiedCount: number;
  unverifiedCount: number;
  hasUnverified: boolean;
}

/* ── Normalisation helpers ──────────────────────────────────────────────── */

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalise(a).split(' ').filter(t => t.length > 3));
  const tb = new Set(normalise(b).split(' ').filter(t => t.length > 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let matches = 0;
  for (const t of ta) { if (tb.has(t)) matches++; }
  return matches / Math.min(ta.size, tb.size);
}

/* ── Build the combined citation index (lazy, cached) ───────────────────── */

interface IndexEntry {
  id: string;
  title: string;
  normalisedTitle: string;
  sourceText: string | null;
  sourceUrl: string | null;
  jurisdiction: string | null;
}

let _index: IndexEntry[] | null = null;

function getIndex(): IndexEntry[] {
  if (_index) return _index;

  const entries: IndexEntry[] = [];

  // Source 1 — regulatory library
  for (const doc of LIBRARY_DATA) {
    entries.push({
      id: doc.id,
      title: doc.title,
      normalisedTitle: normalise(doc.title),
      sourceText: doc.summary ?? null,
      sourceUrl: doc.sourceUrl ?? null,
      jurisdiction: doc.jurisdiction ?? null,
    });
  }

  // Source 2 — rules engine citations (unique by citation string)
  const seen = new Set(entries.map(e => e.normalisedTitle));
  for (const rc of extractAllRegulationCitations()) {
    const n = normalise(rc.citation);
    if (!seen.has(n)) {
      seen.add(n);
      entries.push({
        id: `rule-${rc.ruleIds[0]}`,
        title: rc.citation,
        normalisedTitle: n,
        sourceText: rc.descriptions[0] ?? null,
        sourceUrl: null,
        jurisdiction: rc.jurisdiction ?? null,
      });
    }
  }

  _index = entries;
  return _index;
}

/* ── Core verification ──────────────────────────────────────────────────── */

/**
 * Verify a single regulation citation string against the known index.
 *
 * Confidence levels:
 *   exact   — normalised strings match exactly
 *   partial — ≥60% token overlap or one is a substring of the other
 *   none    — no match found (citation is unverified / possibly fabricated)
 */
export function verifyCitation(citation: string): CitationVerificationResult {
  const normCitation = normalise(citation);
  const index = getIndex();

  // Pass 1: exact match
  for (const entry of index) {
    if (entry.normalisedTitle === normCitation) {
      return {
        citation,
        verified: true,
        confidence: 'exact',
        regulationId: entry.id,
        sourceTitle: entry.title,
        sourceText: entry.sourceText,
        sourceUrl: entry.sourceUrl,
        jurisdiction: entry.jurisdiction,
      };
    }
  }

  // Pass 2: substring match (citation inside known title or vice-versa)
  for (const entry of index) {
    if (
      entry.normalisedTitle.includes(normCitation) ||
      normCitation.includes(entry.normalisedTitle)
    ) {
      return {
        citation,
        verified: true,
        confidence: 'partial',
        regulationId: entry.id,
        sourceTitle: entry.title,
        sourceText: entry.sourceText,
        sourceUrl: entry.sourceUrl,
        jurisdiction: entry.jurisdiction,
      };
    }
  }

  // Pass 3: token overlap ≥ 60%
  let bestEntry: IndexEntry | null = null;
  let bestScore = 0;
  for (const entry of index) {
    const score = tokenOverlap(citation, entry.title);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  if (bestScore >= 0.6 && bestEntry) {
    return {
      citation,
      verified: true,
      confidence: 'partial',
      regulationId: bestEntry.id,
      sourceTitle: bestEntry.title,
      sourceText: bestEntry.sourceText,
      sourceUrl: bestEntry.sourceUrl,
      jurisdiction: bestEntry.jurisdiction,
    };
  }

  return {
    citation,
    verified: false,
    confidence: 'none',
    regulationId: null,
    sourceTitle: null,
    sourceText: null,
    sourceUrl: null,
    jurisdiction: null,
  };
}

/* ── Scan a block of text for regulation citations ──────────────────────── */

// Patterns that commonly precede regulation names in AI output
const CITATION_PATTERNS = [
  /(?:under|per|pursuant to|in accordance with|as required by|violates?|see)\s+([A-Z][^.;:\n]{10,120})/gi,
  /(?:Section|§|Regulation|Article|Guideline|Standard|Act|Directive)\s+[\d.]+[^\n.;:]{0,80}/gi,
  /(?:NAFDAC|FDA|EMA|WHO|NHIA|PCN|SON|MHRA|TGA)[^\n.;:]{5,120}/gi,
  /(?:ISO|IEC)\s+\d{4,6}(?::\d{4})?[^\n.;:]{0,60}/gi,
];

/**
 * Extract and verify all regulation citations found in an AI-generated text block.
 * Returns a scan report with per-citation results and aggregate stats.
 */
export function verifyAllCitationsInText(text: string): TextCitationScan {
  const raw = new Set<string>();

  for (const pattern of CITATION_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const candidate = match[1]?.trim() ?? match[0]?.trim();
      if (candidate && candidate.length > 8) {
        raw.add(candidate.replace(/\s+/g, ' ').trim());
      }
    }
  }

  const citations = Array.from(raw).map(c => verifyCitation(c));
  const verifiedCount = citations.filter(c => c.verified).length;
  const unverifiedCount = citations.length - verifiedCount;

  return {
    citations,
    verifiedCount,
    unverifiedCount,
    hasUnverified: unverifiedCount > 0,
  };
}

/**
 * Invalidate the cached index (call after adding new library entries).
 */
export function resetCitationIndex(): void {
  _index = null;
}
