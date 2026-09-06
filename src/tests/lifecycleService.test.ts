/**
 * Lifecycle Engine — service-layer unit tests.
 *
 * These cover the parts of the service that are pure TypeScript: error
 * classification and row mapping. They deliberately do NOT attempt to
 * assert transaction, state or history behaviour by inspecting mocks —
 * that behaviour lives in Postgres and asserting it against a mock would
 * prove nothing. It is covered for real by
 * `supabase/tests/lifecycle_engine_test.sql`, which runs against a
 * database and includes the atomicity and RLS cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();

vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) } }));
vi.mock('../lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../lib/auditService', () => ({ recordAuditEvent: vi.fn().mockResolvedValue(undefined) }));

import { transition, getAvailableActions, getHistory } from '../lib/lifecycleService';
import { recordAuditEvent } from '../lib/auditService';

const ARGS = {
  entityType: 'lctest_doc',
  entityId: '00000000-0000-4000-c000-000000000001',
  actionKey: 'submit',
  companyId: '00000000-0000-4000-a000-00000000000a',
};

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  vi.mocked(recordAuditEvent).mockClear();
});

describe('lifecycleService — transition delegates to the database', () => {
  it('calls the lifecycle_transition RPC, not a direct table write', async () => {
    rpc.mockResolvedValue({ data: { from_state: 'draft', to_state: 'in_review', history_id: 'h1', actor_id: 'u1' }, error: null });

    const result = await transition(ARGS);

    expect(rpc).toHaveBeenCalledWith('lifecycle_transition', expect.objectContaining({
      p_entity_type: 'lctest_doc',
      p_action_key: 'submit',
    }));
    // there is exactly one transition path; no table mutation may occur here
    expect(from).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      data: { from_state: 'draft', to_state: 'in_review', history_id: 'h1', actor_id: 'u1' },
    });
  });

  it('never sends an actor — the database resolves it from the session', async () => {
    rpc.mockResolvedValue({ data: { from_state: 'draft', to_state: 'in_review', history_id: 'h1', actor_id: 'u1' }, error: null });

    await transition(ARGS);

    // sending p_actor_id from the browser would be redundant at best and a
    // forgery attempt at worst; the RPC rejects a mismatched one anyway
    const payload = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('p_actor_id');
  });

  it('attributes the audit entry to the actor the database reported', async () => {
    rpc.mockResolvedValue({
      data: { from_state: 'draft', to_state: 'in_review', history_id: 'h1', actor_id: 'db-resolved-user' },
      error: null,
    });

    await transition(ARGS);

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'db-resolved-user' }),
    );
  });

  it.each([
    ['LIFECYCLE_FORBIDDEN: caller is not a member of the named company', 'LIFECYCLE_FORBIDDEN'],
    ['LIFECYCLE_COMPANY_MISMATCH: entity does not belong to the named company', 'LIFECYCLE_COMPANY_MISMATCH'],
    ['LIFECYCLE_ACTOR_MISMATCH: a transition cannot be attributed to another user', 'LIFECYCLE_ACTOR_MISMATCH'],
    ['LIFECYCLE_ROLE_REQUIRED: action "approve" requires role admin, caller has content_creator', 'LIFECYCLE_ROLE_REQUIRED'],
    ['LIFECYCLE_COMMENT_REQUIRED: action "approve" requires a comment', 'LIFECYCLE_COMMENT_REQUIRED'],
    ['LIFECYCLE_SIGNATURE_UNSUPPORTED: no signature subsystem exists yet', 'LIFECYCLE_SIGNATURE_UNSUPPORTED'],
    ['LIFECYCLE_PERMISSION_UNSUPPORTED: no vocabulary is defined yet', 'LIFECYCLE_PERMISSION_UNSUPPORTED'],
    ['LIFECYCLE_NOT_AUTHENTICATED: no authenticated user', 'LIFECYCLE_NOT_AUTHENTICATED'],
    ['LIFECYCLE_STATE_LOCKED: state "frozen" is locked; the record cannot be changed while it is in this state', 'LIFECYCLE_STATE_LOCKED'],
    ['LIFECYCLE_STATE_TERMINAL: state "done" is terminal; no further transitions are possible', 'LIFECYCLE_STATE_TERMINAL'],
  ])('classifies %s', async (message, code) => {
    rpc.mockResolvedValue({ data: null, error: { message } });
    const result = await transition(ARGS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(code);
  });

  it('classifies a rejected transition by its error code', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'LIFECYCLE_INVALID_TRANSITION: action "submit" is not available from state "in_review"' },
    });

    const result = await transition(ARGS);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('LIFECYCLE_INVALID_TRANSITION');
      // the message must identify the attempted action and state
      expect(result.message).toContain('submit');
      expect(result.message).toContain('in_review');
    }
  });

  it('distinguishes an uninitialised entity from an illegal action', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'LIFECYCLE_NOT_INITIALIZED: entity has no current state' } });
    const result = await transition(ARGS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('LIFECYCLE_NOT_INITIALIZED');
  });

  it('falls back to a generic code for an unrecognised failure', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const result = await transition(ARGS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('LIFECYCLE_ERROR');
  });

  it('does not write an audit entry when the transition is rejected', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'LIFECYCLE_INVALID_TRANSITION: nope' } });
    await transition(ARGS);
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it('still reports success if the audit write fails after a committed transition', async () => {
    rpc.mockResolvedValue({ data: { from_state: 'draft', to_state: 'in_review', history_id: 'h1', actor_id: 'u1' }, error: null });
    vi.mocked(recordAuditEvent).mockRejectedValueOnce(new Error('audit down'));

    const result = await transition(ARGS);

    // the database has already committed; the caller must not be told it failed
    expect(result.ok).toBe(true);
  });
});

describe('lifecycleService — reads', () => {
  it('returns an empty action list rather than throwing when the RPC fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(getAvailableActions('lctest_doc', ARGS.entityId, ARGS.companyId)).resolves.toEqual([]);
  });

  it('maps history rows to a flat shape in the order the database returned', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { id: 'h1', actor_id: 'u1', comment: null, metadata: {}, created_at: '2026-01-01T00:00:00Z',
          from_state: null, to_state: { state_key: 'draft' }, transition: null },
        { id: 'h2', actor_id: 'u1', comment: 'ok', metadata: { a: 1 }, created_at: '2026-01-02T00:00:00Z',
          from_state: { state_key: 'draft' }, to_state: { state_key: 'in_review' }, transition: { action_key: 'submit' } },
      ],
      error: null,
    });
    const eq3 = vi.fn().mockReturnValue({ order });
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eq1 }) });

    const history = await getHistory('lctest_doc', ARGS.entityId, ARGS.companyId);

    expect(history).toHaveLength(2);
    // the initialisation row has no from-state
    expect(history[0]).toMatchObject({ from_state_key: null, to_state_key: 'draft', action_key: null });
    expect(history[1]).toMatchObject({ from_state_key: 'draft', to_state_key: 'in_review', action_key: 'submit' });
    expect(order).toHaveBeenCalledWith('created_at', { ascending: true });
  });
});
