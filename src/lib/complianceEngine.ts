type FlaggedPhrase = any;
type ViolatedRegulation = any;
type SuggestedRewrite = any;
import type { AIRiskAssessment } from './aiRiskService';
import type { ComplianceIssue, Jurisdiction, RuleDefinition } from './rules/types';
import { scanForbiddenClaims } from './rules/forbiddenClaims';
import { scanMandatoryCaveats } from './rules/mandatoryCaveats';
import { scanSuperlatives } from './rules/superlatives';
import { scanProfessionalEthics, scanProfessionalEthicsCaveats } from './rules/professionalEthics';
import { scanFdaRules, scanFdaCaveats } from './rules/fdaRules';
import { scanEmaRules, scanEmaCaveats } from './rules/emaRules';
import { scanPanAfricanRules, scanPanAfricanCaveats } from './rules/panAfricanRules';
import { scanWhoRules, scanWhoCaveats } from './rules/whoRules';
import {
  isLibraryReady,
  getCachedRules,
  getCachedCaveats,
  runPatternRules,
  runCaveatRules,
  type RuntimeRule,
} from './frameworkLibraryService';

export interface ComplianceAnalysisResult {
  overall_risk: 'low' | 'medium' | 'high' | 'critical';
  issues: ComplianceIssue[];
  flagged_phrases: FlaggedPhrase[];
  violated_regulations: ViolatedRegulation[];
  suggested_rewrites: SuggestedRewrite[];
  strictness_level: string;
  jurisdiction: string;
  ai_enhanced?: boolean;
  ai_risk_score?: number;
  ai_summary?: string;
}

export interface ComparisonMatrixResult {
  jurisdictions: Record<string, ComplianceAnalysisResult>;
  summary: {
    jurisdiction: string;
    label: string;
    risk: 'low' | 'medium' | 'high' | 'critical';
    issueCount: number;
    redCount: number;
    yellowCount: number;
  }[];
}

const PLATFORM_STRICTNESS: Record<string, string> = {
  print: 'very_strict',
  radio: 'very_strict',
  website: 'strict',
  linkedin: 'strict',
  instagram: 'moderate',
  x: 'moderate',
};

const AUDIENCE_MULTIPLIER: Record<string, number> = {
  healthcare_professionals: 1.0,
  patients: 1.3,
  general_public: 1.5,
};

type RuleHit = { rule: RuleDefinition | RuntimeRule; match: string; position: number; context: string };

function processRuleHits(
  hits: RuleHit[],
  issues: ComplianceIssue[],
  flaggedPhrases: FlaggedPhrase[],
  violatedRegulations: ViolatedRegulation[],
  suggestedRewrites: SuggestedRewrite[],
  riskScoreRef: { value: number },
  baseScore: number,
  halfScore: number
) {
  for (const hit of hits) {
    const suggestion = hit.rule.suggestion(hit.match);
    issues.push({
      severity: hit.rule.severity,
      issue: hit.match,
      regulation_cited: hit.rule.regulation_cited,
      suggestion,
      category: hit.rule.category || 'product_violation',
      jurisdiction: hit.rule.jurisdiction,
    });

    flaggedPhrases.push({
      phrase: hit.match,
      position: hit.position,
      context: hit.context,
    });

    violatedRegulations.push({
      regulation_id: hit.rule.id,
      regulation_title: hit.rule.description,
      violated_clause: hit.rule.regulation_cited,
      severity: hit.rule.severity === 'Red' ? 'critical' : 'high',
    });

    suggestedRewrites.push({
      original: hit.match,
      suggested: suggestion,
      reasoning: hit.rule.regulation_cited,
    });

    riskScoreRef.value += hit.rule.severity === 'Red' ? baseScore : halfScore;
  }
}

function processCaveatIssues(
  caveatIssues: ComplianceIssue[],
  issues: ComplianceIssue[],
  violatedRegulations: ViolatedRegulation[],
  suggestedRewrites: SuggestedRewrite[],
  riskScoreRef: { value: number }
) {
  for (const caveat of caveatIssues) {
    issues.push(caveat);

    violatedRegulations.push({
      regulation_id: 'caveat',
      regulation_title: caveat.issue,
      violated_clause: caveat.regulation_cited,
      severity: caveat.severity === 'Red' ? 'high' : 'medium',
    });

    suggestedRewrites.push({
      original: '[Missing caveat]',
      suggested: caveat.suggestion,
      reasoning: caveat.regulation_cited,
    });

    riskScoreRef.value += caveat.severity === 'Red' ? 7 : 3;
  }
}

