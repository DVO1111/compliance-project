/**
 * Work left behind when a role is withdrawn.
 *
 * `20261124000000` built the report and an auditable reassignment path
 * and nothing in the product called either. So revoking a role could
 * leave a material lot or a batch record waiting on somebody who may
 * no longer act, with the only route to resolution being SQL — which
 * for quality-critical work is not a route at all.
 *
 * ── WHAT THE DATABASE DECIDES, NOT THIS FILE ──
 *
 * Whether a record is stranded: `operational_role_stranded_work`
 * compares the last actor's remaining roles against the section that
 * governs the entity type. Who may reassign, and to whom: a BEFORE
 * trigger on `stranded_work_reassignments`, which requires the actor
 * to administer roles OR to hold Act in the section, and requires the
 * *target* to hold Act in the section — because reassigning to
 * somebody who also cannot finish it closes the report entry without
 * resolving anything, which is worse than leaving it open.
 *
 * This service calls both and translates the refusals. It reimplements
 * neither.
 *
 * ── THE ORIGINAL ATTRIBUTION IS NEVER OVERWRITTEN ──
 *
 * A reassignment is a new row, not an edit. `last_actor` still names
 * whoever did the work, and the report carries `reassigned_to`
 * alongside it. That is deliberate: the history of who did what has to
 * survive the fact that they can no longer continue.
 */

import { supabase } from '../supabase';
import { logger } from '../logger';

export interface StrandedWorkRow {
  entity_type: string;
  entity_id: string;
  state_key: string | null;
  section: string;
  last_actor: string | null;
  last_acted_at: string | null;
  roles_lost: string[] | null;
  roles_remaining: string[] | null;
  reassigned_to: string | null;
  reassigned_at: string | null;
  still_stranded: boolean;
}

/**
 * The refusals this path actually raises. Each is actionable, and the
 * target-cannot-act one carries the database's own next step.
 */
export function describeStrandedError(raw: string): { code: string; message: string } {
  const text = String(raw ?? '');

  if (text.includes('STRANDED_WORK_TARGET_CANNOT_ACT')) {
    return {
      code: 'STRANDED_WORK_TARGET_CANNOT_ACT',
      message:
        'That person holds no role with Act on this section, so they could not carry the ' +
        'work on. Grant them the role first, then reassign — moving the work to somebody ' +
        'who also cannot finish it would close this entry without resolving it.',
    };
  }
  if (text.includes('STRANDED_WORK_FORBIDDEN')) {
    return {
      code: 'STRANDED_WORK_FORBIDDEN',
      message:
        'Reassigning this is for somebody who administers roles, or who may act in the ' +
        'section the work belongs to. The database enforces that, not this screen.',
    };
  }
  if (text.includes('STRANDED_WORK_NOT_STRANDED')) {
    return {
      code: 'STRANDED_WORK_NOT_STRANDED',
      message:
        'This record is not waiting on a withdrawn role any more — somebody may have ' +
        'already reassigned it, or the role was restored. Reload the list.',
    };
  }
  if (text.includes('STRANDED_WORK_UNKNOWN_ENTITY')) {
    return {
      code: 'STRANDED_WORK_UNKNOWN_ENTITY',
      message:
        'That kind of record has no governing section, so the database cannot tell who ' +
        'would be able to finish it. This needs a change to the section map, not a ' +
        'reassignment.',
    };
  }
  return {
    code: 'UNKNOWN',
    message: text || 'The work could not be reassigned.',
  };
}

export async function listStrandedWork(companyId: string): Promise<StrandedWorkRow[]> {
  const { data, error } = await supabase.rpc('operational_role_stranded_work', {
    p_company_id: companyId,
  });

  if (error) {
    logger.error('[stranded] could not list stranded work', { error: error.message });
    throw new Error(error.message);
  }
  return (data ?? []) as unknown as StrandedWorkRow[];
}

/**
 * Hand a stranded record to somebody who can finish it.
 *
 * The reason is mandatory here as well as in the database, so the
 * screen cannot offer a path that the database will reject at the last
 * moment for a field the form never asked for.
 */
export async function reassignStrandedWork(params: {
  companyId: string;
  entityType: string;
  entityId: string;
  toUser: string;
  reason: string;
}): Promise<string> {
  const reason = params.reason.trim();
  if (reason.length === 0) {
    throw new Error('A reason is required: it becomes part of the audit record.');
  }

  const { data, error } = await supabase.rpc('stranded_work_reassign', {
    p_company_id: params.companyId,
    p_entity_type: params.entityType,
    p_entity_id: params.entityId,
    p_to_user: params.toUser,
    p_reason: reason,
  });

  if (error) {
    const described = describeStrandedError(error.message);
    logger.error('[stranded] reassignment refused', {
      entityType: params.entityType,
      code: described.code,
    });
    throw new Error(described.message);
  }
  return data as unknown as string;
}
