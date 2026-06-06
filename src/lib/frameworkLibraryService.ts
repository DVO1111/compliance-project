/**
 * Framework Library Service
 *
 * Pre-encoded regulatory framework catalogue. Replaces the hard-coded
 * TypeScript rule files as the runtime source of truth for the compliance
 * engine. On first run (empty DB) it bootstraps from the existing rule
 * files; thereafter the DB is authoritative and new rules/frameworks can
 * be added via the authoring UI without a code deploy.
 *
 * Design:
 * - Bootstrap: import TypeScript rule arrays â†’ serialize to DB rows (idempotent)
 * - Cache: module-level Map keyed by jurisdiction, warmed once on app init
 * - Sync getters: compliance engine calls getCachedRules/getCachedCaveats synchronously
 * - Admin functions: CRUD for the FrameworkLibraryPage authoring UI
 */

import { logger } from './logger';

async function logAudit(params: {
  userId: string; companyId: string; action: string;
  entityType: string; entityId: string; metadata?: Record<string, unknown>;
}) {
  try {
    const { recordAuditEvent } = await import('./auditService');
    await recordAuditEvent(params);
  } catch { /* audit failure must never block the main operation */ }
}

// Supabase is imported lazily inside async functions only.
// This keeps the module safe to import in test environments where
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set.
async function db() {
  const { supabase } = await import('./supabase');
  return supabase;
}

/* â”€â”€ Serialised DB row types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export interface FrameworkRow {
  id: string;
  code: string;
  name: string;
  short_name: string;
  jurisdiction: string;
  description: string | null;
  regulatory_body: string;
  version: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface ControlRow {
  id: string;
  framework_id: string;
  section_id: string | null;
  control_code: string;
  title: string;
  description: string;
  control_type: 'pattern_rule' | 'caveat_rule' | 'policy_control';
  severity: 'Red' | 'Yellow' | 'Info';
  regulation_cited: string;
  category: string | null;
  jurisdiction: string | null;
  pattern_source: string | null;
  pattern_flags: string;
  suggestion_template: string;
  trigger_patterns: Array<{ source: string; flags: string }> | null;
  required_phrases: Array<{ source: string; flags: string }> | null;
  platforms: string[] | null;
  audiences: string[] | null;
  is_active: boolean;
  created_at: string;
}

export interface CrossMappingRow {
  id: string;
  source_control_id: string;
  target_control_id: string;
  mapping_type: 'equivalent' | 'partial' | 'supersedes';
  notes: string | null;
}

/* â”€â”€ Runtime types (what the compliance engine uses) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export interface RuntimeRule {
  id: string;
  pattern: RegExp;
  severity: 'Red' | 'Yellow';
  regulation_cited: string;
  suggestion: (matched: string) => string;
  description: string;
  category?: string;
  jurisdiction?: string;
}

export interface RuntimeCaveat {
  id: string;
  triggers: RegExp[];
  requiredPhrases: RegExp[];
  severity: 'Red' | 'Yellow';
  regulation_cited: string;
  issueDescription: string;
  suggestion: string;
  platforms?: string[];
  audiences?: string[];
  category?: string;
  jurisdiction?: string;
}

/* â”€â”€ In-memory cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const ruleCache  = new Map<string, RuntimeRule[]>();    // key: jurisdiction
const caveatCache = new Map<string, RuntimeCaveat[]>(); // key: jurisdiction
let cacheWarmed = false;
let initPromise: Promise<void> | null = null;

/* â”€â”€ Serialisation helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function serializeRegex(re: RegExp): { source: string; flags: string } {
  return { source: re.source, flags: re.flags };
}

/** Call the suggestion function with '{matched}' to extract a reusable template. */
function extractSuggestionTemplate(fn: (m: string) => string): string {
  try { return fn('{matched}'); } catch { return fn(''); }
}

function applySuggestion(template: string, matched: string): string {
  return template.replace(/\{matched\}/g, matched);
}

function buildRuntimeRule(row: ControlRow): RuntimeRule | null {
  if (!row.pattern_source) return null;
  try {
    const pattern = new RegExp(row.pattern_source, row.pattern_flags || 'gi');
    return {
      id: row.control_code,
      pattern,
      severity: row.severity === 'Red' ? 'Red' : 'Yellow',
      regulation_cited: row.regulation_cited,
      suggestion: (matched: string) => applySuggestion(row.suggestion_template, matched),
      description: row.description,
      category: row.category ?? undefined,
      jurisdiction: row.jurisdiction ?? undefined,
    };
  } catch (err) {
    logger.warn('frameworkLibrary: invalid regex', { control_code: row.control_code, err });
    return null;
  }
}