function calculateRisk(
  riskScore: number,
  audienceMultiplier: number
): 'low' | 'medium' | 'high' | 'critical' {
  const adjustedScore = riskScore * audienceMultiplier;
  if (adjustedScore === 0) return 'low';
  if (adjustedScore <= 8) return 'medium';
  if (adjustedScore <= 20) return 'high';
  return 'critical';
}

// ── Shared helpers ────────────────────────────────────────────────────────

function applyRuleHitsFromCache(
  jurisdiction: string,
  contentText: string,
  platform: string,
  audience: string,
  issues: ComplianceIssue[],
  flaggedPhrases: FlaggedPhrase[],
  violatedRegulations: ViolatedRegulation[],
  suggestedRewrites: SuggestedRewrite[],
  riskScore: { value: number },
  ruleBaseScore: number,
  ruleHalfScore: number
) {
  const rules = getCachedRules(jurisdiction);
  const caveats = getCachedCaveats(jurisdiction);
  const hits = runPatternRules(contentText, rules) as RuleHit[];
  processRuleHits(hits, issues, flaggedPhrases, violatedRegulations, suggestedRewrites, riskScore, ruleBaseScore, ruleHalfScore);
  const caveatResults = runCaveatRules(contentText, platform, audience, caveats);
  for (const c of caveatResults) {
    processCaveatIssues([c as ComplianceIssue], issues, violatedRegulations, suggestedRewrites, riskScore);
  }
}

// ── Per-jurisdiction analysers ────────────────────────────────────────────

function analyzeForNigeria(
  contentText: string,
  platform: string,
  targetAudience: string
): ComplianceAnalysisResult {
  const issues: ComplianceIssue[] = [];
  const flaggedPhrases: FlaggedPhrase[] = [];
  const violatedRegulations: ViolatedRegulation[] = [];
  const suggestedRewrites: SuggestedRewrite[] = [];
  const riskScore = { value: 0 };

  if (isLibraryReady()) {
    // DB-backed cache path — runs all nigeria-jurisdiction controls (NAFDAC + professional ethics)
    applyRuleHitsFromCache('nigeria', contentText, platform, targetAudience, issues, flaggedPhrases, violatedRegulations, suggestedRewrites, riskScore, 10, 5);
  } else {
    // Static TypeScript fallback (cache not yet warmed)
    const forbiddenHits = scanForbiddenClaims(contentText);
    processRuleHits(forbiddenHits as RuleHit[], issues, flaggedPhrases, violatedRegulations, suggestedRewrites, riskScore, 10, 5);
    const superlativeHits = scanSuperlatives(contentText);
    processRuleHits(superlativeHits as RuleHit[], issues, flaggedPhrases, violatedRegulations, suggestedRewrites, riskScore, 8, 4);
    const ethicsHits = scanProfessionalEthics(contentText);
    processRuleHits(ethicsHits as RuleHit[], issues, flaggedPhrases, violatedRegulations, suggestedRewrites, riskScore, 10, 5);
    const caveatIssues = scanMandatoryCaveats(contentText, platform, targetAudience);
    processCaveatIssues(caveatIssues, issues, violatedRegulations, suggestedRewrites, riskScore);
    const ethicsCaveats = scanProfessionalEthicsCaveats(contentText, platform, targetAudience);
    processCaveatIssues(ethicsCaveats, issues, violatedRegulations, suggestedRewrites, riskScore);
  }

  const strictnessLevel = PLATFORM_STRICTNESS[platform] || 'moderate';
  const audienceMultiplier = AUDIENCE_MULTIPLIER[targetAudience] || 1.0;

  return {
    overall_risk: calculateRisk(riskScore.value, audienceMultiplier),
    issues,
    flagged_phrases: flaggedPhrases,
    violated_regulations: violatedRegulations,
    suggested_rewrites: suggestedRewrites,
    strictness_level: strictnessLevel,
    jurisdiction: 'nigeria',
  };
}

