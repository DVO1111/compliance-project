/**
 * My tasks — derived, because there is no task register.
 *
 * ── WHAT THIS IS BUILT ON, AND WHY IT IS A DERIVATION ──
 *
 * Both dashboards draw a routed task list, and nothing in the schema
 * holds a work item assigned to a person. The only `assigned_to` column
 * belongs to `ai_incidents`, a different product area.
 *
 * So a task is defined as: a record sitting in a state that only this
 * role can move it out of. That is what the design's own example rows
 * are — "Material disposition · lot MAT-0042", "Batch release ·
 * BX-0001" — and it has the property a real register would not give
 * for free: it cannot go stale, because the record moving IS the task
 * being done.
 *
 * It has no due date and no urgency ordering, because nothing records
 * them. The design shows "Today" and "Overdue 2 days"; this shows a
 * dash rather than inventing an age. See docs/figma-conflicts.md entry
 * 8.
 *
 * ── WHY THE SOURCES ARE DATA AND NOT CODE ──
 *
 * The previous derivation, inside roleDashboardService, had three
 * sources and TWO OF THEM COULD NEVER RETURN A ROW:
 *
 *   batch_records WHERE status = 'pending_qa'
 *       — no such state. The batch lifecycle is in_progress,
 *         execution_complete, qc_pending, qc_in_progress, hold,
 *         released, rejected, archived.
 *
 *   deviations WHERE status <> 'closed'
 *       — `deviations` has no status column at all. The query errored
 *         on every call and the error was swallowed by a logger.debug.
 *
 * Both failed the same way the dead supplier guard did: installed,
 * plausible, and silently producing nothing. A QA Manager's task list
 * showed material dispositions and never a batch release, and nothing
 * anywhere said so.
 *
 * As data, each source NAMES the state it waits on in one place, which
 * is what lets a test check those names against the states the
 * migrations actually declare. src/tests/taskSources.test.ts does
 * exactly that, by reading the migration SQL.
 */

import { supabase } from '../supabase';
import { logger } from '../logger';
import { canAct, type PmSection } from '../access/roleAccess';
import type { WorkRole } from '../access/permissionRequests';

/** How a source recognises a record that is waiting. */
export type Awaiting =
  | { column: string; equals: string }
  | { column: string; isNull: true };

export interface TaskSource {
  key: string;
  /** The PM-03 column a viewer must hold `Act` on for this to be theirs. */
  section: PmSection;
  table: string;
  awaiting: Awaiting;
  /** The column holding the record's human reference. */
  labelColumn: string;
  /** "Material disposition", "Batch release". */
  kind: string;
  /** What the holder is being asked to do. */
  detail: string;
  /** Where the task opens. */
  page: string;
}

/**
 * THE STATE KEYS HERE ARE CHECKED AGAINST THE MIGRATIONS BY A TEST.
 * A source naming a state that does not exist is a task list that is
 * quietly short, which is worse than one that is obviously broken.
 */
export const TASK_SOURCES: TaskSource[] = [
  {
    key: 'material_disposition',
    section: 'qa_disposition',
    table: 'material_lots',
    awaiting: { column: 'status', equals: 'quarantine' },
    labelColumn: 'lot_number',
    kind: 'Material disposition',
    detail: 'Received and waiting for a QA decision',
    page: 'qa-disposition',
  },
  {
    key: 'material_testing',
    section: 'qc_testing',
    table: 'material_lots',
    awaiting: { column: 'status', equals: 'under_test' },
    labelColumn: 'lot_number',
    kind: 'QC testing',
    detail: 'Sampled and waiting for results',
    page: 'qc-testing',
  },
  {
    key: 'batch_release',
    section: 'batch_release',
    table: 'batch_records',
    //  qc_in_progress, NOT 'pending_qa'. That is the state a batch sits
    //  in while the release decision is open, and the only state the
    //  engine permits `release` from.
    awaiting: { column: 'status', equals: 'qc_in_progress' },
    labelColumn: 'batch_number',
    kind: 'Batch release',
    detail: 'In QC and waiting for a release decision',
    page: 'batch-release',
  },
  {
    key: 'batch_execution',
    section: 'batch_records',
    table: 'batch_records',
    awaiting: { column: 'status', equals: 'in_progress' },
    labelColumn: 'batch_number',
    kind: 'Batch execution',
    detail: 'Open on the floor',
    page: 'batch-execution',
  },
  {
    key: 'deviation_close',
    section: 'deviation_capa',
    table: 'deviations',
    //  `deviations` has no status column — its state lives in the
    //  lifecycle engine and `closed_at` is the mirror this table does
    //  carry.
    awaiting: { column: 'closed_at', isNull: true },
    labelColumn: 'deviation_number',
    kind: 'Deviation',
    detail: 'Open investigation',
    page: 'deviations',
  },
  {
    key: 'supplier_approve',
    section: 'suppliers',
    table: 'suppliers',
    awaiting: { column: 'qualification_status', equals: 'pending' },
    labelColumn: 'name',
    kind: 'Supplier approval',
    detail: 'Awaiting qualification',
    page: 'supplier-qualification',
  },
];

