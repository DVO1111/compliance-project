/**
 * Which lifecycle action moves a batch record from one state to the next.
 *
 * Since Week 4 item 07 the batch's state lives in the lifecycle engine and
 * `batch_records.status` is a mirror the database refuses to let the client
 * write, so "move this batch to released" has to become the engine action
 * `release` before it can be sent anywhere.
 *
 * Keyed on (from, to) rather than on the target alone, because two
 * different actions can reach the same state: a batch leaves `hold` by
 * `resume_execution` or by `resume_qc` depending on where it is going, and
 * that distinction belongs to the engine rather than to a guess made here.
 *
 * In its own module, away from batchReleaseService, for one reason: that
 * file imports the Supabase client at module load, and this table is worth
 * testing against the migration without standing up a client to do it.
 * See src/tests/batchStatusTransitions.test.ts, which reads
 * 20261011000000_batch_record_and_stages.sql and fails if the two drift.
 */
export const BATCH_TRANSITIONS: Record<string, string> = {
  'in_progress->execution_complete': 'close_execution',
  'in_progress->hold':               'hold',
  'execution_complete->qc_pending':  'submit_for_qc',
  'qc_pending->qc_in_progress':      'start_qc',
  'qc_pending->hold':                'hold',
  'qc_in_progress->released':        'release',
  'qc_in_progress->rejected':        'reject',
  'qc_in_progress->hold':            'hold',
  'hold->in_progress':               'resume_execution',
  'hold->qc_in_progress':            'resume_qc',
  'hold->rejected':                  'reject',
  'released->archived':              'archive',
  'rejected->archived':              'archive',
};
