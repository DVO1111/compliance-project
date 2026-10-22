/**
 * The counts behind DB-01 and DB-02, read from the database.
 *
 * THE NUMBERS IN THE FIGMA FILE ARE NOT DATA. 24 tasks, 12 quarantined
 * lots, 8 tests in progress — those are a designer showing what a busy
 * Thursday looks like. Putting them in the application would produce a
 * dashboard that reports a fictional plant to a real inspector, and it
 * is the single thing this project has already been burned by. So every
 * tile and every stage count here is a query, and a workspace with no
 * records shows zeroes and empty lists.
 *
 * EVERY COUNT FAILS TO null, NOT TO 0. A table that is absent, a policy
 * that refuses, a dropped connection — all of them return null, and the
 * tile renders a dot. Zero is a statement that there is nothing to do;
 * null is an admission that we do not know. On a dashboard whose whole
 * job is to tell somebody what needs their attention, those must not
 * look the same.
 *
 * Counts use head:true with an exact count, so nothing comes back but
 * the number — these run seven at a time on first paint.
 */

import { supabase } from '../supabase';
import { logger } from '../logger';

/** null means "could not be read", which is not the same as zero. */
export type Count = number | null;

/**
 * The slice of the query builder a count actually uses.
 *
 * Declared rather than reached for with `any`, so a filter nobody
 * anticipated — a .or(), a .gte() — is a compile error here instead of
 * a silently unfiltered count in production. Adding one is a one-line
 * change made on purpose.
 */
interface CountQuery extends PromiseLike<{
  count: number | null;
  error: { message: string } | null;
}> {
  eq(column: string, value: unknown): CountQuery;
  neq(column: string, value: unknown): CountQuery;
  is(column: string, value: unknown): CountQuery;
  in(column: string, values: readonly unknown[]): CountQuery;
  lt(column: string, value: unknown): CountQuery;
}

async function countOf(
  table: string,
  build: (q: CountQuery) => CountQuery,
): Promise<Count> {
  try {
    //  The table name is a runtime value here — this helper exists to
    //  run the same shape of count against a dozen of them — so the
    //  generated per-table union cannot apply and the builder is
    //  reached through one cast, confined to this line.
    const from = (supabase.from as unknown as (t: string) => {
      select(cols: string, opts: { count: 'exact'; head: true }): CountQuery;
    })(table);
    const { count, error } = await build(
      from.select('*', { count: 'exact', head: true }),
    );
    if (error) {
      //  Debug rather than error: a missing table is expected on a
      //  workspace whose migrations have not reached it, and shouting
      //  about it on every dashboard paint buries the real failures.
      logger.debug?.('[dashboard] count unavailable', { table, error: error.message });
      return null;
    }
    return count ?? null;
  } catch (e) {
    logger.debug?.('[dashboard] count threw', { table, error: String(e) });
    return null;
  }
}

export interface QaManagerCounts {
  quarantine: Count;
  qcPending: Count;
  qaReview: Count;
  production: Count;
  deviations: Count;
  capaOverdue: Count;
  /** Stage 01: suppliers awaiting qualification. */
  procurement: Count;
  /** Stage 08: released batches not yet shipped. */
  distribution: Count;
}

export async function qaManagerCounts(companyId: string): Promise<QaManagerCounts> {
  const [
    quarantine, qcPending, qaReview, production, deviations, capaOverdue,
    procurement, distribution,
  ] = await Promise.all([
    countOf('material_lots', (q) => q.eq('company_id', companyId).eq('status', 'quarantine')),
    countOf('material_lot_sampling', (q) => q.eq('company_id', companyId).is('completed_at', null)),
    countOf('batch_records', (q) => q.eq('company_id', companyId).eq('status', 'pending_qa')),
    countOf('batch_records', (q) => q.eq('company_id', companyId).eq('status', 'in_progress')),
    countOf('deviations', (q) => q.eq('company_id', companyId).neq('status', 'closed')),
    countOf('capa_records', (q) => q.eq('company_id', companyId).lt('due_date', new Date().toISOString())),
    countOf('suppliers', (q) => q.eq('company_id', companyId).neq('status', 'approved')),
    countOf('batch_records', (q) => q.eq('company_id', companyId).eq('status', 'released')),
  ]);
  return { quarantine, qcPending, qaReview, production, deviations, capaOverdue, procurement, distribution };
}

export interface StorekeeperCounts {
  quarantine: Count;
  /** QA approved and waiting to be put away. */
  putAway: Count;
  /** Approved lots available to issue. */
  readyToIssue: Count;
  /** Held or rejected, awaiting controlled disposal. */
  heldRejected: Count;
  /** Released batches ready to dispatch. */
  dispatch: Count;
  /** Stage 05 for a storekeeper: issue requests from production. */
  issueRequests: Count;
}

export async function storekeeperCounts(companyId: string): Promise<StorekeeperCounts> {
  const [quarantine, putAway, readyToIssue, heldRejected, dispatch, issueRequests] =
    await Promise.all([
      countOf('material_lots', (q) => q.eq('company_id', companyId).eq('status', 'quarantine')),
      countOf('material_lots', (q) => q.eq('company_id', companyId).eq('status', 'approved').is('put_away_at', null)),
      countOf('material_lots', (q) => q.eq('company_id', companyId).eq('status', 'approved')),
      countOf('material_lots', (q) => q.eq('company_id', companyId).in('status', ['rejected', 'on_hold'])),
      countOf('batch_records', (q) => q.eq('company_id', companyId).eq('status', 'released')),
      countOf('dispensing_records', (q) => q.eq('company_id', companyId).is('verified_at', null)),
    ]);
  return { quarantine, putAway, readyToIssue, heldRejected, dispatch, issueRequests };
}

