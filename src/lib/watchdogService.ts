/**
 * Watchdog Background Agent
 *
 * Scans existing content_submissions against the full compliance rule engine
 * whenever new regulations are synced or a Daily Brief triggers.
 *
 * Flow:
 *   1. Load all non-archived content_submissions from Supabase
 *   2. Run each document's content_text through the compliance engine
 *   3. If violations are found → create watchdog_alert, update status, notify owner
 */

import { supabase } from './supabase';
import { analyzeCompliance } from './complianceEngine';
import type { Jurisdiction } from './rules/types';

// ── Types ────────────────────────────────────────────────────────────────

export type WatchdogTrigger = 'new_regulation' | 'daily_brief' | 'regulatory_update';

export interface WatchdogAlert {
    content_id: string;
    content_title: string;
    owner_id: string;
    matched_phrases: { phrase: string; rule_id: string; severity: string }[];
    risk_level: string;
}

export interface WatchdogScanResult {
    scannedCount: number;
    flaggedCount: number;
    alerts: WatchdogAlert[];
    errors: string[];
}

export type WatchdogProgressCallback = (status: {
    phase: 'loading' | 'scanning' | 'alerting' | 'done' | 'error';
    current: number;
    total: number;
    message: string;
}) => void;

// ── Internal helpers ─────────────────────────────────────────────────────

interface ContentDoc {
    id: string;
    user_id: string;
    title: string;
    content_text: string;
    platform: string;
    target_audience: string;
    status: string;
}

// ── Main scan function ───────────────────────────────────────────────────

/**
 * Run the full watchdog scan pipeline.
 *
 * @param triggerType  What triggered this scan
 * @param onProgress   Optional callback for real-time UI updates
 * @param jurisdiction Which jurisdiction's rules to apply (default: nigeria)
 */
export async function runWatchdogScan(
    triggerType: WatchdogTrigger,
    onProgress?: WatchdogProgressCallback,
    jurisdiction: Jurisdiction = 'nigeria'
): Promise<WatchdogScanResult> {
    const result: WatchdogScanResult = {
        scannedCount: 0,
        flaggedCount: 0,
        alerts: [],
        errors: [],
    };

    const notify = (phase: any, current: number, total: number, message: string) => {
        onProgress?.({ phase, current, total, message });
    };

    // ── Phase 1: Load documents ──
    notify('loading', 0, 0, 'Loading content documents…');

    const { data: documents, error: fetchError } = await (supabase as any)
        .from('content_submissions')
        .select('id, user_id, title, content_text, platform, target_audience, status')
        .in('status', ['pending', 'approved', 'flagged', 'critical'])
        .order('created_at', { ascending: false })
        .limit(200);

    if (fetchError) {
        const msg = `Failed to fetch documents: ${fetchError.message}`;
        result.errors.push(msg);
        notify('error', 0, 0, msg);
        return result;
    }

    const docs: ContentDoc[] = documents || [];
    if (docs.length === 0) {
        notify('done', 0, 0, 'No documents to scan');
        return result;
    }

    // ── Phase 2: Scan each document ──
    notify('scanning', 0, docs.length, `Scanning ${docs.length} documents…`);

    for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        result.scannedCount++;

        try {
            // Use the real async analyzeCompliance
            const analysis = await analyzeCompliance(
                doc.content_text,
                doc.platform,
                doc.target_audience,
                jurisdiction
            );

            // Only flag if there are actual violations (medium risk or higher)
            if (
                analysis.overall_risk !== 'low' &&
                analysis.flagged_phrases.length > 0
            ) {
                const matchedPhrases = analysis.flagged_phrases.map((fp: any) => ({
                    phrase: fp.phrase || fp.original || '',
                    rule_id:
                        analysis.violated_regulations?.[0]?.regulation_id || 'RULE',
                    severity: analysis.overall_risk,
                }));

                const alert: WatchdogAlert = {
                    content_id: doc.id,
                    content_title: doc.title,
                    owner_id: doc.user_id,
                    matched_phrases: matchedPhrases,
                    risk_level: analysis.overall_risk,
                };

                result.alerts.push(alert);
                result.flaggedCount++;
            }
        } catch (err) {
            result.errors.push(
                `Scan failed for "${doc.title}": ${err instanceof Error ? err.message : String(err)}`
            );
        }

        notify(
            'scanning',
            i + 1,
            docs.length,
            `Scanned: ${doc.title.slice(0, 60)}`
        );
    }

    // ── Phase 3: Create alerts & notifications ──
    if (result.alerts.length > 0) {
        notify('alerting', 0, result.alerts.length, 'Creating alerts and notifications…');

        for (let i = 0; i < result.alerts.length; i++) {
            const alert = result.alerts[i];

            try {
                // Insert watchdog alert
                await (supabase as any).from('watchdog_alerts').insert({
                    content_id: alert.content_id,
                    trigger_type: triggerType,
                    matched_phrases: alert.matched_phrases,
                    status: 'pending',
                });

                // Update document status to reverification_required
                await (supabase as any)
                    .from('content_submissions')
                    .update({
                        status: 'reverification_required',
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', alert.content_id);

                // Insert notification for the document owner
                await (supabase as any).from('notifications').insert({
                    recipient_id: alert.owner_id,
                    type: 'reverification_required',
                    content_id: alert.content_id,
                    message: `⚠️ "${alert.content_title}" needs re-verification — ${alert.matched_phrases.length} compliance issue${alert.matched_phrases.length > 1 ? 's' : ''} detected (${alert.risk_level} risk)`,
                });
            } catch (err) {
                result.errors.push(
                    `Alert creation failed for "${alert.content_title}": ${err instanceof Error ? err.message : String(err)}`
                );
            }

            notify(
                'alerting',
                i + 1,
                result.alerts.length,
                `Alerted: ${alert.content_title.slice(0, 60)}`
            );
        }
    }

    // ── Done ──
    notify(
        'done',
        result.scannedCount,
        result.scannedCount,
        `Watchdog complete — ${result.flaggedCount} of ${result.scannedCount} documents flagged`
    );

    return result;
}
