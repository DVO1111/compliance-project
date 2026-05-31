import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { validateMutation } from '../validationService';
import { webhookService } from '../platform/webhookService';
import { logger } from '../logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AuditType = 'soc2' | 'iso27001' | 'hipaa' | 'internal';
export type AuditSessionStatus = 'draft' | 'active' | 'closed';
export type AuditRequestStatus = 'open' | 'in_progress' | 'fulfilled' | 'closed';
export type ParticipantRole = 'auditor' | 'admin' | 'member';

export interface AuditSession {
  id: string;
  company_id: string;
  name: string;
  audit_type: AuditType;
  status: AuditSessionStatus;
  start_date: string | null;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
  // aggregated
  participants_count?: number;
  open_requests_count?: number;
}

export interface AuditSessionParticipant {
  id: string;
  company_id: string;
  audit_session_id: string;
  user_id: string;
  role: ParticipantRole;
  invited_email: string | null;
  created_at: string;
  // joined profile
  profile?: { full_name: string; email?: string; role?: string } | null;
}

export interface AuditRequest {
  id: string;
  company_id: string;
  audit_session_id: string;
  requested_by: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  status: AuditRequestStatus;
  due_at: string | null;
  created_at: string;
  fulfilled_at: string | null;
  // joined
  items?: AuditRequestItem[];
  evidence?: AuditRequestEvidence[];
  requester_profile?: { full_name: string } | null;
  assignee_profile?: { full_name: string } | null;
}

export interface AuditRequestItem {
  id: string;
  company_id: string;
  audit_request_id: string;
  control_id: string | null;
  policy_version_id: string | null;
  vendor_id: string | null;
  created_at: string;
  // joined
  control?: { id: string; title: string; reference_code: string } | null;
  policy_version?: { id: string; version_label: string; policy_id: string } | null;
  vendor?: { id: string; name: string } | null;
}