export interface Task {
  id: string;
  kind: string;
  reference: string;
  detail: string;
  page: string;
  /** Nothing records a due date, so this is a dash rather than a guess. */
  due: string;
}

export interface TaskListResult {
  tasks: Task[];
  /**
   * The sources that could not be read.
   *
   * SURFACED RATHER THAN SWALLOWED. A task list that silently drops a
   * source it could not read looks like a task list with nothing in
   * it, and somebody acts on that by going home. The screen names what
   * it could not see.
   */
  unreadable: string[];
}

/** Which sources belong to a role, by PM-03's grid. */
export function sourcesForRole(role: WorkRole | null | undefined): TaskSource[] {
  if (!role) return [];
  return TASK_SOURCES.filter((s) => canAct(role, s.section));
}

const PER_SOURCE = 25;

export async function listTasks(
  companyId: string,
  role: WorkRole | null | undefined,
): Promise<TaskListResult> {
  return listTasksFrom(companyId, sourcesForRole(role));
}

/**
 * The same read, for a caller that selects its sources some other way.
 *
 * The dashboards already held a `canAct(section)` predicate rather than
 * a role, and threading a role through three call sites to reach the
 * same answer would be churn. One implementation either way — the
 * point of this module is that there is only one list of sources.
 */
export function listTasksBy(
  companyId: string,
  allow: (section: PmSection) => boolean,
): Promise<TaskListResult> {
  return listTasksFrom(companyId, TASK_SOURCES.filter((s) => allow(s.section)));
}

async function listTasksFrom(
  companyId: string,
  sources: TaskSource[],
): Promise<TaskListResult> {
  if (sources.length === 0) return { tasks: [], unreadable: [] };

  const results = await Promise.all(sources.map(async (s) => {
    try {
      let q = (supabase.from as unknown as (t: string) => {
        select(cols: string): {
          eq(c: string, v: unknown): typeof q;
          is(c: string, v: unknown): typeof q;
          limit(n: number): Promise<{ data?: Record<string, unknown>[] | null; error?: unknown }>;
        };
      })(s.table).select(`id, ${s.labelColumn}`) as unknown as {
        eq(c: string, v: unknown): typeof q;
        is(c: string, v: unknown): typeof q;
        limit(n: number): Promise<{ data?: Record<string, unknown>[] | null; error?: unknown }>;
      };

      q = q.eq('company_id', companyId);
      q = 'isNull' in s.awaiting ? q.is(s.awaiting.column, null)
                                 : q.eq(s.awaiting.column, s.awaiting.equals);

      const res = await q.limit(PER_SOURCE);
      if (res.error) {
        logger.error('[tasks] source failed', { source: s.key, error: res.error });
        return { source: s, tasks: null as Task[] | null };
      }
      return {
        source: s,
        tasks: ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
          id: `${s.key}-${String(r.id)}`,
          kind: s.kind,
          reference: String(r[s.labelColumn] ?? r.id),
          detail: s.detail,
          page: s.page,
          due: '—',
        })),
      };
    } catch (e) {
      logger.error('[tasks] source threw', { source: s.key, error: String(e) });
      return { source: s, tasks: null as Task[] | null };
    }
  }));

  const tasks: Task[] = [];
  const unreadable: string[] = [];
  for (const r of results) {
    if (r.tasks === null) unreadable.push(r.source.kind);
    else tasks.push(...r.tasks);
  }

  //  Grouped by kind, then by reference. NOT by urgency, because
  //  nothing records one — ordering by an invented priority would be a
  //  claim the data does not support.
  tasks.sort((a, b) => a.kind.localeCompare(b.kind) || a.reference.localeCompare(b.reference));
  return { tasks, unreadable };
}
