/**
 * The contract between signing and transitioning.
 *
 * This exists because the bug it guards against was invisible for a
 * month. `lifecycle_transition` has taken a p_signature_id since
 * 20260917000000; the client sent six arguments to an eight-argument
 * function and PostgREST filled the rest with defaults. Nothing failed
 * to compile, nothing failed at runtime, and nothing failed in any test
 * — because no action in the product required a signature yet. The
 * first one that did (QA closure of a deviation) was impossible to
 * perform, with an error that blamed the signature rather than the
 * missing parameter.
 *
 * So these tests assert the wiring, not the database: that the id is
 * passed, that signing happens first, and that a refused signature is
 * reported as a refused signature.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const recordAuditEvent = vi.fn().mockResolvedValue(undefined);
const signElectronicRecord = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));
vi.mock('../lib/auditService', () => ({
  recordAuditEvent: (...a: unknown[]) => recordAuditEvent(...a),
}));
vi.mock('../lib/electronicSignatureService', () => ({
  signElectronicRecord: (...a: unknown[]) => signElectronicRecord(...a),
  SIGNATURE_MEANINGS: ['approved', 'reviewed', 'verified', 'authored', 'rejected'],
}));

const okTransition = {
  data: { from_state: 'pending_qa_closure', to_state: 'closed', history_id: 'h1', actor_id: 'u1' },
  error: null,
};

beforeEach(() => {
  rpc.mockReset();
  recordAuditEvent.mockReset().mockResolvedValue(undefined);
  signElectronicRecord.mockReset();
});

describe('transition', () => {
  it('sends the signature id to the database', async () => {
    const { transition } = await import('../lib/lifecycleService');
    rpc.mockResolvedValue(okTransition);

    await transition({
      entityType: 'deviation', entityId: 'd1', actionKey: 'qa_close',
      companyId: 'c1', comment: 'approved', signatureId: 'sig-1',
    });

    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('lifecycle_transition');
    expect(args.p_signature_id).toBe('sig-1');
  });

  //  Explicit null, not omitted. An omitted key and a null are the same
  //  to PostgREST here, but sending it makes the parameter visible in
  //  the call rather than something a reader has to know is defaulted.
  it('sends null rather than nothing when there is no signature', async () => {
    const { transition } = await import('../lib/lifecycleService');
    rpc.mockResolvedValue(okTransition);

    await transition({
      entityType: 'capa_record', entityId: 'x1', actionKey: 'set_investigating', companyId: 'c1',
    });

    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args).toHaveProperty('p_signature_id');
    expect(args.p_signature_id).toBeNull();
  });

  //  The actor is never sent. The database takes it from the session and
  //  refuses a mismatch, so anything the browser passed would be either
  //  redundant or a forgery.
  it('never sends an actor', async () => {
    const { transition } = await import('../lib/lifecycleService');
    rpc.mockResolvedValue(okTransition);

    await transition({
      entityType: 'deviation', entityId: 'd1', actionKey: 'start_investigation', companyId: 'c1',
    });

    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args).not.toHaveProperty('p_actor_id');
  });
});

describe('signAndTransition', () => {
  it('signs before it transitions, and spends that signature', async () => {
    const { signAndTransition } = await import('../lib/lifecycleService');
    signElectronicRecord.mockResolvedValue({ ok: true, signatureId: 'sig-9', signerName: 'Ada' });
    rpc.mockResolvedValue(okTransition);

    const order: string[] = [];
    signElectronicRecord.mockImplementation(async () => {
      order.push('sign'); return { ok: true, signatureId: 'sig-9' };
    });
    rpc.mockImplementation(async () => { order.push('transition'); return okTransition; });

    const res = await signAndTransition({
      entityType: 'deviation', entityId: 'd1', actionKey: 'qa_close',
      companyId: 'c1', meaning: 'approved', password: 'hunter2', comment: 'closed out',
    });

    //  The order is the point: a signature is taken over the record as
    //  it stands and spent immediately, so it cannot be a signature over
    //  a record that has already moved.
    expect(order).toEqual(['sign', 'transition']);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.signature_id).toBe('sig-9');

    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_signature_id).toBe('sig-9');
  });

  it('passes the action as what is being signed, not a separate name', async () => {
    const { signAndTransition } = await import('../lib/lifecycleService');
    signElectronicRecord.mockResolvedValue({ ok: true, signatureId: 'sig-9' });
    rpc.mockResolvedValue(okTransition);

    await signAndTransition({
      entityType: 'deviation', entityId: 'd1', actionKey: 'qa_close',
      companyId: 'c1', meaning: 'approved', password: 'pw',
    });

    const input = signElectronicRecord.mock.calls[0][0] as Record<string, unknown>;
    expect(input.action).toBe('qa_close');
    expect(input.entityId).toBe('d1');
    expect(input.entityType).toBe('deviation');
  });

  //  A mistyped password is the common case, and reporting it as a
  //  workflow failure sends somebody to look at the lifecycle instead
  //  of at the field they are typing in.
  it('reports a refused signature as a signature problem', async () => {
    const { signAndTransition } = await import('../lib/lifecycleService');
    signElectronicRecord.mockResolvedValue({
      ok: false, code: 'E_BAD_PASSWORD', message: 'That password was not correct.',
    });

    const res = await signAndTransition({
      entityType: 'deviation', entityId: 'd1', actionKey: 'qa_close',
      companyId: 'c1', meaning: 'approved', password: 'wrong',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('E_BAD_PASSWORD');
    //  And nothing was attempted against the lifecycle.
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not transition when the signature is refused', async () => {
    const { signAndTransition } = await import('../lib/lifecycleService');
    signElectronicRecord.mockResolvedValue({ ok: false, code: 'E_SIGNATURE_ERROR' });

    await signAndTransition({
      entityType: 'deviation', entityId: 'd1', actionKey: 'qa_close',
      companyId: 'c1', meaning: 'approved', password: 'pw',
    });

    expect(rpc).not.toHaveBeenCalled();
  });

  //  "A failed transition leaves an unspent signature" is deliberate:
  //  deleting the record that somebody entered their password and
  //  approved something is exactly the evidence that must not vanish.
  it('keeps the signature when the transition is refused', async () => {
    const { signAndTransition } = await import('../lib/lifecycleService');
    signElectronicRecord.mockResolvedValue({ ok: true, signatureId: 'sig-9' });
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'LIFECYCLE_ROLE_REQUIRED: action "qa_close" requires role admin' },
    });

    const res = await signAndTransition({
      entityType: 'deviation', entityId: 'd1', actionKey: 'qa_close',
      companyId: 'c1', meaning: 'approved', password: 'pw',
    });

    expect(res.ok).toBe(false);
    //  One signing attempt, and no attempt to undo or delete it.
    expect(signElectronicRecord).toHaveBeenCalledTimes(1);
  });

  //  The password is the one value that must not travel anywhere else.
  it('never puts the password in the transition call', async () => {
    const { signAndTransition } = await import('../lib/lifecycleService');
    signElectronicRecord.mockResolvedValue({ ok: true, signatureId: 'sig-9' });
    rpc.mockResolvedValue(okTransition);

    await signAndTransition({
      entityType: 'deviation', entityId: 'd1', actionKey: 'qa_close',
      companyId: 'c1', meaning: 'approved', password: 'hunter2',
      comment: 'ok', metadata: { note: 'x' },
    });

    expect(JSON.stringify(rpc.mock.calls)).not.toContain('hunter2');
    expect(JSON.stringify(recordAuditEvent.mock.calls)).not.toContain('hunter2');
  });
});