/**
 * How many access requests this person has waiting.
 *
 * Drives DB-02's "Request pending" chip, so a Storekeeper who has
 * already asked is not invited to ask again. Read from the same table
 * the admin's inbox reads, which is what makes the two screens agree.
 */
export async function myPendingSections(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('access_permission_requests')
      .select('section_key')
      .eq('requested_by', userId)
      .eq('status', 'pending');
    if (error) return [];
    return (data ?? []).map((r: { section_key: string }) => r.section_key);
  } catch {
    return [];
  }
}

/* ── Alerts, which DO have tables ──────────────────────────────────── */

/**
 * Unacknowledged alerts across the three registers that raise them.
 *
 * DB-01 tiles this as "ALERTS · 18 · unread". There is no single alert
 * feed in this schema, but there are three real registers —
 * material_lot_alerts, instrument_calibration_alerts and
 * licence_renewal_alerts — each with an acknowledged_at. The tile is
 * their sum rather than a placeholder.
 *
 * A register that cannot be read contributes null, and null poisons
 * the sum: a partial count presented as a total is worse than no
 * count, because somebody clears 4 of 9 alerts and believes they are
 * done.
 */
export async function unreadAlerts(companyId: string): Promise<Count> {
  const parts = await Promise.all([
    countOf('material_lot_alerts', (q) =>
      q.eq('company_id', companyId).is('acknowledged_at', null)),
    countOf('instrument_calibration_alerts', (q) =>
      q.eq('company_id', companyId).is('acknowledged_at', null)),
    countOf('licence_renewal_alerts', (q) =>
      q.eq('company_id', companyId).is('acknowledged_at', null)),
  ]);
  if (parts.some((p) => p === null)) return null;
  return parts.reduce((a: number, b) => a + (b ?? 0), 0);
}

/* ── Tasks, which do NOT ───────────────────────────────────────────── */

/**
 * What is waiting for this role, derived from the records themselves.
 *
 * THERE IS NO TASK TABLE. Nothing in this schema holds a work item
 * assigned to a person — the only assigned_to column belongs to
 * ai_incidents, which is a different product area. DB-01 and DB-02
 * both draw a routed task list, so the choice was a permanent
 * placeholder or a derivation.
 *
 * This derives it: a record sitting in a state that only this role can
 * move IS a task for this role, and that is exactly what the design's
 * examples are — "Material disposition · Sucrose lot ML-2610-031" is a
 * lot awaiting disposition, not a row somebody created in a task
 * table.
 *
 * WHAT THE DERIVATION CANNOT DO, and so does not pretend to: it has no
 * due date, because nothing records one, and no ordering by urgency.
 * The design shows "Today" and "Overdue 2 days" against its rows; this
 * returns a dash rather than inventing an age. When a task register
 * exists, this function is what it replaces.
 *
 * Filtered by what the role may ACT on, so a QC Analyst is not handed
 * dispositions to look at and feel responsible for.
 */
export interface DerivedTask {
  id: string;
  title: string;
  detail: string;
  state: 'pending' | 'on_hold' | 'overdue' | 'released' | 'rejected';
  due: string;
  page: string;
}

export async function derivedTasks(
  companyId: string,
  canAct: (section: string) => boolean,
): Promise<DerivedTask[]> {
  const out: DerivedTask[] = [];

  const pull = async (
    table: string,
    build: (q: CountQuery) => CountQuery,
    toTask: (row: Record<string, unknown>) => DerivedTask,
  ) => {
    try {
      const from = (supabase.from as unknown as (t: string) => {
        select(cols: string): CountQuery;
      })(table);
      const res = await build(from.select('*') as unknown as CountQuery) as unknown as {
        data?: Record<string, unknown>[] | null; error?: { message: string } | null;
      };
      if (res.error || !res.data) return;
      for (const row of res.data.slice(0, 5)) out.push(toTask(row));
    } catch (e) {
      logger.debug?.('[dashboard] task source unavailable', { table, error: String(e) });
    }
  };

  if (canAct('qa_disposition')) {
    await pull('material_lots',
      (q) => q.eq('company_id', companyId).eq('status', 'quarantine'),
      (r) => ({
        id: `lot-${String(r.id)}`,
        title: `Material disposition · lot ${String(r.lot_number ?? '')}`.trim(),
        detail: 'Waiting for a QA decision',
        state: 'pending',
        due: '—',
        page: 'materials',
      }));
  }

  if (canAct('batch_release')) {
    await pull('batch_records',
      (q) => q.eq('company_id', companyId).eq('status', 'pending_qa'),
      (r) => ({
        id: `batch-${String(r.id)}`,
        title: `Batch release · ${String(r.batch_number ?? '')}`.trim(),
        detail: 'Awaiting QA review',
        state: 'pending',
        due: '—',
        page: 'batch-release',
      }));
  }

  if (canAct('deviation_capa')) {
    await pull('deviations',
      (q) => q.eq('company_id', companyId).neq('status', 'closed'),
      (r) => ({
        id: `dev-${String(r.id)}`,
        title: `Deviation · ${String(r.reference ?? r.title ?? '')}`.trim(),
        detail: 'Open investigation',
        state: 'on_hold',
        due: '—',
        page: 'deviations',
      }));
  }

  return out;
}
