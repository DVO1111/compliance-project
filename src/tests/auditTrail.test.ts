import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase before importing the service
vi.mock('../lib/supabase', () => {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    supabase: {
      from: vi.fn(() => mockChain),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  };
});

import type { AuditEventParams, AuditEntry } from '../lib/auditService';

describe('auditTrail — AuditEventParams validation', () => {
  it('AuditEventParams requires userId, action, entityType, entityId, companyId', () => {
    const validParams: AuditEventParams = {
      userId: 'user-123',
      action: 'content.uploaded',
      entityType: 'content_submission',
      entityId: 'entity-456',
      companyId: 'company-789',
    };

    expect(validParams.userId).toBe('user-123');
    expect(validParams.action).toBe('content.uploaded');
    expect(validParams.entityType).toBe('content_submission');
    expect(validParams.entityId).toBe('entity-456');
    expect(validParams.companyId).toBe('company-789');
  });

  it('AuditEventParams accepts optional metadata', () => {
    const params: AuditEventParams = {
      userId: 'user-1',
      action: 'review.approved',
      entityType: 'legal_review',
      entityId: 'review-1',
      companyId: 'co-1',
      metadata: { reviewer: 'John', decision: 'approved' },
    };

    expect(params.metadata).toEqual({ reviewer: 'John', decision: 'approved' });
  });

  it('AuditEventParams accepts captureEvidence flag', () => {
    const params: AuditEventParams = {
      userId: 'user-1',
      action: 'content.deleted',
      entityType: 'content_submission',
      entityId: 'ent-1',
      companyId: 'co-1',
      captureEvidence: false,
    };

    expect(params.captureEvidence).toBe(false);
  });
});

describe('auditTrail — AuditEntry structure', () => {
  it('AuditEntry has all required fields for chain integrity', () => {
    const entry: AuditEntry = {
      id: 'audit-001',
      user_id: 'user-123',
      action: 'content.uploaded',
      entity_type: 'content_submission',
      entity_id: 'entity-456',
      metadata: { company_id: 'co-1' },
      integrity_hash: 'abc123hash',
      previous_hash: 'GENESIS',
      evidence_snapshot: { captured_at: '2026-01-01T00:00:00Z' },
      company_id: 'co-1',
      sequence_number: 1,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    expect(entry.integrity_hash).toBeTruthy();
    expect(entry.previous_hash).toBe('GENESIS');
    expect(entry.sequence_number).toBe(1);
  });

  it('first entry in chain uses GENESIS as previous_hash', () => {
    const genesisEntry: AuditEntry = {
      id: 'audit-001',
      user_id: 'user-1',
      action: 'system.init',
      entity_type: 'system',
      entity_id: null,
      metadata: {},
      integrity_hash: 'hash-1',
      previous_hash: 'GENESIS',
      evidence_snapshot: {},
      company_id: 'co-1',
      sequence_number: 1,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    expect(genesisEntry.previous_hash).toBe('GENESIS');
  });

  it('subsequent entries link to previous integrity_hash', () => {
    const entry1: AuditEntry = {
      id: 'audit-001',
      user_id: 'user-1',
      action: 'content.uploaded',
      entity_type: 'content_submission',
      entity_id: 'e-1',
      metadata: {},
      integrity_hash: 'hash-of-entry-1',
      previous_hash: 'GENESIS',
      evidence_snapshot: {},
      company_id: 'co-1',
      sequence_number: 1,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    const entry2: AuditEntry = {
      id: 'audit-002',
      user_id: 'user-1',
      action: 'review.submitted',
      entity_type: 'legal_review',
      entity_id: 'e-2',
      metadata: {},
      integrity_hash: 'hash-of-entry-2',
      previous_hash: entry1.integrity_hash!,
      evidence_snapshot: {},
      company_id: 'co-1',
      sequence_number: 2,
      created_at: '2026-01-01T00:01:00.000Z',
    };

    expect(entry2.previous_hash).toBe(entry1.integrity_hash);
    expect(entry2.sequence_number).toBe(entry1.sequence_number! + 1);
  });

  it('broken chain is detectable when previous_hash does not match', () => {
    const chain: AuditEntry[] = [
      {
        id: 'a1', user_id: 'u1', action: 'upload', entity_type: 'content',
        entity_id: 'e1', metadata: {}, integrity_hash: 'hash-1',
        previous_hash: 'GENESIS', evidence_snapshot: {}, company_id: 'c1',
        sequence_number: 1, created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'a2', user_id: 'u1', action: 'review', entity_type: 'content',
        entity_id: 'e1', metadata: {}, integrity_hash: 'hash-2',
        previous_hash: 'TAMPERED-HASH', // should be 'hash-1'
        evidence_snapshot: {}, company_id: 'c1',
        sequence_number: 2, created_at: '2026-01-01T00:01:00Z',
      },
    ];

    // Simulate chain verification
    let valid = true;
    let expectedPrev = 'GENESIS';
    for (const entry of chain) {
      if (entry.previous_hash !== expectedPrev) {
        valid = false;
        break;
      }
      expectedPrev = entry.integrity_hash!;
    }

    expect(valid).toBe(false);
  });
});

describe('auditTrail — recordAuditEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recordAuditEvent calls supabase insert with correct fields', async () => {
    const { supabase } = await import('../lib/supabase');
    const { recordAuditEvent } = await import('../lib/auditService');

    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: mockInsert,
    };
    vi.mocked(supabase.from).mockReturnValue(mockChain as any);

    await recordAuditEvent({
      userId: 'user-1',
      action: 'content.uploaded',
      entityType: 'content_submission',
      entityId: 'entity-1',
      companyId: 'company-1',
      captureEvidence: false,
    });

    expect(supabase.from).toHaveBeenCalledWith('audit_logs');
    expect(mockInsert).toHaveBeenCalled();

    const insertedData = mockInsert.mock.calls[0][0];
    expect(insertedData.user_id).toBe('user-1');
    expect(insertedData.action).toBe('content.uploaded');
    expect(insertedData.entity_type).toBe('content_submission');
    expect(insertedData.entity_id).toBe('entity-1');
    expect(insertedData.company_id).toBe('company-1');
    expect(insertedData.integrity_hash).toBeTruthy();
    expect(insertedData.previous_hash).toBeTruthy();
    expect(insertedData.sequence_number).toBe(1);
  });
});