function buildRuntimeCaveat(row: ControlRow): RuntimeCaveat | null {
  if (!row.trigger_patterns || !row.required_phrases) return null;
  try {
    const triggers = row.trigger_patterns.map(p => new RegExp(p.source, p.flags));
    const requiredPhrases = row.required_phrases.map(p => new RegExp(p.source, p.flags));
    return {
      id: row.control_code,
      triggers,
      requiredPhrases,
      severity: row.severity === 'Red' ? 'Red' : 'Yellow',
      regulation_cited: row.regulation_cited,
      issueDescription: row.description,
      suggestion: row.suggestion_template,
      platforms: row.platforms ?? undefined,
      audiences: row.audiences ?? undefined,
      category: row.category ?? undefined,
      jurisdiction: row.jurisdiction ?? undefined,
    };
  } catch (err) {
    logger.warn('frameworkLibrary: invalid caveat regex', { control_code: row.control_code, err });
    return null;
  }
}

/* â”€â”€ Bootstrap: import TypeScript rule files â†’ DB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

async function bootstrapFromTypeScriptRules(): Promise<void> {
  // Lazy-import rule files to avoid circular dependency at module load time
  const [
    { FORBIDDEN_CLAIM_RULES },
    { SUPERLATIVE_RULES },
    { MDCN_RULES, PCN_RULES, NMCN_RULES, PROFESSIONAL_ETHICS_CAVEATS },
    { FDA_RULES, FDA_DTC_CAVEATS },
    { EMA_RULES, EMA_CAVEATS },
    { PAN_AFRICAN_RULES, PAN_AFRICAN_CAVEATS },
    { WHO_RULES, WHO_CAVEATS },
    mandatoryCaveatsModule,
  ] = await Promise.all([
    import('./rules/forbiddenClaims'),
    import('./rules/superlatives'),
    import('./rules/professionalEthics'),
    import('./rules/fdaRules'),
    import('./rules/emaRules'),
    import('./rules/panAfricanRules'),
    import('./rules/whoRules'),
    import('./rules/mandatoryCaveats'),
  ]);

  const MANDATORY_CAVEATS = (mandatoryCaveatsModule as any).CAVEAT_REQUIREMENTS ?? [];

  // â”€â”€ 1. Seed framework rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const frameworks = [
    { code: 'nafdac', name: 'NAFDAC Pharmaceutical Advertising Regulations', short_name: 'NAFDAC', jurisdiction: 'nigeria', regulatory_body: 'NAFDAC', version: '2021', description: 'Nigerian food and drug advertising rules covering forbidden claims, mandatory caveats, and superlative language', sort_order: 1 },
    { code: 'nafdac_professional_ethics', name: 'Nigeria Professional Council Ethics (MDCN / PCN / NMCN)', short_name: 'NIG-ETHICS', jurisdiction: 'nigeria', regulatory_body: 'MDCN, PCN, NMCN', version: '2024', description: 'Professional conduct rules from Nigerian Medical and Dental Council, Pharmacy Council of Nigeria, and Nursing and Midwifery Council', sort_order: 2 },
    { code: 'fda', name: 'FDA Prescription Drug Advertising Regulations', short_name: 'FDA', jurisdiction: 'usa', regulatory_body: 'FDA', version: '21 CFR 202', description: 'US FDA direct-to-consumer and professional advertising standards for prescription and OTC drugs', sort_order: 3 },
    { code: 'ema', name: 'EU Medicines Advertising Directive', short_name: 'EMA', jurisdiction: 'europe', regulatory_body: 'EMA', version: 'Directive 2001/83/EC', description: 'European Medicines Agency strict advertising standards â€” DTC advertising of prescription medicines is banned', sort_order: 4 },
    { code: 'ama', name: 'African Medicines Agency Harmonized Advertising Standards', short_name: 'AMA', jurisdiction: 'pan_african', regulatory_body: 'AMA / AfCFTA / ECOWAS', version: '2023', description: 'Pan-African harmonized pharmaceutical advertising standards under the AMA Treaty and AfCFTA protocols', sort_order: 5 },
    { code: 'who', name: 'WHO Ethical Criteria for Medicinal Drug Promotion', short_name: 'WHO', jurisdiction: 'who', regulatory_body: 'WHO', version: '1988', description: 'World Health Organization ethical criteria for promotion of medicinal products to healthcare professionals and the public', sort_order: 6 },
  ];

  const { error: fwError } = await (await db() as any)
    .from('regulatory_frameworks')
    .upsert(frameworks, { onConflict: 'code', ignoreDuplicates: true });

  if (fwError) {
    logger.error('frameworkLibrary: error seeding frameworks', fwError);
    return;
  }

  // Fetch framework IDs
  const { data: fwRows } = await (await db() as any)
    .from('regulatory_frameworks')
    .select('id, code');

  if (!fwRows) return;
  const fwMap: Record<string, string> = {};
  for (const row of fwRows) fwMap[row.code] = row.id;

  // â”€â”€ 2. Seed controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const controls: Array<Omit<ControlRow, 'id' | 'section_id' | 'created_at'>> = [];

  // Map framework code â†’ jurisdiction for defaulting rules that have no explicit jurisdiction
  const fwJurisdiction: Record<string, string> = {
    nafdac: 'nigeria',
    nafdac_professional_ethics: 'nigeria',
    fda: 'usa',
    ema: 'europe',
    ama: 'pan_african',
    who: 'who',
  };

  function addPatternRules(rules: typeof FORBIDDEN_CLAIM_RULES, frameworkCode: string) {
    const fwId = fwMap[frameworkCode];
    if (!fwId) return;
    const defaultJur = fwJurisdiction[frameworkCode] ?? 'global';
    for (const r of rules) {
      controls.push({
        framework_id: fwId,
        control_code: r.id,
        title: r.description,
        description: r.description,
        control_type: 'pattern_rule',
        severity: r.severity,
        regulation_cited: r.regulation_cited,
        category: r.category ?? null,
        jurisdiction: r.jurisdiction ?? defaultJur,
        pattern_source: r.pattern.source,
        pattern_flags: r.pattern.flags || 'gi',
        suggestion_template: extractSuggestionTemplate(r.suggestion),
        trigger_patterns: null,
        required_phrases: null,
        platforms: null,
        audiences: null,
        is_active: true,
      });
    }
  }

  function addCaveatRules(caveats: typeof MANDATORY_CAVEATS, frameworkCode: string) {
    const fwId = fwMap[frameworkCode];
    if (!fwId) return;
    const defaultJur = fwJurisdiction[frameworkCode] ?? 'global';
    for (const c of caveats) {
      controls.push({
        framework_id: fwId,
        control_code: c.id,
        title: c.issueDescription,
        description: c.issueDescription,
        control_type: 'caveat_rule',
        severity: c.severity,
        regulation_cited: c.regulation_cited,
        category: c.category ?? null,
        jurisdiction: c.jurisdiction ?? defaultJur,
        pattern_source: null,
        pattern_flags: 'gi',
        suggestion_template: c.suggestion,
        trigger_patterns: c.triggers.map(serializeRegex),
        required_phrases: c.requiredPhrases.map(serializeRegex),
        platforms: c.platforms ?? null,
        audiences: c.audiences ?? null,
        is_active: true,
      });
    }
  }

  addPatternRules(FORBIDDEN_CLAIM_RULES, 'nafdac');
  addPatternRules(SUPERLATIVE_RULES, 'nafdac');
  addCaveatRules(MANDATORY_CAVEATS, 'nafdac');
  addPatternRules(MDCN_RULES, 'nafdac_professional_ethics');
  addPatternRules(PCN_RULES, 'nafdac_professional_ethics');
  addPatternRules(NMCN_RULES, 'nafdac_professional_ethics');
  addCaveatRules(PROFESSIONAL_ETHICS_CAVEATS, 'nafdac_professional_ethics');
  addPatternRules(FDA_RULES, 'fda');
  addCaveatRules(FDA_DTC_CAVEATS, 'fda');
  addPatternRules(EMA_RULES, 'ema');
  addCaveatRules(EMA_CAVEATS, 'ema');
  addPatternRules(PAN_AFRICAN_RULES, 'ama');
  addCaveatRules(PAN_AFRICAN_CAVEATS, 'ama');
  addPatternRules(WHO_RULES, 'who');
  addCaveatRules(WHO_CAVEATS, 'who');

  if (controls.length > 0) {
    // Upsert in chunks to avoid request size limits
    const CHUNK = 50;
    for (let i = 0; i < controls.length; i += CHUNK) {
      const chunk = controls.slice(i, i + CHUNK);
      const { error } = await (await db() as any)
        .from('framework_controls')
        .upsert(chunk, { onConflict: 'framework_id,control_code', ignoreDuplicates: true });
      if (error) logger.warn('frameworkLibrary: error seeding controls chunk', error);
    }
  }

  logger.info(`frameworkLibrary: bootstrapped ${controls.length} controls across ${frameworks.length} frameworks`);
}

/* â”€â”€ Cache warmer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

async function warmCache(): Promise<void> {
  const { data: rows, error } = await (await db() as any)
    .from('framework_controls')
    .select('*')
    .eq('is_active', true);

  if (error || !rows) {
    logger.warn('frameworkLibrary: could not load controls from DB', error);
    return;
  }

  ruleCache.clear();
  caveatCache.clear();

  for (const row of rows as ControlRow[]) {
    // Group by jurisdiction (fall back to 'global' if null)
    const jur = row.jurisdiction ?? 'global';

    if (row.control_type === 'pattern_rule') {
      const rule = buildRuntimeRule(row);
      if (!rule) continue;
      if (!ruleCache.has(jur)) ruleCache.set(jur, []);
      ruleCache.get(jur)!.push(rule);
    } else if (row.control_type === 'caveat_rule') {
      const caveat = buildRuntimeCaveat(row);
      if (!caveat) continue;
      if (!caveatCache.has(jur)) caveatCache.set(jur, []);
      caveatCache.get(jur)!.push(caveat);
    }
  }

  cacheWarmed = true;
  logger.info(`frameworkLibrary: cache warmed â€” ${rows.length} controls loaded`);
}

/* â”€â”€ Public initialisation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Call once on app startup (e.g. in AuthContext after sign-in).
 * Bootstraps the DB on first run and warms the in-memory rule cache.
 * Subsequent calls are no-ops.
 */