function analyzeForUSA(
  contentText: string,
  platform: string,
  targetAudience: string
): ComplianceAnalysisResult {
  const issues: ComplianceIssue[] = [];
  const flaggedPhrases: FlaggedPhrase[] = [];
  const violatedRegulations: ViolatedRegulation[] = [];
  const suggestedRewrites: SuggestedRewrite[] = [];
  const riskScore = { value: 0 };

  if (isLibraryReady()) {
    applyRuleHitsFromCache('usa', contentText, platform, targetAudience, issues, flaggedPhrases, violatedRegulations, suggestedRewrites, riskScore, 10, 5);
  } else {
    const fdaHits = scanFdaRules(contentText);
    processRuleHits(fdaHits as RuleHit[], issues, flaggedPhrases, violatedRegulations, suggestedRewrites, riskScore, 10, 5);
    const fdaCaveatIssues = scanFdaCaveats(contentText, platform, targetAudience);
    processCaveatIssues(fdaCaveatIssues, issues, violatedRegulations, suggestedRewrites, riskScore);
  }

  const strictnessLevel = PLATFORM_STRICTNESS[platform] || 'moderate';
  const audienceMultiplier = AUDIENCE_MULTIPLIER[targetAudience] || 1.0;

  return {
    overall_risk: calculateRisk(riskScore.value, audienceMultiplier),
    issues,
    flagged_phrases: flaggedPhrases,
    violated_regulations: violatedRegulations,
    suggested_rewrites: suggestedRewrites,
    strictness_level: strictnessLevel,
    jurisdiction: 'usa',
  };
}

function analyzeForEurope(
  contentText: string,
  platform: string,
  targetAudience: string
): ComplianceAnalysisResult {
  const issues: ComplianceIssue[] = [];
  const flaggedPhrases: FlaggedPhrase[] = [];
  const violatedRegulations: ViolatedRegulation[] = [];
  const suggestedRewrites: SuggestedRewrite[] = [];
  const riskScore = { value: 0 };

  if (isLibraryReady()) {
    applyRuleHitsFromCache('europe', contentText, platform, targetAudience, issues, flaggedPhrases, violatedRegulations, suggestedRewrites, riskScore, 10, 5);
  } else {
    const emaHits = scanEmaRules(contentText);
    processRuleHits(emaHits as RuleHit[], issues, flaggedPhrases, violatedRegulations, suggestedRewrites, riskScore, 10, 5);
    const emaCaveatIssues = scanEmaCaveats(contentText, platform, targetAudience);
    processCaveatIssues(emaCaveatIssues, issues, violatedRegulations, suggestedRewrites, riskScore);
  }

  const strictnessLevel = PLATFORM_STRICTNESS[platform] || 'moderate';
  const audienceMultiplier = AUDIENCE_MULTIPLIER[targetAudience] || 1.0;

  return {
    overall_risk: calculateRisk(riskScore.value, audienceMultiplier),
    issues,
    flagged_phrases: flaggedPhrases,
    violated_regulations: violatedRegulations,
    suggested_rewrites: suggestedRewrites,
    strictness_level: strictnessLevel,
    jurisdiction: 'europe',
  };
}

function analyzeForPanAfrican(
  contentText: string,
  platform: string,
  targetAudience: string
): ComplianceAnalysisResult {
  const issues: ComplianceIssue[] = [];
  const flaggedPhrases: FlaggedPhrase[] = [];
  const violatedRegulations: ViolatedRegulation[] = [];
  const suggestedRewrites: SuggestedRewrite[] = [];
  const riskScore = { value: 0 };

  if (isLibraryReady()) {
    // Pan-African also runs WHO criteria at a slightly lower score weight
    applyRuleHitsFromCache('pan_african', contentText, platform, targetAudience, issues, flaggedPhrases, violatedRegulations, suggestedRewrites, riskScore, 10, 5);
    applyRuleHitsFromCache('who', contentText, platform, targetAudience, issues, flaggedPhrases, violatedRegulations, suggestedRewrites, riskScore, 8, 4);
  } else {
    const panAfricanHits = scanPanAfricanRules(contentText);
    processRuleHits(panAfricanHits as RuleHit[], issues, flaggedPhrases, violatedRegulations, suggestedRewrites, riskScore, 10, 5);
    const panAfricanCaveatIssues = scanPanAfricanCaveats(contentText, platform, targetAudience);
    processCaveatIssues(panAfricanCaveatIssues, issues, violatedRegulations, suggestedRewrites, riskScore);
    const whoHits = scanWhoRules(contentText);
    processRuleHits(whoHits as RuleHit[], issues, flaggedPhrases, violatedRegulations, suggestedRewrites, riskScore, 8, 4);
    const whoCaveatIssues = scanWhoCaveats(contentText, platform, targetAudience);
    processCaveatIssues(whoCaveatIssues, issues, violatedRegulations, suggestedRewrites, riskScore);
  }

  const strictnessLevel = PLATFORM_STRICTNESS[platform] || 'moderate';
  const audienceMultiplier = AUDIENCE_MULTIPLIER[targetAudience] || 1.0;

  return {
    overall_risk: calculateRisk(riskScore.value, audienceMultiplier),
    issues,
    flagged_phrases: flaggedPhrases,
    violated_regulations: violatedRegulations,
    suggested_rewrites: suggestedRewrites,
    strictness_level: strictnessLevel,
    jurisdiction: 'pan_african',
  };
}

