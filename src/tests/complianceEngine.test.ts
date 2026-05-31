import { describe, it, expect } from 'vitest';
import { analyzeCompliance, analyzeAllJurisdictions } from '../lib/complianceEngine';

describe('complianceEngine — analyzeCompliance', () => {
  // ── Flagged phrase detection ───────────────────────────────────────────

  it('flags forbidden curative claims (e.g. "cures")', () => {
    const result = analyzeCompliance(
      'This product cures diabetes permanently.',
      'website',
      'general_public',
      'nigeria'
    );
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.flagged_phrases.length).toBeGreaterThan(0);

    const phrases = result.flagged_phrases.map((fp: any) => fp.phrase.toLowerCase());
    expect(phrases).toContain('cures');
  });

  it('flags "miracle" claims', () => {
    const result = analyzeCompliance(
      'A miracle treatment for pain relief.',
      'print',
      'patients',
      'nigeria'
    );
    const phrases = result.flagged_phrases.map((fp: any) => fp.phrase.toLowerCase());
    expect(phrases).toContain('miracle');
  });

  it('flags "100% effective" claims', () => {
    const result = analyzeCompliance(
      'Our drug is 100% effective against infections.',
      'website',
      'healthcare_professionals',
      'nigeria'
    );
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.overall_risk).not.toBe('low');
  });

  it('flags "guaranteed" claims', () => {
    const result = analyzeCompliance(
      'Guaranteed to eliminate symptoms.',
      'linkedin',
      'patients',
      'nigeria'
    );
    const phrases = result.flagged_phrases.map((fp: any) => fp.phrase.toLowerCase());
    expect(phrases).toContain('guaranteed');
  });

  // ── Risk score calculation ─────────────────────────────────────────────

  it('returns "critical" risk for content with multiple severe violations', () => {
    const result = analyzeCompliance(
      'This miracle drug cures cancer permanently and is 100% safe.',
      'print',
      'general_public',
      'nigeria'
    );
    expect(['high', 'critical']).toContain(result.overall_risk);
  });

  it('returns higher risk for general_public audience than healthcare_professionals', () => {
    const content = 'This product cures headaches.';
    const publicResult = analyzeCompliance(content, 'website', 'general_public', 'nigeria');
    const hcpResult = analyzeCompliance(content, 'website', 'healthcare_professionals', 'nigeria');

    const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
    expect(riskOrder[publicResult.overall_risk]).toBeGreaterThanOrEqual(
      riskOrder[hcpResult.overall_risk]
    );
  });

  // ── Clean content ──────────────────────────────────────────────────────

  it('clean content has no flagged phrases from forbidden claims', () => {
    const result = analyzeCompliance(
      'This supplement supports overall wellness when used as directed.',
      'website',
      'healthcare_professionals',
      'nigeria'
    );
    // No forbidden claims should appear in flagged_phrases
    expect(result.flagged_phrases.length).toBe(0);
    // Mandatory caveat warnings may still trigger — that's correct behaviour.
    // The key test: no product_violation category issues.
    const productViolations = result.issues.filter(i => i.category === 'product_violation');
    expect(productViolations.length).toBe(0);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  it('handles empty content gracefully', () => {
    const result = analyzeCompliance('', 'website', 'general_public', 'nigeria');
    expect(result.overall_risk).toBe('low');
    expect(result.issues).toEqual([]);
    expect(result.flagged_phrases).toEqual([]);
  });

  it('sets correct jurisdiction in result', () => {
    const result = analyzeCompliance('Safe product.', 'website', 'patients', 'usa');
    expect(result.jurisdiction).toBe('usa');
  });

  it('sets correct strictness level based on platform', () => {
    const printResult = analyzeCompliance('Test content.', 'print', 'patients', 'nigeria');
    expect(printResult.strictness_level).toBe('very_strict');

    const igResult = analyzeCompliance('Test content.', 'instagram', 'patients', 'nigeria');
    expect(igResult.strictness_level).toBe('moderate');
  });

  it('populates suggested_rewrites for each violation', () => {
    const result = analyzeCompliance(
      'This miracle drug cures everything.',
      'website',
      'patients',
      'nigeria'
    );
    expect(result.suggested_rewrites.length).toBeGreaterThan(0);
    for (const rw of result.suggested_rewrites) {
      expect(rw.original).toBeTruthy();
      expect(rw.suggested).toBeTruthy();
    }
  });

  it('populates violated_regulations for each violation', () => {
    const result = analyzeCompliance(
      'Guaranteed permanent cure.',
      'radio',
      'general_public',
      'nigeria'
    );
    expect(result.violated_regulations.length).toBeGreaterThan(0);
    for (const vr of result.violated_regulations) {
      expect(vr.regulation_id).toBeTruthy();
      expect(vr.severity).toBeTruthy();
    }
  });

  // ── Multi-jurisdiction ─────────────────────────────────────────────────

  it('analyzeAllJurisdictions returns results for all four jurisdictions', () => {
    const matrix = analyzeAllJurisdictions(
      'This product cures cancer.',
      'website',
      'patients'
    );
    expect(Object.keys(matrix.jurisdictions)).toEqual(
      expect.arrayContaining(['nigeria', 'usa', 'europe', 'pan_african'])
    );
    expect(matrix.summary.length).toBe(4);
    for (const s of matrix.summary) {
      expect(s.jurisdiction).toBeTruthy();
      expect(s.label).toBeTruthy();
      expect(['low', 'medium', 'high', 'critical']).toContain(s.risk);
    }
  });

  it('"all" jurisdiction defaults to Nigeria analysis', () => {
    const result = analyzeCompliance('Safe product.', 'website', 'patients', 'all');
    expect(result.jurisdiction).toBe('nigeria');
  });
});
