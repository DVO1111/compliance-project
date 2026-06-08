// src/lib/adverseEventService.ts
// Adverse Event (AE) sentinel — scans text for potential adverse events and manages their lifecycle.

import { supabase } from './supabase';
import { logger } from './logger';
import { recordAuditEvent } from './auditService';

/* ── Types ───────────────────────────────────────────── */

export interface AdverseEvent {
  id: string;
  company_id: string;
  channel_id: string | null;
  source_text: string;
  detected_phrase: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'detected' | 'quarantined' | 'reported' | 'dismissed';
  reporter_notes: string | null;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

/* ── AE Keywords ─────────────────────────────────────── */

const AE_KEYWORDS: { phrase: string; severity: AdverseEvent['severity'] }[] = [
  // High severity
  { phrase: 'gave me a rash', severity: 'high' },
  { phrase: 'allergic reaction', severity: 'high' },
  { phrase: 'anaphylaxis', severity: 'critical' },
  { phrase: 'hospitalized', severity: 'critical' },
  { phrase: 'went to the er', severity: 'critical' },
  { phrase: 'emergency room', severity: 'critical' },
  { phrase: 'life threatening', severity: 'critical' },
  { phrase: 'nearly died', severity: 'critical' },
  { phrase: 'had a seizure', severity: 'critical' },
  { phrase: 'heart attack', severity: 'critical' },
  { phrase: 'stroke', severity: 'critical' },
  { phrase: 'birth defect', severity: 'critical' },

  // Medium severity
  { phrase: 'side effect', severity: 'medium' },
  { phrase: 'adverse reaction', severity: 'medium' },
  { phrase: 'made me sick', severity: 'medium' },
  { phrase: 'feeling worse', severity: 'medium' },
  { phrase: 'nausea', severity: 'medium' },
  { phrase: 'vomiting', severity: 'medium' },
  { phrase: 'dizziness', severity: 'medium' },
  { phrase: 'headache after', severity: 'medium' },
  { phrase: 'swelling', severity: 'medium' },
  { phrase: 'itching', severity: 'medium' },
  { phrase: 'bleeding', severity: 'medium' },
  { phrase: 'chest pain', severity: 'high' },
  { phrase: 'difficulty breathing', severity: 'high' },
  { phrase: 'blurred vision', severity: 'medium' },

  // Low severity
  { phrase: 'didn\'t work', severity: 'low' },
  { phrase: 'no improvement', severity: 'low' },
  { phrase: 'not effective', severity: 'low' },
  { phrase: 'mild discomfort', severity: 'low' },
  { phrase: 'slight irritation', severity: 'low' },
];

/* ── Scanning ────────────────────────────────────────── */

export async function scanForAdverseEvents(
  companyId: string,
  channelId: string | null,
  text: string,
  userId?: string,
): Promise<AdverseEvent[]> {
  const lower = text.toLowerCase();
  const detected: AdverseEvent[] = [];

  for (const kw of AE_KEYWORDS) {
    if (lower.includes(kw.phrase)) {
      const idx = lower.indexOf(kw.phrase);
      const start = Math.max(0, idx - 80);
      const end = Math.min(text.length, idx + kw.phrase.length + 80);
      const snippet = text.slice(start, end);

      const { data, error } = await (supabase as any)
        .from('adverse_events')
        .insert({
          company_id: companyId,
          channel_id: channelId,
          source_text: snippet,
          detected_phrase: kw.phrase,
          severity: kw.severity,
          status: 'detected',
        })
        .select()
        .single();

      if (!error && data) {
        detected.push(data);
        try {
          await recordAuditEvent({
            companyId,
            userId: userId ?? 'system',
            action: `ae.detected: "${kw.phrase}" (${kw.severity})`,
            entityType: 'adverse_event',
            entityId: data.id,
            metadata: { phrase: kw.phrase, severity: kw.severity, channelId },
            captureEvidence: false,
          });
        } catch { /* audit never blocks */ }
      }
    }
  }

  return detected;
}

/* ── Lifecycle Management ────────────────────────────── */

export async function quarantineEvent(
  eventId: string,
  companyId: string,
  userId: string,
): Promise<void> {
  await (supabase as any)
    .from('adverse_events')
    .update({ status: 'quarantined' })
    .eq('id', eventId);

  try {
    await recordAuditEvent({
      companyId,
      userId,
      action: 'ae.quarantined',
      entityType: 'adverse_event',
      entityId: eventId,
      metadata: {},
      captureEvidence: false,
    });
  } catch { /* audit never blocks */ }
}

export async function reportEvent(
  eventId: string,
  notes: string,
  userId: string,
  companyId: string,
): Promise<void> {
  await (supabase as any)
    .from('adverse_events')
    .update({
      status: 'reported',
      reporter_notes: notes,
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
    })
    .eq('id', eventId);

  try {
    await recordAuditEvent({
      companyId,
      userId,
      action: 'ae.reported_to_pv',
      entityType: 'adverse_event',
      entityId: eventId,
      metadata: { notes: notes.slice(0, 200) },
      captureEvidence: false,
    });
  } catch { /* audit never blocks */ }
}

export async function dismissEvent(
  eventId: string,
  userId: string,
  companyId: string,
): Promise<void> {
  await (supabase as any)
    .from('adverse_events')
    .update({
      status: 'dismissed',
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
    })
    .eq('id', eventId);

  try {
    await recordAuditEvent({
      companyId,
      userId,
      action: 'ae.dismissed',
      entityType: 'adverse_event',
      entityId: eventId,
      metadata: {},
      captureEvidence: false,
    });
  } catch { /* audit never blocks */ }
}

export async function getAdverseEvents(
  companyId: string,
  statusFilter?: AdverseEvent['status'] | 'all'
): Promise<AdverseEvent[]> {
  let query = (supabase as any)
    .from('adverse_events')
    .select('*')
    .eq('company_id', companyId)
    .order('detected_at', { ascending: false })
    .limit(200);

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) { logger.error('getAdverseEvents error:', error); return []; }
  return data ?? [];
}

export async function getAEStats(companyId: string) {
  const { data } = await (supabase as any)
    .from('adverse_events')
    .select('severity, status')
    .eq('company_id', companyId);

  const events = data ?? [];
  return {
    total: events.length,
    detected: events.filter((e: any) => e.status === 'detected').length,
    quarantined: events.filter((e: any) => e.status === 'quarantined').length,
    reported: events.filter((e: any) => e.status === 'reported').length,
    critical: events.filter((e: any) => (e.severity === 'critical' || e.severity === 'high') && e.status !== 'dismissed').length,
  };
}