const JURISDICTION_ANALYZERS: Record<
  Exclude<Jurisdiction, 'all'>,
  (text: string, platform: string, audience: string) => ComplianceAnalysisResult
> = {
  nigeria: analyzeForNigeria,
  usa: analyzeForUSA,
  europe: analyzeForEurope,
  pan_african: analyzeForPanAfrican,
};

export function analyzeCompliance(
  contentText: string,
  platform: string,
  targetAudience: string,
  jurisdiction: Jurisdiction = 'nigeria'
): ComplianceAnalysisResult {
  // Deterministic rules engine only — AI augmentation happens async via job queue.
  // This function MUST NEVER fail the upload.
  const base = jurisdiction === 'all'
    ? analyzeForNigeria(contentText, platform, targetAudience)
    : JURISDICTION_ANALYZERS[jurisdiction](contentText, platform, targetAudience);

  return base;
}

/** Merge AI findings into the regex-based result without duplicating flagged phrases. */
export function mergeAIFindings(
  base: ComplianceAnalysisResult,
  ai: AIRiskAssessment
): ComplianceAnalysisResult {
  const existingPhrases = new Set(base.flagged_phrases.map(fp => fp.phrase.toLowerCase()));

  // Add AI-detected issues that regex missed
  for (const v of ai.intent_violations) {
    if (!existingPhrases.has(v.phrase.toLowerCase())) {
      base.flagged_phrases.push({
        phrase: v.phrase,
        position: -1,
        context: `[AI] ${v.description} (${v.regulation_ref || 'general'})`,
      });
    }
  }

  // Upgrade risk if AI assessment is higher
  const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
  const aiRiskLevel = ai.ai_risk_score >= 75 ? 'critical'
    : ai.ai_risk_score >= 50 ? 'high'
    : ai.ai_risk_score >= 25 ? 'medium'
    : 'low';

  if (riskOrder[aiRiskLevel] > riskOrder[base.overall_risk]) {
    base.overall_risk = aiRiskLevel;
  }

  base.ai_enhanced = true;
  base.ai_risk_score = ai.ai_risk_score;
  base.ai_summary = ai.summary;

  return base;
}

export function analyzeAllJurisdictions(
  contentText: string,
  platform: string,
  targetAudience: string
): ComparisonMatrixResult {
  const jurisdictionLabels: Record<string, string> = {
    nigeria: 'Nigeria (NAFDAC)',
    usa: 'North America (FDA)',
    europe: 'Europe (EMA)',
    pan_african: 'Pan-African (AMA)',
  };

  const jurisdictions: Record<string, ComplianceAnalysisResult> = {};
  const summary: ComparisonMatrixResult['summary'] = [];

  for (const [key, analyzer] of Object.entries(JURISDICTION_ANALYZERS)) {
    const result = analyzer(contentText, platform, targetAudience);
    jurisdictions[key] = result;

    summary.push({
      jurisdiction: key,
      label: jurisdictionLabels[key] || key,
      risk: result.overall_risk,
      issueCount: result.issues.length,
      redCount: result.issues.filter((i) => i.severity === 'Red').length,
      yellowCount: result.issues.filter((i) => i.severity === 'Yellow').length,
    });
  }

  return { jurisdictions, summary };
}
