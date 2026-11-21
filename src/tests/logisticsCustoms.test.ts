/**
 * Logistics and Customs — the service contracts, and the rule's two copies.
 *
 * ── WHY THIS FILE EXISTS ──
 *
 * Five tables carrying customs declarations and custody history
 * (`shipments`, `shipment_events`, `cn_declarations`,
 * `contraband_rejection_log`, `customer_flags`) had no test of any kind
 * — no SQL assertions, no unit tests — while the domain was being
 * brought into the pilot by product decision D2. These are the unit
 * half; `supabase/tests/logistics_customs_security_test.sql` is the
 * database half.
 *
 * ── THE PART THAT MATTERS MOST ──
 *
 * The CN22 flag rule now exists TWICE on purpose: in
 * `cn_declaration_flag_reason()` so the stored record is right whatever
 * a caller sends, and in the client so the form can warn before
 * submitting. Two copies of a compliance rule drift, so the constants
 * are asserted here against the literals the migration uses, and
 * section G of the SQL suite asserts the same numbers from the other
 * side. Changing one without the other fails a test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const update = vi.fn();
const insert = vi.fn();
const single = vi.fn();
const eq = vi.fn();

vi.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    insert: (...args: unknown[]) => { insert(...args); return chain; },
    update: (...args: unknown[]) => { update(...args); return chain; },
    select: () => chain,
    single: () => single(),
    eq: (...args: unknown[]) => { eq(...args); return chain; },
    order: () => chain,
    limit: () => chain,
  });
  return { supabase: { from: vi.fn(() => chain), rpc: vi.fn() } };
});

//  The declaration service records an audit event after every write.
//  Stubbed so a test failure points at the service and not at auditing.
const recordAuditEvent = vi.fn(async (_params: { metadata?: Record<string, unknown> }) => {});
vi.mock('../lib/auditService', () => ({
  recordAuditEvent: (params: { metadata?: Record<string, unknown> }) => recordAuditEvent(params),
}));

import {
  CN22_VALUE_THRESHOLD_GBP, resolveDeclarationFlag,
} from '../lib/customsDeclarationService';
import { ALL_EVENT_TYPES } from '../lib/shipmentEventService';
import { REJECTION_REASONS } from '../lib/contrabandService';

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261203000000_customs_flag_server_side.sql'),
  'utf8',
);

beforeEach(() => {
  update.mockClear(); insert.mockClear(); single.mockClear(); eq.mockClear();
  recordAuditEvent.mockClear();
  single.mockResolvedValue({ data: { id: 'd-1' }, error: null });
});

describe('the CN22 rule has one set of constants, in two places', () => {
  it('uses GBP 270 as the threshold in TypeScript', () => {
    expect(CN22_VALUE_THRESHOLD_GBP).toBe(270);
  });

  //  Read out of the migration rather than restated, so this cannot
  //  pass by being updated to agree with a changed SQL copy.
  it('uses the same threshold in the SQL function', () => {
    expect(MIGRATION).toContain(`> ${CN22_VALUE_THRESHOLD_GBP}`);
    expect(MIGRATION).toContain(`CN22 threshold of £${CN22_VALUE_THRESHOLD_GBP}`);
  });

  it('lists the same eleven vague descriptions in the SQL function', () => {
    const vague = [
      'items', 'goods', 'stuff', 'personal', 'misc', 'miscellaneous', 'various',
      'personal effects', 'personal belongings', 'clothing', 'gift',
    ];
    //  Read the function body out of the migration and compare the set
    //  of quoted literals it contains, rather than slicing on fragile
    //  landmarks: the eleven descriptions plus the one declaration type
    //  the rule names, and nothing else.
    const body = MIGRATION.slice(
      MIGRATION.indexOf('AS $$', MIGRATION.indexOf('FUNCTION public.cn_declaration_flag_reason')),
      MIGRATION.indexOf('REVOKE ALL ON FUNCTION public.cn_declaration_flag_reason'),
    );
    for (const v of vague) {
      expect(body, `SQL copy is missing the vague description "${v}"`).toContain(`'${v}'`);
    }
    //  And nothing extra. Read just the IN-list — from `IN (` to the
    //  first `)` after it, which closes it because the list contains no
    //  parentheses of its own — so the rule's message strings do not
    //  get counted as values.
    const inStart = body.indexOf('IN (');
    expect(inStart, 'no IN-list found in the SQL rule').toBeGreaterThan(-1);
    const inList = body.slice(inStart, body.indexOf(')', inStart + 4));
    const values = (inList.match(/'[^']*'/g) ?? []).map((l) => l.slice(1, -1));
    expect(new Set(values)).toEqual(new Set(vague));
  });
});

describe('the flag is enforced in the database, not only offered by the form', () => {
  it('computes the flag in a BEFORE INSERT OR UPDATE trigger', () => {
    expect(MIGRATION).toContain('BEFORE INSERT OR UPDATE ON public.cn_declarations');
    expect(MIGRATION).toContain('EXECUTE FUNCTION public.fn_cn_declaration_flag()');
  });

  //  The specific defect: the browser used to decide this and the row
  //  was stored as sent. If the trigger ever stops overwriting the
  //  caller's values on insert, this fails.
  it('discards whatever the caller sent in is_flagged on insert', () => {
    const fn = MIGRATION.slice(MIGRATION.indexOf('fn_cn_declaration_flag()'));
    const insertBranch = fn.slice(fn.indexOf("IF TG_OP = 'INSERT'"), fn.indexOf('--  UPDATE.'));
    expect(insertBranch).toContain('NEW.is_flagged  := (v_reason IS NOT NULL)');
    expect(insertBranch).toContain('NEW.flag_reason := v_reason');
  });

  it('keeps the reason when a flag is resolved', () => {
    expect(MIGRATION).toContain('NEW.flag_reason      := OLD.flag_reason');
  });

  it('refuses to resolve a declaration that was never flagged', () => {
    expect(MIGRATION).toContain('CN_FLAG_NOT_RAISED');
  });
});

describe('resolveDeclarationFlag', () => {
  it('sends a resolver and a timestamp rather than is_flagged: false', async () => {
    await resolveDeclarationFlag('co-1', 'user-7', 'decl-1', 'CN23 filed separately');

    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.flag_resolved_by).toBe('user-7');
    expect(typeof payload.flag_resolved_at).toBe('string');
    expect(payload.flag_resolution_note).toBe('CN23 filed separately');
    //  The two fields the old implementation sent. Sending them now
    //  would be ignored by the trigger at best and misleading at worst.
    expect(payload).not.toHaveProperty('is_flagged');
    expect(payload).not.toHaveProperty('flag_reason');
  });

  it('scopes the update to the company as well as the row', async () => {
    await resolveDeclarationFlag('co-1', 'user-7', 'decl-1');
    const columns = eq.mock.calls.map((c) => c[0]);
    expect(columns).toContain('id');
    expect(columns).toContain('company_id');
  });

  it('records the resolution as the decision, not its consequence', async () => {
    await resolveDeclarationFlag('co-1', 'user-7', 'decl-1', 'reviewed by customs lead');
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    const ev = recordAuditEvent.mock.calls[0]![0];
    expect(ev.metadata?.flag_resolved).toBe(true);
    expect(ev.metadata?.note).toBe('reviewed by customs lead');
  });

  it('passes a null note through rather than the string "undefined"', async () => {
    await resolveDeclarationFlag('co-1', 'user-7', 'decl-1');
    const payload = update.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.flag_resolution_note).toBeNull();
  });
});

describe('shipment event types', () => {
  it('declares sixteen', () => {
    expect(ALL_EVENT_TYPES).toHaveLength(16);
    expect(new Set(ALL_EVENT_TYPES).size).toBe(16);
  });

  //  The column had no CHECK at all, so these sixteen were enforced
  //  only here — meaning a direct API call could write any string into
  //  a custody history. Each one must now appear in the constraint.
  it('constrains every one of them in the database', () => {
    const check = MIGRATION.slice(
      MIGRATION.indexOf('shipment_events_event_type_check'),
      MIGRATION.indexOf('$evt$;'),
    );
    for (const t of ALL_EVENT_TYPES) {
      expect(check, `event type "${t}" is not in the CHECK constraint`).toContain(`'${t}'`);
    }
  });

  it('adds the constraint NOT VALID and validates it separately', () => {
    //  A pre-existing row outside the sixteen must not abort the
    //  migration: on a custody record the right response is to surface
    //  the row, not to lose the deployment.
    expect(MIGRATION).toContain('NOT VALID');
    expect(MIGRATION).toContain('VALIDATE CONSTRAINT shipment_events_event_type_check');
    expect(MIGRATION).toContain('RAISE NOTICE');
  });
});

describe('contraband rejection reasons', () => {
  it('offers a non-empty, unique reason list', () => {
    expect(REJECTION_REASONS.length).toBeGreaterThan(0);
    expect(new Set(REJECTION_REASONS).size).toBe(REJECTION_REASONS.length);
  });

  //  The column has no CHECK constraint, unlike `status` and
  //  `flag_type` on the same pair of tables, so these eleven are
  //  enforced only here. Recorded as a gap rather than constrained in
  //  this phase: the live column holds free text and a CHECK would need
  //  a preflight against it first, the same as the missing company_id
  //  foreign key.
  it('is not yet constrained in the database', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260609100000_contraband_rejection_workflow.sql'),
      'utf8',
    );
    const table = migration.slice(
      migration.indexOf('CREATE TABLE IF NOT EXISTS public.contraband_rejection_log'),
      migration.indexOf('CREATE INDEX IF NOT EXISTS idx_crl_company'),
    );
    //  status IS constrained; rejection_reason is not. If somebody adds
    //  that constraint, this test should be replaced with a parity
    //  assertion like the shipment-event one above.
    expect(table).toContain("CHECK (status IN ('pending', 'rejected', 'escalated'))");
    expect(table).not.toMatch(/rejection_reason[^,]*CHECK/);
  });
});

describe('the migration does not quietly widen anything', () => {
  it('revokes the rule function from PUBLIC before granting it', () => {
    const revokeAt = MIGRATION.indexOf('REVOKE ALL ON FUNCTION public.cn_declaration_flag_reason');
    const grantAt = MIGRATION.indexOf('GRANT EXECUTE ON FUNCTION public.cn_declaration_flag_reason');
    expect(revokeAt).toBeGreaterThan(-1);
    expect(grantAt).toBeGreaterThan(revokeAt);
  });

  it('pins a search_path on both functions it defines', () => {
    const occurrences = MIGRATION.match(/SET search_path = public, pg_temp/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  //  The trigger function is intentionally NOT security definer: it
  //  only rewrites columns of the row being written, and RLS has
  //  already decided whether that row may be written at all.
  it('does not make the trigger function SECURITY DEFINER', () => {
    const fn = MIGRATION.slice(
      MIGRATION.indexOf('FUNCTION public.fn_cn_declaration_flag()'),
      MIGRATION.indexOf('DROP TRIGGER IF EXISTS trg_cn_declaration_flag'),
    );
    expect(fn).not.toContain('SECURITY DEFINER');
  });

  it('touches no RLS policy', () => {
    expect(MIGRATION).not.toContain('CREATE POLICY');
    expect(MIGRATION).not.toContain('DROP POLICY');
    expect(MIGRATION).not.toContain('DISABLE ROW LEVEL SECURITY');
  });
});

/*
 *  The read-only preflight in scripts/preflight/rejection-reason-vocabulary.sql
 *  has to hardcode the accepted values, because psql cannot import a
 *  TypeScript constant. That makes it the one place in the repository
 *  that can silently go stale: add a twelfth reason to the code and
 *  the preflight would keep reporting rows against the old eleven and
 *  call them unrecognised.
 *
 *  The script says so in a comment. This asserts it instead.
 */
