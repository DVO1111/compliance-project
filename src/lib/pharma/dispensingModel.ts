import { logger } from '../logger';

/**
 * Dispensing: the shapes, the gate, and the judgements a screen makes.
 *
 * Everything item 09 needs that does NOT bind the Supabase client lives
 * here, so it can be tested without a project, a network or a .env — the
 * gate included, which takes its client as an argument for exactly that
 * reason. dispensingService wires it up and holds the rest.
 *
 * NOTHING HERE IS A CONTROL. Every rule below restates one the database
 * enforces in 20261013000000_dispensing_and_genealogy.sql, so a screen
 * can tell an operator BEFORE they start weighing rather than after. The
 * brief says the quantity must flag "in real time", and that is what
 * these functions are for — not for deciding whether the dispensing is
 * allowed, which is settled in SQL.
 */

export interface DispensingRecord {
  id: string;
  company_id: string;
  batch_id: string;
  batch_stage_id: string | null;
  formula_material_id: string | null;
  material_id: string;
  material_lot_id: string;
  internal_lot_number: string;
  required_quantity: number;
  actual_quantity: number;
  unit: string;
  balance_identifier: string;
  /** WEEK 4 ITEM 10: the registered instrument, once that registry exists. */
  instrument_id: string | null;
  dispensed_by: string;
  dispensed_at: string;
  dispense_signature_id: string | null;
  verified_by: string | null;
  verified_at: string | null;
  verify_signature_id: string | null;
  /** Derived by the database from the formula, never asserted by a client. */
  tolerance_exception: boolean;
  authorised_by: string | null;
  authorisation_reason: string | null;
  authorisation_signature_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** One edge of the genealogy graph: this lot went into this batch. */
export interface GenealogyEdge {
  id: string;
  company_id: string;
  batch_id: string;
  material_lot_id: string;
  material_id: string;
  total_quantity: number;
  unit: string;
  dispensing_count: number;
  first_dispensed_at: string;
  last_dispensed_at: string;
}

/** A formula line, as a dispensing screen needs it. */
export interface FormulaLine {
  id: string;
  material_id: string;
  role: string;
  quantity_per_batch: number;
  overage_pct: number;
  /** null means the formula declares no tolerance — see toleranceVerdict. */
  tolerance_pct: number | null;
  unit: string;
}

// ── the gate ─────────────────────────────────────────────────────────

/** The slice of a Supabase client the gate needs, so it can be tested
 *  without a project, a network or a .env. */
export interface DispenseGateClient {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface DispenseCheck {
  /** True ONLY when the server positively confirmed the dispensing may
   *  proceed. Never true by default, and never true on an error. */
  allowed: boolean;
  /** Why not, in a sentence fit to show a person. Null when allowed. */
  reason: string | null;
  /** Set when the CHECK failed, as opposed to the dispensing being
   *  legitimately blocked. */
  checkFailed: boolean;
}

const BLOCKED_BY_FAILURE = 'The dispensing checks could not be completed, so dispensing is blocked.';

/**
 * Asks the database whether this lot may go to this batch.
 *
 * supabase-js does not reject on a failed query — it RESOLVES with
 * `{ data: null, error }`. So the obvious implementation
 *
 *     const { data } = await client.rpc('dispensing_block_reason', …);
 *     return { allowed: data === null };            // WRONG
 *
 * reads a network failure, a permission error and a dropped connection as
 * permission to dispense a quarantined lot into an uncleaned line. Every
 * path that cannot prove the dispensing is allowed reports it as blocked.
 */
export async function checkDispensable(
  client: DispenseGateClient,
  batchId: string | null | undefined,
  materialLotId: string | null | undefined,
  quantity?: number | null,
): Promise<DispenseCheck> {
  if (!batchId || !materialLotId) {
    return {
      allowed: false,
      reason: 'A batch and a material lot are both needed before dispensing can be checked.',
      checkFailed: true,
    };
  }

  let data: unknown;
  let error: { message: string } | null;
  try {
    ({ data, error } = await client.rpc('dispensing_block_reason', {
      p_batch_id: batchId,
      p_material_lot_id: materialLotId,
      p_quantity: quantity ?? null,
    }));
  } catch (e: any) {
    logger.error('[dispensing] gate threw', e);
    return { allowed: false, reason: BLOCKED_BY_FAILURE, checkFailed: true };
  }

  if (error) {
    logger.error('[dispensing] gate failed', { batchId, materialLotId, error });
    return { allowed: false, reason: BLOCKED_BY_FAILURE, checkFailed: true };
  }

  if (data === null || data === undefined) {
    return { allowed: true, reason: null, checkFailed: false };
  }
  if (typeof data !== 'string') {
    logger.error('[dispensing] gate returned an unexpected shape', { batchId, data });
    return {
      allowed: false,
      reason: 'The dispensing check returned something unexpected, so dispensing is blocked.',
      checkFailed: true,
    };
  }
  return { allowed: false, reason: data, checkFailed: false };
}

// ── the judgements ───────────────────────────────────────────────────

/**
 * The quantity the formula actually asks for.
 *
 * OVERAGE IS PART OF THE TARGET, not a tolerance. A line with 10% overage
 * asks for 110% of the nominal quantity, deliberately, for a known
 * process loss. Conflating the two gives an operator a 10% licence to
 * miss, which is the opposite of what overage means. The database
 * computes the same thing in material_dispense(); this is so the screen
 * can show the target before anything is weighed.
 */
export function requiredQuantity(line: Pick<FormulaLine, 'quantity_per_batch' | 'overage_pct'>): number {
  return line.quantity_per_batch * (1 + (line.overage_pct ?? 0) / 100);
}

/**
 * How close is "equal" when comparing a weight.
 *
 * The database holds these as numeric(16,6) and compares them EXACTLY.
 * JavaScript holds them as doubles, where Math.abs(24.48 - 24) is
 * 0.4800000000000004 and 24 * 2 / 100 is 0.48 — so a quantity sitting
 * exactly on the tolerance limit reads as "within" in SQL and "outside"
 * here. That disagreement would show an operator a demand for a
 * supervisor signature that the database, a moment later, does not make.
 *
 * 1e-9 is three orders of magnitude below the 1e-6 precision the columns
 * actually store, so it cannot mask a real deviation; it only absorbs the
 * representation error. Found by a test asserting the boundary case.
 */
const QUANTITY_EPSILON = 1e-9;

export type ToleranceVerdict =
  /** Inside the declared tolerance. Nothing more is needed. */
  | { state: 'within'; required: number; deviation: number; limit: number }
  /** Outside it. A supervisor and a reason are required to save. */
  | { state: 'outside'; required: number; deviation: number; limit: number }
  /** The formula declares no tolerance, and the quantity is not exact. */
  | { state: 'undeclared'; required: number; deviation: number; limit: null }
  /** The formula declares no tolerance and the quantity matches exactly. */
  | { state: 'exact'; required: number; deviation: 0; limit: null };

/**
 * Whether a weighed quantity needs a supervisor, decided the way the
 * database decides it.
 *
 * The undeclared case FAILS CLOSED: a formula line with no tolerance_pct
 * means every inexact quantity needs authorisation. That is deliberate —
 * a plausible default here (±2%, say) would be a pharmacopoeial-looking
 * number this system made up. 'undeclared' is reported separately from
 * 'outside' so a screen can say "this formula line declares no tolerance"
 * rather than the misleading "outside tolerance".
 */
export function toleranceVerdict(
  line: Pick<FormulaLine, 'quantity_per_batch' | 'overage_pct' | 'tolerance_pct'>,
  actual: number,
): ToleranceVerdict {
  const required = requiredQuantity(line);
  const deviation = Math.abs(actual - required);

  if (line.tolerance_pct === null || line.tolerance_pct === undefined) {
    return deviation <= QUANTITY_EPSILON
      ? { state: 'exact', required, deviation: 0, limit: null }
      : { state: 'undeclared', required, deviation, limit: null };
  }

  const limit = required * line.tolerance_pct / 100;
  return deviation - limit > QUANTITY_EPSILON
    ? { state: 'outside', required, deviation, limit }
    : { state: 'within', required, deviation, limit };
}

/** True when the verdict obliges a supervisor authorisation to save. */
export function needsAuthorisation(verdict: ToleranceVerdict): boolean {
  return verdict.state === 'outside' || verdict.state === 'undeclared';
}

/**
 * Whether the units of a formula line and a lot can be compared at all.
 *
 * No conversion is attempted anywhere in this feature: the system does
 * not know that this material's kg is 1000 of its g, and guessing is
 * worse than refusing. 24 kg weighed against a lot held in grams is a
 * hundredfold error that every quantity check would otherwise wave
 * through, because all the numbers are positive and in range.
 */
export function unitsAgree(a: string | null | undefined, b: string | null | undefined): boolean {
  //  Unknown units do not "agree". A missing unit is a question, not a
  //  match, and the comparison that follows would be meaningless.
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Whether this viewer may verify a dispensing.
 *
 * The dispenser may not — the same two-person rule items 07 and 08 carry.
 * An unknown viewer may not either: not knowing who is looking is not
 * permission.
 */
export function canVerifyDispensing(
  record: Pick<DispensingRecord, 'dispensed_by' | 'verified_by'>,
  viewerId: string | null | undefined,
): boolean {
  if (record.verified_by) return false;
  if (!viewerId) return false;
  return record.dispensed_by !== viewerId;
}

/**
 * What a batch still needs dispensed, per formula line.
 *
 * Compares the required quantity against what has actually been
 * dispensed against that line. Lines with nothing dispensed appear with
 * their full requirement outstanding, which is the point — a line nobody
 * has touched is the one most likely to be forgotten.
 */
export function outstandingLines(
  lines: FormulaLine[],
  dispensings: Pick<DispensingRecord, 'formula_material_id' | 'actual_quantity'>[],
): { line: FormulaLine; required: number; dispensed: number; outstanding: number }[] {
  return lines.map(line => {
    const dispensed = dispensings
      .filter(d => d.formula_material_id === line.id)
      .reduce((sum, d) => sum + Number(d.actual_quantity), 0);
    const required = requiredQuantity(line);
    //  The clamp is belt-and-braces, not the load-bearing check: the
    //  filter below already drops anything that is not positive, so an
    //  over-dispensed line never reaches a caller either way. Said
    //  plainly because mutation testing showed removing Math.max changes
    //  nothing observable, and a reader should not mistake it for the
    //  rule. It earns its place only if the filter is ever relaxed.
    return { line, required, dispensed, outstanding: Math.max(0, required - dispensed) };
  }).filter(r => r.outstanding > 0);
}