export interface AuditRequestEvidence {
  id: string;
  company_id: string;
  audit_request_id: string;
  submission_id: string;
  linked_by: string | null;
  created_at: string;
  // joined
  submission?: { id: string; title: string; platform: string; status: string; created_at: string } | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const AUDIT_TYPES: { id: AuditType; label: string }[] = [
  { id: 'soc2', label: 'SOC 2' },
  { id: 'iso27001', label: 'ISO 27001' },
  { id: 'hipaa', label: 'HIPAA' },
  { id: 'internal', label: 'Internal' },
];

export const SESSION_STATUSES: { id: AuditSessionStatus; label: string; color: string }[] = [
  { id: 'draft', label: 'Draft', color: '#94a3b8' },
  { id: 'active', label: 'Active', color: '#22c55e' },
  { id: 'closed', label: 'Closed', color: '#6366f1' },
];

export const REQUEST_STATUSES: { id: AuditRequestStatus; label: string; color: string }[] = [
  { id: 'open', label: 'Open', color: '#f59e0b' },
  { id: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { id: 'fulfilled', label: 'Fulfilled', color: '#22c55e' },
  { id: 'closed', label: 'Closed', color: '#6366f1' },
];

// ─── Audit Sessions ────────────────────────────────────────────────────────

export async function createAuditSession(
  companyId: string,
  userId: string,
  data: { name: string; audit_type: AuditType; start_date?: string; end_date?: string }
): Promise<AuditSession | null> {
  const validation = await validateMutation(userId, companyId, 'canManagePolicies');
  if (!validation.valid) throw new Error(validation.message);

  const { data: session, error } = await (supabase as any)
    .from('audit_sessions')
    .insert({
      company_id: companyId,
      name: data.name,
      audit_type: data.audit_type,
      status: 'draft',
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      created_by: userId,
    })
    .select()
    .single();

  if (error) { logger.error('createAuditSession:', error); return null; }

  // Auto-add creator as admin participant
  await (supabase as any)
    .from('audit_session_participants')
    .insert({
      company_id: companyId,
      audit_session_id: session.id,
      user_id: userId,
      role: 'admin',
    });

  await recordAuditEvent({
    userId,
    action: 'create_audit_session',
    entityType: 'audit_session',
    entityId: session.id,
    companyId,
    metadata: { name: data.name, audit_type: data.audit_type },
  });

  return session;
}

export async function listAuditSessions(companyId: string, userId: string): Promise<AuditSession[]> {
  const validation = await validateMutation(userId, companyId);
  if (!validation.valid) throw new Error(validation.message);

  const { data, error } = await (supabase as any)
    .from('audit_sessions')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) { logger.error('listAuditSessions:', error); return []; }

  // Enrich with counts
  const sessions = data ?? [];
  for (const s of sessions) {
    const { count: pCount } = await (supabase as any)
      .from('audit_session_participants')
      .select('*', { count: 'exact', head: true })
      .eq('audit_session_id', s.id);
    s.participants_count = pCount ?? 0;

    const { count: rCount } = await (supabase as any)
      .from('audit_requests')
      .select('*', { count: 'exact', head: true })
      .eq('audit_session_id', s.id)
      .in('status', ['open', 'in_progress']);
    s.open_requests_count = rCount ?? 0;
  }

  return sessions;
}

export async function listAuditSessionsForAuditor(userId: string): Promise<AuditSession[]> {
  // Get sessions the auditor participates in
  const { data: participations, error: pErr } = await (supabase as any)
    .from('audit_session_participants')
    .select('audit_session_id')
    .eq('user_id', userId);
  if (pErr || !participations?.length) return [];

  const sessionIds = participations.map((p: any) => p.audit_session_id);
  const { data, error } = await (supabase as any)
    .from('audit_sessions')
    .select('*')
    .in('id', sessionIds)
    .order('created_at', { ascending: false });
  if (error) { logger.error('listAuditSessionsForAuditor:', error); return []; }

  const sessions = data ?? [];
  for (const s of sessions) {
    const { count: pCount } = await (supabase as any)
      .from('audit_session_participants')
      .select('*', { count: 'exact', head: true })
      .eq('audit_session_id', s.id);
    s.participants_count = pCount ?? 0;

    const { count: rCount } = await (supabase as any)
      .from('audit_requests')
      .select('*', { count: 'exact', head: true })
      .eq('audit_session_id', s.id)
      .in('status', ['open', 'in_progress']);
    s.open_requests_count = rCount ?? 0;
  }

  return sessions;
}

export async function getAuditSession(sessionId: string): Promise<AuditSession | null> {
  const { data, error } = await (supabase as any)
    .from('audit_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (error) { logger.error('getAuditSession:', error); return null; }
  return data;
}

export async function updateAuditSession(
  sessionId: string,
  updates: Partial<Pick<AuditSession, 'name' | 'status' | 'start_date' | 'end_date'>>,
  userId: string,
  companyId: string
): Promise<boolean> {
  const validation = await validateMutation(userId, companyId, 'canManagePolicies');
  if (!validation.valid) throw new Error(validation.message);

  const { error } = await (supabase as any)
    .from('audit_sessions')
    .update(updates)
    .eq('id', sessionId);
  if (error) { logger.error('updateAuditSession:', error); return false; }
  return true;
}

// ─── Participants ───────────────────────────────────────────────────────────

export async function listParticipants(sessionId: string): Promise<AuditSessionParticipant[]> {
  const { data, error } = await (supabase as any)
    .from('audit_session_participants')
    .select('*, profile:profiles(full_name, role)')
    .eq('audit_session_id', sessionId)
    .order('created_at');
  if (error) { logger.error('listParticipants:', error); return []; }
  return (data ?? []).map((p: any) => ({
    ...p,
    profile: Array.isArray(p.profile) ? p.profile[0] ?? null : p.profile,
  }));
}

export async function addParticipant(
  companyId: string,
  sessionId: string,
  userId: string,
  role: ParticipantRole,
  invitedEmail: string | null,
  actorUserId: string
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('audit_session_participants')
    .insert({
      company_id: companyId,
      audit_session_id: sessionId,
      user_id: userId,
      role,
      invited_email: invitedEmail,
    });
  if (error) { logger.error('addParticipant:', error); return false; }

  await recordAuditEvent({
    userId: actorUserId,
    action: role === 'auditor' ? 'invite_auditor' : 'add_participant',
    entityType: 'audit_session_participant',
    entityId: sessionId,
    companyId,
    metadata: { participant_user_id: userId, role, invited_email: invitedEmail },
  });

  return true;
}

export async function removeParticipant(participantId: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('audit_session_participants')
    .delete()
    .eq('id', participantId);
  if (error) { logger.error('removeParticipant:', error); return false; }
  return true;
}

// ─── Audit Requests ─────────────────────────────────────────────────────────

export async function listRequests(sessionId: string): Promise<AuditRequest[]> {
  const { data, error } = await (supabase as any)
    .from('audit_requests')
    .select(`
      *,
      requester_profile:profiles!audit_requests_requested_by_fkey(full_name),
      assignee_profile:profiles!audit_requests_assigned_to_fkey(full_name)
    `)
    .eq('audit_session_id', sessionId)
    .order('created_at', { ascending: false });
  if (error) {
    // Fallback without profile joins (FK may not exist)
    const { data: fallback, error: err2 } = await (supabase as any)
      .from('audit_requests')
      .select('*')
      .eq('audit_session_id', sessionId)
      .order('created_at', { ascending: false });
    if (err2) { logger.error('listRequests:', err2); return []; }
    return fallback ?? [];
  }
  return data ?? [];
}

export async function createRequest(
  companyId: string,
  sessionId: string,
  userId: string,
  data: { title: string; description?: string; assigned_to?: string; due_at?: string }
): Promise<AuditRequest | null> {
  const validation = await validateMutation(userId, companyId, 'canManagePolicies');
  if (!validation.valid) throw new Error(validation.message);

  const { data: req, error } = await (supabase as any)
    .from('audit_requests')
    .insert({
      company_id: companyId,
      audit_session_id: sessionId,
      requested_by: userId,
      assigned_to: data.assigned_to || null,
      title: data.title,
      description: data.description || null,
      status: 'open',
      due_at: data.due_at || null,
    })
    .select()
    .single();
  if (error) { logger.error('createRequest:', error); return null; }

  await recordAuditEvent({
    userId,
    action: 'create_audit_request',
    entityType: 'audit_request',
    entityId: req.id,
    companyId,
    metadata: { title: data.title, session_id: sessionId },
  });

  // Webhook: audit.request.created
  await webhookService.enqueueEvent(companyId, 'audit.request.created', {
    request_id: req.id,
    session_id: sessionId,
    title: req.title,
    requested_by: userId,
    due_at: req.due_at
  }, { entityType: 'audit_request', entityId: req.id });

  return req;
}

export async function updateRequestStatus(
  requestId: string,
  status: AuditRequestStatus,
  userId: string,
  companyId: string
): Promise<boolean> {
  const updates: any = { status };
  if (status === 'fulfilled') updates.fulfilled_at = new Date().toISOString();

  const { error } = await (supabase as any)
    .from('audit_requests')
    .update(updates)
    .eq('id', requestId);
  if (error) { logger.error('updateRequestStatus:', error); return false; }

  await recordAuditEvent({
    userId,
    action: 'update_audit_request_status',
    entityType: 'audit_request',
    entityId: requestId,
    companyId,
    metadata: { new_status: status },
  });

  return true;
}

// ─── Request Items (link controls/policies/vendors) ─────────────────────────

export async function listRequestItems(requestId: string): Promise<AuditRequestItem[]> {
  const { data, error } = await (supabase as any)
    .from('audit_request_items')
    .select(`
      *,
      control:grc_controls(id, title, reference_code),
      policy_version:policy_versions(id, version_label, policy_id),
      vendor:vendors(id, name)
    `)
    .eq('audit_request_id', requestId)
    .order('created_at');
  if (error) {
    // Fallback
    const { data: fb, error: err2 } = await (supabase as any)
      .from('audit_request_items')
      .select('*')
      .eq('audit_request_id', requestId)
      .order('created_at');
    if (err2) { logger.error('listRequestItems:', err2); return []; }
    return fb ?? [];
  }
  return (data ?? []).map((item: any) => ({
    ...item,
    control: Array.isArray(item.control) ? item.control[0] ?? null : item.control,
    policy_version: Array.isArray(item.policy_version) ? item.policy_version[0] ?? null : item.policy_version,
    vendor: Array.isArray(item.vendor) ? item.vendor[0] ?? null : item.vendor,
  }));
}

export async function linkControlToRequest(
  companyId: string, requestId: string, controlId: string, userId: string
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('audit_request_items')
    .insert({ company_id: companyId, audit_request_id: requestId, control_id: controlId });
  if (error) { logger.error('linkControlToRequest:', error); return false; }
  await recordAuditEvent({
    userId, action: 'link_audit_request_item', entityType: 'audit_request_item',
    entityId: requestId, companyId, metadata: { control_id: controlId },
  });
  return true;
}

export async function linkPolicyVersionToRequest(
  companyId: string, requestId: string, policyVersionId: string, userId: string
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('audit_request_items')
    .insert({ company_id: companyId, audit_request_id: requestId, policy_version_id: policyVersionId });
  if (error) { logger.error('linkPolicyVersionToRequest:', error); return false; }
  await recordAuditEvent({
    userId, action: 'link_audit_request_item', entityType: 'audit_request_item',
    entityId: requestId, companyId, metadata: { policy_version_id: policyVersionId },
  });
  return true;
}

export async function linkVendorToRequest(
  companyId: string, requestId: string, vendorId: string, userId: string
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('audit_request_items')
    .insert({ company_id: companyId, audit_request_id: requestId, vendor_id: vendorId });
  if (error) { logger.error('linkVendorToRequest:', error); return false; }
  await recordAuditEvent({
    userId, action: 'link_audit_request_item', entityType: 'audit_request_item',
    entityId: requestId, companyId, metadata: { vendor_id: vendorId },
  });
  return true;
}

// ─── Request Evidence (fulfillment via Archive) ─────────────────────────────

export async function listRequestEvidence(requestId: string): Promise<AuditRequestEvidence[]> {
  const { data, error } = await (supabase as any)
    .from('audit_request_evidence')
    .select('*, submission:content_submissions(id, title, platform, status, created_at)')
    .eq('audit_request_id', requestId)
    .order('created_at');
  if (error) { logger.error('listRequestEvidence:', error); return []; }
  return (data ?? []).map((e: any) => ({
    ...e,
    submission: Array.isArray(e.submission) ? e.submission[0] ?? null : e.submission,
  }));
}

export async function linkEvidenceToRequest(
  companyId: string, requestId: string, submissionId: string, userId: string
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('audit_request_evidence')
    .insert({
      company_id: companyId,
      audit_request_id: requestId,
      submission_id: submissionId,
      linked_by: userId,
    });
  if (error) { logger.error('linkEvidenceToRequest:', error); return false; }

  await recordAuditEvent({
    userId,
    action: 'link_audit_request_evidence',
    entityType: 'audit_request_evidence',
    entityId: requestId,
    companyId,
    metadata: { submission_id: submissionId },
  });

  return true;
}

export async function unlinkEvidence(evidenceId: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('audit_request_evidence')
    .delete()
    .eq('id', evidenceId);
  if (error) { logger.error('unlinkEvidence:', error); return false; }
  return true;
}

// ─── Session Evidence (all evidence across all requests, deduped) ───────────

export async function getSessionEvidence(sessionId: string): Promise<AuditRequestEvidence[]> {
  const { data, error } = await (supabase as any)
    .from('audit_request_evidence')
    .select(`
      *,
      submission:content_submissions(id, title, platform, status, created_at),
      audit_request:audit_requests!inner(audit_session_id)
    `)
    .eq('audit_request.audit_session_id', sessionId)
    .order('created_at');

  if (error) {
    // Fallback: fetch request IDs first
    const { data: reqs } = await (supabase as any)
      .from('audit_requests')
      .select('id')
      .eq('audit_session_id', sessionId);
    if (!reqs?.length) return [];
    const reqIds = reqs.map((r: any) => r.id);
    const { data: evidence, error: err2 } = await (supabase as any)
      .from('audit_request_evidence')
      .select('*, submission:content_submissions(id, title, platform, status, created_at)')
      .in('audit_request_id', reqIds)
      .order('created_at');
    if (err2) { logger.error('getSessionEvidence fallback:', err2); return []; }
    return (evidence ?? []).map((e: any) => ({
      ...e,
      submission: Array.isArray(e.submission) ? e.submission[0] ?? null : e.submission,
    }));
  }

  // Dedupe by submission_id
  const seen = new Set<string>();
  const deduped: AuditRequestEvidence[] = [];
  for (const e of (data ?? [])) {
    const mapped = {
      ...e,
      submission: Array.isArray(e.submission) ? e.submission[0] ?? null : e.submission,
    };
    if (!seen.has(mapped.submission_id)) {
      seen.add(mapped.submission_id);
      deduped.push(mapped);
    }
  }
  return deduped;
}

// ─── Audit Pack Export ──────────────────────────────────────────────────────

export async function exportAuditPack(sessionId: string): Promise<object | null> {
  const session = await getAuditSession(sessionId);
  if (!session) return null;

  const participants = await listParticipants(sessionId);
  const requests = await listRequests(sessionId);
  const evidence = await getSessionEvidence(sessionId);

  // Enrich requests with items and evidence
  const enrichedRequests = [];
  for (const req of requests) {
    const items = await listRequestItems(req.id);
    const reqEvidence = await listRequestEvidence(req.id);
    enrichedRequests.push({
      ...req,
      items,
      evidence: reqEvidence,
    });
  }

  return {
    exported_at: new Date().toISOString(),
    session: {
      id: session.id,
      name: session.name,
      audit_type: session.audit_type,
      status: session.status,
      start_date: session.start_date,
      end_date: session.end_date,
      created_at: session.created_at,
    },
    participants: participants.map(p => ({
      user_id: p.user_id,
      role: p.role,
      name: p.profile?.full_name ?? p.invited_email ?? 'Unknown',
    })),
    requests: enrichedRequests.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      due_at: r.due_at,
      created_at: r.created_at,
      fulfilled_at: r.fulfilled_at,
      items: (r.items ?? []).map((i: any) => ({
        control: i.control ? `${i.control.reference_code} - ${i.control.title}` : null,
        policy_version: i.policy_version?.version_label ?? null,
        vendor: i.vendor?.name ?? null,
      })),
      evidence: (r.evidence ?? []).map((e: any) => ({
        submission_id: e.submission_id,
        title: e.submission?.title ?? 'Unknown',
        platform: e.submission?.platform ?? '',
        linked_at: e.created_at,
      })),
    })),
    evidence_summary: evidence.map(e => ({
      submission_id: e.submission_id,
      title: e.submission?.title ?? 'Unknown',
      platform: e.submission?.platform ?? '',
      status: e.submission?.status ?? '',
      created_at: e.submission?.created_at ?? '',
    })),
  };
}