describe('the rejection_reason preflight stays in step with the code', () => {
  const PREFLIGHT = readFileSync(
    join(process.cwd(), 'scripts/preflight/rejection-reason-vocabulary.sql'),
    'utf8',
  );

  //  The VALUES list is the authoritative half of the script; the
  //  header comment is prose and is not what the query uses.
  const accepted = (() => {
    const block = PREFLIGHT.slice(
      PREFLIGHT.indexOf('WITH accepted(value) AS ('),
      PREFLIGHT.indexOf(')\nSELECT r.rejection_reason'),
    );
    return [...block.matchAll(/\('([^']+)'\)/g)].map((m) => m[1]);
  })();

  it('finds the VALUES list in the script', () => {
    expect(accepted.length).toBeGreaterThan(0);
  });

  it('lists exactly the reasons the application offers', () => {
    expect([...accepted].sort()).toEqual([...REJECTION_REASONS].sort());
  });

  it('is still read-only', () => {
    //  A preflight that writes is not a preflight. The whole point is
    //  that it can be run against a live database.
    for (const forbidden of [
      /\bINSERT\s+INTO\b/i, /\bUPDATE\s+\w+\s+SET\b/i, /\bDELETE\s+FROM\b/i,
      /\bALTER\s+TABLE\b/i, /\bDROP\s+/i, /\bCREATE\s+(TABLE|INDEX|TRIGGER|POLICY)\b/i,
    ]) {
      //  \echo lines quote the proposed DDL deliberately, so only the
      //  executable half of the file is checked.
      const executable = PREFLIGHT
        .split('\n')
        .filter((l) => !l.trimStart().startsWith('\\echo') && !l.trimStart().startsWith('--'))
        .join('\n');
      expect(executable).not.toMatch(forbidden);
    }
  });
});
