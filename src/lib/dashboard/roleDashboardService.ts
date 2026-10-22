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

async function countOf(
  table: string,
  build: (q: any) => any,
): Promise<Count> {
  try {
    //  The table name is a runtime value here — this helper exists to
    //  run the same shape of count against a dozen of them — so the
    //  generated per-table union cannot apply and the builder is
    //  reached through one cast, confined to this line.
    const from = (supabase.from as unknown as (t: string) => any)(table);
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