export async function initFrameworkLibrary(): Promise<void> {
  if (cacheWarmed) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Check if any frameworks already exist in the DB
      const { count } = await (await db() as any)
        .from('regulatory_frameworks')
        .select('id', { count: 'exact', head: true });

      if (!count || count === 0) {
        await bootstrapFromTypeScriptRules();
      }

      await warmCache();
    } catch (err) {
      logger.error('frameworkLibrary: init failed', err);
      cacheWarmed = true; // Prevent retry loops; engine falls back to static imports
    }
  })();

  return initPromise;
}

/* â”€â”€ Sync getters for the compliance engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Returns pattern-matching rules for the given jurisdiction.
 * Falls back to empty array if cache not warmed (engine uses static imports).
 */
export function getCachedRules(jurisdiction: string): RuntimeRule[] {
  return ruleCache.get(jurisdiction) ?? [];
}

/**
 * Returns caveat-check rules for the given jurisdiction.
 */
export function getCachedCaveats(jurisdiction: string): RuntimeCaveat[] {
  return caveatCache.get(jurisdiction) ?? [];
}

/** True once the cache is fully loaded. */
export function isLibraryReady(): boolean {
  return cacheWarmed;
}

/** Force-refresh the cache from the DB (call after admin edits). */
export async function refreshCache(): Promise<void> {
  cacheWarmed = false;
  initPromise = null;
  await warmCache();
  cacheWarmed = true;
}

