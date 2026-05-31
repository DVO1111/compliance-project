/**
 * Regulations Sync Service
 *
 * Orchestrates the extract → enrich → persist pipeline:
 * 1. Extracts unique regulation citations from the rule engine
 * 2. Sends each to Gemini to generate full regulatory content
 * 3. Upserts into the Supabase `regulations` table
 * 4. Returns the enriched records so the UI can display them immediately
 */

import { generateJSON } from './geminiClient';
import { extractAllRegulationCitations, type ExtractedRegulationCitation } from './ruleSourceExtractor';
import { supabase } from './supabase';
import { runWatchdogScan } from './watchdogService';
import { logger } from './logger';

// ── Types ────────────────────────────────────────────────────────────────

export interface RegulationRecord {
    id?: string;
    title: string;
    source: string;
    category: 'pharma' | 'medical_devices' | 'clinical_trials' | 'marketing' | 'general';
    content: string;
    source_url: string | null;
    version: string;
    effective_date: string | null;
    is_active: boolean;
    last_crawled?: string;
    created_at?: string;
    updated_at?: string;
}

export type SyncPhase = 'idle' | 'extracting' | 'enriching' | 'persisting' | 'done' | 'error';

export interface SyncProgress {
    phase: SyncPhase;
    total: number;
    completed: number;
    currentItem: string;
    log: string[];
    error?: string;
}

export interface SyncResult {
    records: RegulationRecord[];
    persisted: number;
    errors: number;
}

type ProgressCallback = (progress: SyncProgress) => void;

// ── AI enrichment prompt ─────────────────────────────────────────────────

function buildPrompt(citation: ExtractedRegulationCitation): string {
    return `You are a healthcare regulatory compliance expert. Generate a detailed regulation entry for a compliance knowledge base.

REGULATION CITATION: "${citation.citation}"
JURISDICTION: ${citation.jurisdiction}
REGULATORY BODY: ${citation.source}
CONTEXT — this regulation is referenced by compliance rules that flag: ${citation.descriptions.slice(0, 5).join('; ')}

Generate a JSON object (no markdown fences) with exactly these fields:
{
  "title": "Official title of this regulation or section (concise, professional)",
  "content": "Full regulatory text covering: (1) scope and applicability, (2) specific requirements and prohibitions, (3) compliance obligations, (4) penalties for non-compliance if applicable. Write 200-400 words in formal regulatory language.",
  "source_url": "The most likely official URL for this regulation (use real regulatory body domains like nafdac.gov.ng, fda.gov, ema.europa.eu, who.int), or null if uncertain",
  "effective_date": "Best estimate in YYYY-MM-DD format based on the regulation name/year, or null if unknown",
  "version": "Version string like '2026.1' based on the year in the citation"
}

IMPORTANT:
- The content should be authoritative and reference specific clauses/sections
- Use formal regulatory language appropriate for a compliance database
- The title should be concise but descriptive
- Return ONLY valid JSON, no extra text`;
}

// ── Enrichment with retry ────────────────────────────────────────────────

async function enrichCitation(
    citation: ExtractedRegulationCitation
): Promise<RegulationRecord> {
    const prompt = buildPrompt(citation);

    try {
        const result = await generateJSON<{
            title: string;
            content: string;
            source_url: string | null;
            effective_date: string | null;
            version: string;
        }>(prompt);

        return {
            title: result.title || citation.citation.split(',')[0].trim(),
            source: citation.source,
            category: citation.category,
            content: result.content || citation.citation,
            source_url: result.source_url || null,
            version: result.version || '2026.1',
            effective_date: result.effective_date || null,
            is_active: true,
        };
    } catch (err) {
        // Fallback: create a record from the citation metadata without AI
        logger.warn(`AI enrichment failed for "${citation.citation}":`, err);
        return {
            title: citation.citation.split(',')[0].trim(),
            source: citation.source,
            category: citation.category,
            content: `${citation.citation}\n\nThis regulation is referenced by compliance rules: ${citation.descriptions.join('. ')}.`,
            source_url: null,
            version: '2026.1',
            effective_date: null,
            is_active: true,
        };
    }
}

// ── Persistence ──────────────────────────────────────────────────────────