/* â”€â”€ Runtime scanning helpers (used by complianceEngine) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export function runPatternRules(
  text: string,
  rules: RuntimeRule[]
): Array<{ rule: RuntimeRule; match: string; position: number; context: string }> {
  const hits: Array<{ rule: RuntimeRule; match: string; position: number; context: string }> = [];
  for (const rule of rules) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const start = Math.max(0, m.index - 40);
      const end   = Math.min(text.length, m.index + m[0].length + 40);
      hits.push({ rule, match: m[0], position: m.index, context: text.substring(start, end) });
    }
  }
  return hits;
}

export function runCaveatRules(
  text: string,
  platform: string,
  audience: string,
  caveats: RuntimeCaveat[]
): Array<{ severity: 'Red' | 'Yellow'; issue: string; regulation_cited: string; suggestion: string; category?: string; jurisdiction?: string }> {
  const issues: Array<{ severity: 'Red' | 'Yellow'; issue: string; regulation_cited: string; suggestion: string; category?: string; jurisdiction?: string }> = [];
  for (const caveat of caveats) {
    if (caveat.platforms && !caveat.platforms.includes(platform)) continue;
    if (caveat.audiences && !caveat.audiences.includes(audience)) continue;
    const triggered = caveat.triggers.some(t => t.test(text));
    if (!triggered) continue;
    const hasRequired = caveat.requiredPhrases.some(p => p.test(text));
    if (!hasRequired) {
      issues.push({
        severity: caveat.severity,
        issue: caveat.issueDescription,
        regulation_cited: caveat.regulation_cited,
        suggestion: caveat.suggestion,
        category: caveat.category,
        jurisdiction: caveat.jurisdiction,
      });
    }
  }
  return issues;
}

/* â”€â”€ Admin: framework catalogue CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export async function getAllFrameworks(): Promise<FrameworkRow[]> {
  const { data, error } = await (await db() as any)
    .from('regulatory_frameworks')
    .select('*')
    .order('sort_order');
  if (error) { logger.error('getAllFrameworks', error); return []; }
  return data ?? [];
}

export async function getControlsForFramework(frameworkId: string): Promise<ControlRow[]> {
  const { data, error } = await (await db() as any)
    .from('framework_controls')
    .select('*')
    .eq('framework_id', frameworkId)
    .order('control_code');
  if (error) { logger.error('getControlsForFramework', error); return []; }
  return data ?? [];
}

export async function createFramework(
  payload: Omit<FrameworkRow, 'id' | 'created_at'>
): Promise<FrameworkRow | null> {
  const { data, error } = await (await db() as any)
    .from('regulatory_frameworks')
    .insert(payload)
    .select('*')
    .single();
  if (error) { logger.error('createFramework', error); return null; }
  return data;
}

export async function updateFramework(
  id: string,
  payload: Partial<Omit<FrameworkRow, 'id' | 'created_at'>>
): Promise<boolean> {
  const { error } = await (await db() as any)
    .from('regulatory_frameworks')
    .update(payload)
    .eq('id', id);
  if (error) { logger.error('updateFramework', error); return false; }
  await refreshCache();
  return true;
}

export async function createControl(
  payload: Omit<ControlRow, 'id' | 'created_at'>
): Promise<ControlRow | null> {
  const { data, error } = await (await db() as any)
    .from('framework_controls')
    .insert(payload)
    .select('*')
    .single();
  if (error) { logger.error('createControl', error); return null; }
  await refreshCache();
  return data;
}

export async function updateControl(
  id: string,
  payload: Partial<Omit<ControlRow, 'id' | 'created_at'>>
): Promise<boolean> {
  const { error } = await (await db() as any)
    .from('framework_controls')
    .update(payload)
    .eq('id', id);
  if (error) { logger.error('updateControl', error); return false; }
  await refreshCache();
  return true;
}

export async function toggleControl(id: string, isActive: boolean, companyId?: string, userId?: string): Promise<boolean> {
  const result = await updateControl(id, { is_active: isActive });
  if (result && companyId && userId) {
    await logAudit({
      userId, companyId,
      action: isActive ? 'enable_framework_control' : 'disable_framework_control',
      entityType: 'framework_control',
      entityId: id,
      metadata: { is_active: isActive },
    });
  }
  return result;
}

/* â”€â”€ Workspace framework selection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export async function getEnabledFrameworks(companyId: string): Promise<string[]> {
  const { data } = await (await db() as any)
    .from('workspace_frameworks')
    .select('framework_id')
    .eq('company_id', companyId);
  return (data ?? []).map((r: any) => r.framework_id);
}

export async function setWorkspaceFramework(
  companyId: string,
  frameworkId: string,
  enabled: boolean,
  enabledBy?: string
): Promise<boolean> {
  if (enabled) {
    const { error } = await (await db() as any)
      .from('workspace_frameworks')
      .upsert({ company_id: companyId, framework_id: frameworkId, enabled_by: enabledBy }, { onConflict: 'company_id,framework_id', ignoreDuplicates: true });
    return !error;
  } else {
    const { error } = await (await db() as any)
      .from('workspace_frameworks')
      .delete()
      .eq('company_id', companyId)
      .eq('framework_id', frameworkId);
    return !error;
  }
}

/* â”€â”€ Cross-mapping helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export async function getCrossMappings(controlId: string): Promise<CrossMappingRow[]> {
  const { data, error } = await (await db() as any)
    .from('control_cross_mappings')
    .select('*')
    .or(`source_control_id.eq.${controlId},target_control_id.eq.${controlId}`);
  if (error) { logger.error('getCrossMappings', error); return []; }
  return data ?? [];
}

export async function createCrossMapping(
  sourceControlId: string,
  targetControlId: string,
  mappingType: 'equivalent' | 'partial' | 'supersedes',
  notes?: string
): Promise<boolean> {
  const { error } = await (await db() as any)
    .from('control_cross_mappings')
    .insert({ source_control_id: sourceControlId, target_control_id: targetControlId, mapping_type: mappingType, notes: notes ?? null });
  return !error;
}