async function upsertRegulation(record: RegulationRecord): Promise<boolean> {
    // The `regulations` table isn't in the generated DB types, so we cast to `any`.
    const { data: existing, error: selectError } = await (supabase as any)
        .from('regulations')
        .select('id')
        .eq('title', record.title)
        .eq('source', record.source)
        .limit(1);

    if (selectError) {
        throw new Error(`Select failed: ${selectError.message}`);
    }

    if (existing && existing.length > 0) {
        const { error } = await (supabase as any)
            .from('regulations')
            .update({
                content: record.content,
                category: record.category,
                source_url: record.source_url,
                version: record.version,
                effective_date: record.effective_date,
                is_active: record.is_active,
                last_crawled: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', existing[0].id);

        if (error) throw new Error(`Update failed: ${error.message}`);
        return true;
    } else {
        const { error } = await (supabase as any).from('regulations').insert({
            title: record.title,
            source: record.source,
            category: record.category,
            content: record.content,
            source_url: record.source_url,
            version: record.version,
            effective_date: record.effective_date,
            is_active: record.is_active,
        });

        if (error) throw new Error(`Insert failed: ${error.message}`);
        return true;
    }
}

// ── Main sync function ───────────────────────────────────────────────────

/**
 * Run the full regulation sync pipeline.
 * Returns the enriched RegulationRecord[] so the UI can display them
 * immediately even if Supabase persistence fails.
 */
export async function syncRegulations(
    onProgress: ProgressCallback,
    options: { batchDelay?: number } = {}
): Promise<SyncResult> {
    const { batchDelay = 1200 } = options;

    const progress: SyncProgress = {
        phase: 'extracting',
        total: 0,
        completed: 0,
        currentItem: 'Scanning rule engine files…',
        log: [],
    };

    onProgress({ ...progress });

    // ── Phase 1: Extract ──
    let citations: ExtractedRegulationCitation[];
    try {
        citations = extractAllRegulationCitations();
        progress.total = citations.length;
        progress.log.push(`✓ Extracted ${citations.length} unique regulation citations from rule engine`);
        onProgress({ ...progress });
    } catch (err) {
        progress.phase = 'error';
        progress.error = `Extraction failed: ${err instanceof Error ? err.message : String(err)}`;
        onProgress({ ...progress });
        return { records: [], persisted: 0, errors: 0 };
    }

    // ── Phase 2: Enrich via AI ──
    progress.phase = 'enriching';
    progress.currentItem = 'Starting AI enrichment…';
    onProgress({ ...progress });

    const records: RegulationRecord[] = [];

    for (let i = 0; i < citations.length; i++) {
        const cit = citations[i];
        progress.currentItem = `Enriching: ${cit.citation.slice(0, 80)}…`;
        progress.completed = i;
        onProgress({ ...progress });

        const record = await enrichCitation(cit);
        records.push(record);

        progress.log.push(`✓ [${i + 1}/${citations.length}] ${record.title}`);
        onProgress({ ...progress });

        // Rate-limit delay between API calls
        if (i < citations.length - 1) {
            await new Promise((r) => setTimeout(r, batchDelay));
        }
    }

    progress.completed = citations.length;
    progress.log.push(`✓ AI enrichment complete — ${records.length} regulations generated`);
    onProgress({ ...progress });

    // ── Phase 3: Persist to Supabase ──
    progress.phase = 'persisting';
    progress.completed = 0;
    progress.currentItem = 'Saving to regulations ledger…';
    onProgress({ ...progress });

    let persisted = 0;
    let errors = 0;

    for (let i = 0; i < records.length; i++) {
        try {
            await upsertRegulation(records[i]);
            persisted++;
            progress.log.push(`↳ Saved: ${records[i].title}`);
        } catch (err) {
            errors++;
            const msg = err instanceof Error ? err.message : String(err);
            progress.log.push(`✗ DB save failed: ${records[i].title} — ${msg}`);
        }

        progress.completed = i + 1;
        progress.currentItem = `Persisting ${i + 1}/${records.length}…`;
        onProgress({ ...progress });
    }

    // ── Phase 4: Watchdog scan ──
    progress.log.push(`\n🐕 Watchdog: scanning existing documents for compliance issues…`);
    onProgress({ ...progress });

    try {
        const watchdogResult = await runWatchdogScan('new_regulation', (wd) => {
            progress.currentItem = wd.message;
            onProgress({ ...progress });
        });

        if (watchdogResult.flaggedCount > 0) {
            progress.log.push(`⚠️ Watchdog flagged ${watchdogResult.flaggedCount} of ${watchdogResult.scannedCount} documents for re-verification`);
        } else if (watchdogResult.scannedCount > 0) {
            progress.log.push(`✓ Watchdog scanned ${watchdogResult.scannedCount} documents — all clear`);
        } else {
            progress.log.push(`↳ Watchdog: no documents to scan`);
        }
    } catch (err) {
        progress.log.push(`✗ Watchdog scan failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── Done ──
    progress.phase = 'done';
    progress.currentItem = '';

    if (errors > 0 && persisted === 0) {
        progress.log.push(`\n⚠️ All DB saves failed (likely a permissions issue). Regulations are shown locally.`);
        progress.log.push(`💡 To fix: run the RLS policy update in your Supabase SQL editor, then re-sync.`);
    } else {
        progress.log.push(`\n✅ Sync complete — ${persisted} saved to DB, ${errors} failed`);
    }

    onProgress({ ...progress });

    return { records, persisted, errors };
}
