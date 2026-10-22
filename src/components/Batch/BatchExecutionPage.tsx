/**
 * Running a batch — W4·17's stage strip, W4·18's floor conditions and
 * W4·19's reading entry.
 *
 * THESE SECTIONS ARE ONE SCREEN, which is why they share a page rather
 * than getting three. W4·17 is the strip of stages down a batch, W4·18
 * is what the floor is told before it acts, and W4·19 is the reading
 * entry inside a stage. An operator at a press does not think of them
 * as three features; they think "which stage am I on, may I start it,
 * what do I record".
 *
 * THE ORDER ON THE PAGE IS THE ORDER OF THE QUESTIONS. Clearance
 * conditions sit ABOVE the strip, because whether the line is cleared
 * decides whether any of the stages below can begin — and a screen
 * that put them underneath would have somebody tap a stage and then
 * discover why not.
 *
 * NOTHING HERE DECIDES ANYTHING. Every verdict on this page — which
 * stage is current, what a locked one waits for, whether a condition
 * blocks or flags, what stops a stage completing, which lots may be
 * weighed — arrives already decided from a database function derived
 * from the gate that enforces it. The page sorts and renders.
 *
 * ── WHAT THIS PAGE WAS BEFORE, AND WHY THAT MATTERED ──
 *
 * It was a viewer. It read the strip, the conditions and the blockers,
 * and its one button set a notice saying the signature dialog was not
 * connected. Every write path in batchExecutionService and
 * dispensingService — start, record a reading, correct one, dispense,
 * verify a dispensing, sign, verify, reopen, close — had no caller
 * anywhere in the application. ApprovedLotPicker existed and was never
 * mounted. So a batch could be initiated and then nothing could be
 * done with it through the interface.
 *
 * ── WHO MAY USE THE CONTROLS, AND WHO SAYS SO ──
 *
 * PM-03 gives Act on `Batch records` to the Production supervisor and
 * View to the seven other roles it tabulates, QA Manager included.
 * That is enforced in the database by 20261106000000, as guards on the
 * tables these writes land in, so it holds for a direct PostgREST call
 * too. This page asks executionRules the same question to decide what
 * to DRAW, and says in words that the database is what decides. If the
 * two ever disagree, the database wins and this screen is wrong.
 *
 * A viewer with View access is not shown a locked screen. They are
 * shown the batch, with a sentence naming who may act on it — the rail
 * sent them here, and a bare refusal on a page their own sidebar
 * offered reads as a bug rather than as a rule.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import StageStrip from './StageStrip';
import ApprovedLotPicker from '../Floor/ApprovedLotPicker';
import { FloorNoticeList } from '../Floor/FloorNotice';
import ElectronicSignatureModal from '../ElectronicSignatures/ElectronicSignatureModal';
import {
  stageStrip, stageCompletionBlockers, stageParameters,
  startBatchStage, recordStageReading, completeBatchStage,
  signStageAsOperator, verifyStage, closeBatchExecution,
  listStageReadings,
  type StageParameter, type BatchStageReading,
} from '../../lib/pharma/batchExecutionService';
import {
  dispensableLots, dispenseMaterial, listDispensings, listFormulaLines,
  type DispensingRecord, type FormulaLine,
} from '../../lib/pharma/dispensingService';
import { listBalances, type Instrument } from '../../lib/pharma/instrumentService';
import { clearanceConditions } from '../../lib/pharma/lineClearanceService';
import { assess, type FloorCondition, type DispensableLot } from '../../lib/floor/floorConditions';
import {
  progress, completeButtonLabel, checkReading, TOUCH,
  type StripStage, type CompletionBlocker,
} from '../../lib/batch/stageStrip';
import {
  mayExecute, viewerNotice, startOffered, entryOffered,
  completeOffered, completeEnabled, signStep, completeConfirmation,
  dispensingIncomplete, readingComplete,
} from '../../lib/batch/executionRules';
import type { WorkRole } from '../../lib/access/permissionRequests';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

export interface BatchExecutionPageProps {
  companyId?: string | null;
  userId?: string | null;
  role?: WorkRole | null;
}

interface BatchRow {
  id: string;
  batchNumber: string;
  productName: string | null;
  formulaId: string | null;
  closedAt: string | null;
}

/** What the signature dialog is being opened for. */
type SignFor =
  | { kind: 'complete'; stage: StripStage }
  | { kind: 'operator'; stage: StripStage }
  | { kind: 'verify'; stage: StripStage }
  | null;

export default function BatchExecutionPage({ companyId, userId, role }: BatchExecutionPageProps) {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<BatchRow | null>(null);

  const [stages, setStages] = useState<StripStage[]>([]);
  //  Null, not [], until read. An empty list of conditions means "the
  //  line is clear"; a list that has not arrived means nothing at all,
  //  and startOffered fails closed on the difference.
  const [conditions, setConditions] = useState<FloorCondition[] | null>(null);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<CompletionBlocker[]>([]);
  const [parameters, setParameters] = useState<StageParameter[]>([]);
  const [readings, setReadings] = useState<BatchStageReading[]>([]);

  const [lines, setLines] = useState<FormulaLine[]>([]);
  const [materialNames, setMaterialNames] = useState<Record<string, string>>({});
  const [dispensings, setDispensings] = useState<DispensingRecord[]>([]);
  const [balances, setBalances] = useState<Instrument[]>([]);

  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signFor, setSignFor] = useState<SignFor>(null);

  //  Reading entry, one draft per parameter.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  //  Dispensing entry.
  const [line, setLine] = useState<string | null>(null);
  const [lots, setLots] = useState<DispensableLot[]>([]);
  const [lot, setLot] = useState<string | null>(null);
  const [weighed, setWeighed] = useState('');
  const [balance, setBalance] = useState<string | null>(null);

  const canAct = mayExecute(role);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    void (async () => {
      const [list, bal] = await Promise.all([
        supabase
          .from('batch_records')
          .select('id, batch_number, formula_id, execution_closed_at, products(trade_name)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(50),
        listBalances(companyId),
      ]);
      if (list.error) {
        logger.error('[batchExecution] list failed', { companyId, error: list.error });
        setFailure('The batch list could not be read.');
        setLoading(false);
        return;
      }
      setBalances(bal);
      setBatches(((list.data as unknown[]) ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        const product = row.products as { trade_name?: string } | null;
        return {
          id: String(row.id),
          batchNumber: String(row.batch_number),
          productName: product?.trade_name ?? null,
          formulaId: (row.formula_id as string | null) ?? null,
          closedAt: (row.execution_closed_at as string | null) ?? null,
        };
      }));
      setLoading(false);
    })();
  }, [companyId]);

  //  All of it together. The strip without the clearance conditions
  //  would show stages that look startable for as long as the second
  //  request takes, which is the exact moment somebody taps one.
  const loadBatch = useCallback(async (batch: BatchRow) => {
    if (!companyId) return;
    const [s, c, fl, d] = await Promise.all([
      stageStrip(batch.id),
      clearanceConditions(batch.id),
      batch.formulaId ? listFormulaLines(batch.formulaId) : Promise.resolve([]),
      listDispensings(batch.id, companyId),
    ]);
    setStages(s);
    setConditions(c);
    setLines(fl);
    setDispensings(d);
    setSelectedStage(s.find((x) => x.state === 'current')?.stageId ?? s[0]?.stageId ?? null);

    //  Material names, so a formula line reads as a material rather than
    //  as a uuid. One query for the lot, not one per line.
    const ids = fl.map((l) => l.material_id).filter(Boolean);
    if (ids.length > 0) {
      const { data } = await supabase.from('materials').select('id, name').in('id', ids);
      const names: Record<string, string> = {};
      for (const r of ((data as unknown[]) ?? [])) {
        const row = r as Record<string, unknown>;
        names[String(row.id)] = String(row.name);
      }
      setMaterialNames(names);
    }
  }, [companyId]);

  useEffect(() => {
    if (!open) {
      setStages([]); setConditions(null); setSelectedStage(null);
      setLines([]); setDispensings([]); setParameters([]); setReadings([]);
      return;
    }
    void loadBatch(open);
  }, [open, loadBatch]);

  const reloadStage = useCallback(async (stageId: string) => {
    if (!companyId) return;
    const [b, p, r] = await Promise.all([
      stageCompletionBlockers(stageId),
      stageParameters(stageId),
      listStageReadings(stageId, companyId),
    ]);
    setBlockers(b);
    setParameters(p);
    setReadings(r);
  }, [companyId]);

  useEffect(() => {
    if (!selectedStage) { setBlockers([]); setParameters([]); setReadings([]); return; }
    void reloadStage(selectedStage);
  }, [selectedStage, reloadStage]);

  //  The lots the picker may offer for the chosen formula line. Asked
  //  per material, from dispensable_lots, which asks the dispensing gate
  //  per lot — so an ineligible lot is never listed rather than listed
  //  and refused.
  useEffect(() => {
    if (!open || !line) { setLots([]); setLot(null); return; }
    const chosen = lines.find((l) => l.id === line);
    if (!chosen) { setLots([]); return; }
    void (async () => {
      setLots(await dispensableLots(open.id, chosen.material_id));
      setLot(null);
    })();
  }, [open, line, lines]);

  const current = useMemo(
    () => stages.find((s) => s.stageId === selectedStage) ?? null,
    [stages, selectedStage],
  );

  const verdict = useMemo(() => assess(conditions ?? []), [conditions]);

  /** Every write goes through here, so a refusal is shown rather than swallowed. */
  const run = useCallback(async (
    what: string,
    action: () => Promise<{ ok: true } | { ok: false; code: string; message: string }>,
  ) => {
    setBusy(true); setFailure(null); setNotice(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      //  The database's refusals are written as sentences for exactly
      //  this purpose. Shown as written, with the code, rather than
      //  replaced by something generic.
      setFailure(`${result.message} (${result.code})`);
      return false;
    }
    setNotice(what);
    if (open) await loadBatch(open);
    if (selectedStage) await reloadStage(selectedStage);
    return true;
  }, [open, selectedStage, loadBatch, reloadStage]);

  if (!companyId) {
    return (
      <p style={empty}>
        Batch execution belongs to a workspace. Finish setting one up and batches appear
        here.
      </p>
    );
  }

  // ── the list ───────────────────────────────────────────────────────

  if (!open) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <header>
          <h1 style={title}>Batch execution</h1>
          <p style={sub}>
            The shop-floor view of one batch: its stages, what each is waiting for, and
            what the line clearance says before any of them can start.
          </p>
        </header>

        {!canAct && <p style={viewerBox}>{viewerNotice(role)}</p>}
        {failure && <p style={bad} role="status">{failure}</p>}

        {loading ? (
          <p style={empty}>Loading batches…</p>
        ) : batches.length === 0 ? (
          <p style={empty}>
            No batch records yet. A batch is initiated against a product with a valid
            registration and an approved formula.
          </p>
        ) : (
          <ul style={list}>
            {batches.map((b) => (
              <li key={b.id}>
                <button type="button" style={row} onClick={() => setOpen(b)}>
                  <span style={number}>{b.batchNumber}</span>
                  <span style={{ flex: 1, minWidth: 160, textAlign: 'left' }}>
                    {b.productName ?? 'Unknown product'}
                  </span>
                  <span style={b.closedAt ? closedChip : openChip}>
                    {b.closedAt ? 'closed' : 'in execution'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ── one batch ──────────────────────────────────────────────────────

  const done = progress(stages);
  const step = signStep(current, userId);
  const allComplete = stages.length > 0 && stages.every((s) => s.state === 'done');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      {notice && (
        <p style={noticeStyle} role="status">
          {notice}
          <button type="button" style={dismiss} onClick={() => setNotice(null)}>Dismiss</button>
        </p>
      )}
      {failure && (
        <p style={bad} role="status">
          {failure}
          <button type="button" style={dismiss} onClick={() => setFailure(null)}>Dismiss</button>
        </p>
      )}

      <button type="button" style={back} onClick={() => setOpen(null)}>← All batches</button>

      <header>
        <span style={number}>{open.batchNumber}</span>
        <h1 style={title}>{open.productName ?? 'Batch execution'}</h1>
        <p style={sub}>
          {done.done} of {done.total} stages complete
          {open.closedAt && ' · execution closed'}
        </p>
      </header>

      {!canAct && <p style={viewerBox}>{viewerNotice(role)}</p>}

      {/*  ABOVE the strip. Whether the line is cleared decides whether
          anything below can begin. */}
      {conditions === null
        ? <p style={empty}>Reading the line conditions…</p>
        : conditions.length > 0 && <FloorNoticeList conditions={verdict.conditions} />}

      <StageStrip
        stages={stages}
        activeStageId={selectedStage ?? undefined}
        onOpen={(stage) => setSelectedStage(stage.stageId)}
      />

      {current && (
        <section style={card}>
          <h2 style={{ margin: 0, fontWeight: 600, fontSize: 17 }}>
            Stage {current.sequenceNo} · {current.name}
          </h2>

          {blockers.length === 0 ? (
            <p style={quiet}>Nothing outstanding on this stage.</p>
          ) : (
            <ul style={plainList}>
              {blockers.map((b) => (
                <li key={b.key} style={blockerRow}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{b.title}</span>
                  <span style={quiet}>{b.detail}</span>
                </li>
              ))}
            </ul>
          )}

          {/*  Start. Offered only when the role, the stage and the line
              all agree — and the line's answer comes from the same
              function batch_stage_start() refuses on. */}
          {startOffered(current, conditions === null ? null : verdict, role) && (
            <button type="button" style={primary} disabled={busy}
              onClick={() => void run(
                `Stage ${current.sequenceNo} started.`,
                () => startBatchStage(current.stageId),
              )}>
              {busy ? 'Starting…' : 'Start stage'}
            </button>
          )}

          {current.status === 'pending' && canAct
            && !startOffered(current, conditions === null ? null : verdict, role) && (
            <p style={quiet}>
              {verdict.blocked.length > 0
                ? 'This stage cannot start while the line conditions above are unresolved.'
                : current.state !== 'current'
                  ? (current.waitingFor ?? 'This stage is not the next one.')
                  : 'Reading the line conditions…'}
            </p>
          )}

          {/*  Complete and sign. OFFERED WITH BLOCKERS PRESENT and
              disabled, because "Complete and sign stays disabled with
              the reason given" — removing it leaves somebody hunting for
              a control that is not there. */}
          {completeOffered(current, role) && step !== 'verify' && (
            <button
              type="button"
              style={{
                ...primary, minHeight: TOUCH.target,
                ...(completeEnabled(current, blockers, role) ? {} : waiting),
              }}
              disabled={!completeEnabled(current, blockers, role) || busy}
              onClick={() => setSignFor(current.requiresVerifier
                ? { kind: 'operator', stage: current }
                : { kind: 'complete', stage: current })}
            >
              {completeButtonLabel(blockers)}
            </button>
          )}

          {completeOffered(current, role) && step === 'verify' && (
            <button type="button" style={{ ...primary, minHeight: TOUCH.target }} disabled={busy}
              onClick={() => setSignFor({ kind: 'verify', stage: current })}>
              Verify this stage
            </button>
          )}

          {/*  The operator has signed and is looking at their own stage.
              The database refuses a self-verification, so the control is
              not drawn — and the reason is, because an unexplained
              absence is the same bug as an unexplained grey. */}
          {current.status === 'awaiting_verification' && step === 'none' && (
            <p style={quiet}>
              You signed this stage as its operator. A second person has to verify it, and
              it cannot be you.
            </p>
          )}
        </section>
      )}

      {/*  W4·19. The reading entry, inside the stage, built from the
          FORMULA's parameters rather than from the readings already
          taken — a stage with nothing recorded has no reading rows. */}
      {current && entryOffered(current, role) && (
        <section style={card}>
          <h2 style={{ margin: 0, fontWeight: 600, fontSize: 17 }}>Readings</h2>
          {parameters.length === 0 ? (
            <p style={quiet}>
              This stage's formula declares no parameters, so there is nothing to record
              against it.
            </p>
          ) : (
            <ul style={plainList}>
              {parameters.map((p) => {
                const draft = drafts[p.id] ?? '';
                const check = checkReading(draft, p.minValue, p.maxValue);
                const taken = readings.filter(
                  (r) => r.formula_parameter_id === p.id && !r.corrected_from_id,
                ).length;
                return (
                  <li key={p.id} style={paramRow}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>
                        {p.parameter}
                        {p.isCritical && <span style={criticalChip}>CRITICAL</span>}
                      </span>
                      <span style={quiet}>
                        {p.minValue != null || p.maxValue != null
                          ? `${p.minValue ?? '—'} to ${p.maxValue ?? '—'}${p.unit ? ` ${p.unit}` : ''}`
                          : p.targetText
                            ? p.targetText
                            : 'No limits declared'}
                        {taken > 0 && ` · ${taken} recorded`}
                      </span>
                    </span>

                    <input
                      style={{
                        ...input, minHeight: TOUCH.field, maxWidth: 160,
                        ...(check === 'out_of_range' ? outOfRange : {}),
                      }}
                      inputMode={p.parameterType === 'product_attribute' ? 'text' : 'decimal'}
                      value={draft}
                      placeholder={p.parameterType === 'product_attribute' ? 'Observation' : 'Value'}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                      aria-label={`Reading for ${p.parameter}`}
                    />

                    <button
                      type="button"
                      style={{ ...secondary, minHeight: TOUCH.target }}
                      disabled={busy || !readingComplete({
                        parameterType: p.parameterType,
                        value: draft, text: draft,
                      })}
                      onClick={() => void (async () => {
                        const isText = p.parameterType === 'product_attribute'
                          && !Number.isFinite(Number(draft));
                        const ok = await run(
                          `Reading recorded for ${p.parameter}.`,
                          () => recordStageReading({
                            stageId: current.stageId,
                            formulaParameterId: p.id,
                            value: isText ? null : Number(draft),
                            text: isText ? draft : null,
                          }),
                        );
                        if (ok) setDrafts((d) => ({ ...d, [p.id]: '' }));
                      })()}
                    >
                      Record
                    </button>

                    {/*  OUT OF SPECIFICATION IS STILL RECORDED. The field
                        says so rather than refusing the number: the
                        reading outside the limits is the one that must
                        be written down. */}
                    {check === 'out_of_range' && (
                      <span style={{ ...quiet, color: '#b42c1d', flexBasis: '100%' }}>
                        Outside the limits. Record it anyway — the database marks it out of
                        specification and raises it with the supervisor.
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {readings.length > 0 && (
            <p style={quiet}>
              {readings.length} reading{readings.length === 1 ? '' : 's'} on this stage,
              corrections included. A correction never overwrites the original.
            </p>
          )}
        </section>
      )}

      {/*  Dispensing, which is a step inside running a batch rather than
          a screen of its own. The lot list comes from dispensable_lots —
          "Unapproved lots selectable then refused: no. They are never
          listed." */}
      {current && entryOffered(current, role) && lines.length > 0 && (
        <section style={card}>
          <h2 style={{ margin: 0, fontWeight: 600, fontSize: 17 }}>Dispensing</h2>

          <label style={labelStyle}>
            Formula line
            <select style={input} value={line ?? ''}
              onChange={(e) => setLine(e.target.value || null)}>
              <option value="">Choose a material…</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {materialNames[l.material_id] ?? l.material_id}
                  {' — '}{l.quantity_per_batch} {l.unit}
                </option>
              ))}
            </select>
          </label>

          {line && (
            <ApprovedLotPicker
              materialName={materialNames[lines.find((l) => l.id === line)?.material_id ?? ''] ?? 'this material'}
              lots={lots}
              selectedLotId={lot ?? undefined}
              onSelect={(l) => setLot(l.lotId)}
            />
          )}

          {line && (
            <>
              <label style={labelStyle}>
                Weighed quantity
                <input style={{ ...input, minHeight: TOUCH.field }} inputMode="decimal"
                  value={weighed} onChange={(e) => setWeighed(e.target.value)}
                  placeholder={`Required ${lines.find((l) => l.id === line)?.quantity_per_batch ?? ''}`} />
              </label>

              <label style={labelStyle}>
                Balance
                <select style={input} value={balance ?? ''}
                  onChange={(e) => setBalance(e.target.value || null)}>
                  <option value="">Choose a balance…</option>
                  {balances.map((b) => (
                    <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                  ))}
                </select>
              </label>

              {/*  The missing things are NAMED, rather than the button
                  being disabled with nothing said. */}
              {dispensingIncomplete({ lotId: lot, quantity: weighed, instrumentId: balance })
                .map((m) => <p key={m} style={quiet}>{m}</p>)}

              <button
                type="button"
                style={{ ...primary, minHeight: TOUCH.target }}
                disabled={busy || dispensingIncomplete({
                  lotId: lot, quantity: weighed, instrumentId: balance,
                }).length > 0}
                onClick={() => void (async () => {
                  if (!lot || !balance || !userId) return;
                  const ok = await run(
                    'Dispensing recorded. It still needs a second person to verify it.',
                    () => dispenseMaterial({
                      batchId: open.id,
                      materialLotId: lot,
                      actualQuantity: Number(weighed),
                      balanceIdentifier: balance,
                      companyId,
                      userId,
                      formulaMaterialId: line,
                      batchStageId: current.stageId,
                    }),
                  );
                  if (ok) { setWeighed(''); setLot(null); }
                })()}
              >
                Dispense
              </button>

              {/*  An out-of-tolerance quantity is not refused here. The
                  database asks for a named supervisor and a reason, by
                  name, and that refusal arrives as a sentence. */}
              <p style={quiet}>
                A quantity outside the line's tolerance is not rejected — it needs a named
                supervisor and a reason, which the database asks for.
              </p>
            </>
          )}

          {dispensings.length > 0 && (
            <ul style={plainList}>
              {dispensings.map((d) => (
                <li key={d.id} style={dispenseRow}>
                  <span style={{ fontWeight: 600, minWidth: 0 }}>{d.internal_lot_number}</span>
                  <span style={quiet}>
                    {d.actual_quantity} {d.unit} of a required {d.required_quantity}
                    {d.tolerance_exception && ' · outside tolerance'}
                  </span>
                  <span style={d.verified_at ? closedChip : openChip}>
                    {d.verified_at ? 'verified' : 'awaiting a second person'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/*  Closing execution. IRREVERSIBLE, and the screen says so before
          the button rather than after it. */}
      {canAct && allComplete && !open.closedAt && (
        <section style={card}>
          <h2 style={{ margin: 0, fontWeight: 600, fontSize: 17 }}>Close execution</h2>
          <p style={quiet}>
            Every stage is complete. Closing execution freezes every stage and every
            reading, forbids reopening, and hands the record to QC. It cannot be undone by
            anyone, including an administrator.
          </p>
          <p style={quiet}>
            Closing is not a release. The batch becomes QC's to test; releasing it is a
            separate decision and a different role's.
          </p>
          <button type="button" style={{ ...primary, minHeight: TOUCH.target }} disabled={busy}
            onClick={() => void run(
              'Execution closed. The batch record is now with QC.',
              () => closeBatchExecution(open.id, companyId, userId ?? ''),
            )}>
            Close execution permanently
          </button>
        </section>
      )}

      {signFor && companyId && (
        <ElectronicSignatureModal
          open
          companyId={companyId}
          entityType="batch_stage"
          entityId={signFor.stage.stageId}
          action={signFor.kind === 'verify' ? 'verify' : 'complete'}
          defaultMeaning={signFor.kind === 'verify' ? 'verified' : 'authored'}
          title={signFor.kind === 'verify'
            ? `Verify stage ${signFor.stage.sequenceNo} · ${signFor.stage.name}`
            : completeConfirmation(signFor.stage)}
          metadata={{ batch_number: open.batchNumber, stage: signFor.stage.sequenceNo }}
          onClose={() => setSignFor(null)}
          onSigned={(signatureId) => {
            const target = signFor;
            setSignFor(null);
            if (!target) return;
            void (async () => {
              if (target.kind === 'verify') {
                await run('Stage verified.', () => verifyStage(target.stage.stageId, signatureId));
              } else if (target.kind === 'operator') {
                await run(
                  'Signed as operator. The stage now waits for a second person to verify it.',
                  () => signStageAsOperator(target.stage.stageId, signatureId),
                );
              } else {
                await run('Stage complete.', () => completeBatchStage({
                  stageId: target.stage.stageId,
                  operatorSignatureId: signatureId,
                }));
              }
            })();
          }}
        />
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const title: CSSProperties = {
  margin: '2px 0 4px', fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 24, lineHeight: '32px', color: 'var(--nv-light-text-primary)',
  textWrap: 'balance',
};

const sub: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-body)', fontSize: 14, lineHeight: '21px',
  color: 'var(--nv-light-text-secondary)', maxWidth: '70ch',
};

const quiet: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-body)', fontSize: 13,
  lineHeight: '19px', color: 'var(--nv-light-text-secondary)',
};

const number: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 12, lineHeight: '18px',
  letterSpacing: '0.04em', color: 'var(--nv-light-text-tertiary)',
  flexShrink: 0, minWidth: 110, textAlign: 'left',
};

const list: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0, listStyle: 'none',
};

const plainList: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0, listStyle: 'none',
};

const row: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  width: '100%', boxSizing: 'border-box', minHeight: 52, padding: '10px 14px',
  borderRadius: 10, background: 'var(--nv-light-surface)',
  border: '1px solid var(--nv-light-border)', color: 'var(--nv-light-text-primary)',
  fontFamily: 'var(--nv-font-body)', fontSize: 15, cursor: 'pointer',
};

const chipBase: CSSProperties = {
  padding: '3px 9px', borderRadius: 6, flexShrink: 0,
  fontFamily: 'var(--nv-font-mono)', fontSize: 11, lineHeight: '16px',
};

const openChip: CSSProperties = {
  ...chipBase, background: 'var(--nv-light-badge-waiting-bg)',
  color: 'var(--nv-light-badge-waiting-text)',
  border: '1px solid var(--nv-light-badge-waiting-border)',
};

const closedChip: CSSProperties = {
  ...chipBase, background: 'var(--nv-light-surface-sunken)',
  color: 'var(--nv-light-text-tertiary)',
  border: '1px solid var(--nv-light-border)',
};

const criticalChip: CSSProperties = {
  ...chipBase, marginLeft: 8, background: '#f3d7d2', color: '#b42c1d',
  border: '1px solid #e3b5ad', fontSize: 10,
};

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
  padding: 18, borderRadius: 12,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const blockerRow: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2,
  padding: '10px 12px', borderRadius: 8,
  background: 'var(--nv-light-surface-sunken)',
};

const paramRow: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  padding: '12px 14px', borderRadius: 10, minWidth: 0,
  background: 'var(--nv-light-surface-sunken)',
};

const dispenseRow: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  padding: '10px 12px', borderRadius: 8, minWidth: 0, fontSize: 14,
  background: 'var(--nv-light-surface-sunken)',
};

const labelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13.5,
  fontWeight: 600, minWidth: 0,
};

const input: CSSProperties = {
  border: '1px solid var(--nv-light-border)', borderRadius: 8, padding: '9px 11px',
  fontSize: 15, fontWeight: 400, font: 'inherit', minWidth: 0, width: '100%',
  boxSizing: 'border-box',
};

const outOfRange: CSSProperties = {
  borderColor: '#c62f1e', borderWidth: 2, background: '#fdf6f5',
};

const primary: CSSProperties = {
  alignSelf: 'flex-start', minHeight: 56, padding: '0 20px', borderRadius: 10,
  background: 'var(--nv-light-action-bg)', border: '1px solid var(--nv-light-action-bg)',
  color: '#ffffff', fontFamily: 'var(--nv-font-body)', fontWeight: 600,
  fontSize: 16, cursor: 'pointer',
};

const secondary: CSSProperties = {
  padding: '0 16px', borderRadius: 10, flexShrink: 0,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)', fontFamily: 'var(--nv-font-body)',
  fontWeight: 600, fontSize: 14, cursor: 'pointer',
};

const waiting: CSSProperties = {
  background: 'var(--nv-light-surface-sunken)',
  borderColor: 'var(--nv-light-border)',
  color: 'var(--nv-light-text-secondary)',
};

const empty: CSSProperties = {
  margin: 0, padding: '16px 18px', borderRadius: 10,
  background: 'var(--nv-light-surface-sunken)',
  border: '1px dashed var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', fontSize: 14, lineHeight: '21px',
  color: 'var(--nv-light-text-secondary)',
};

const viewerBox: CSSProperties = {
  margin: 0, padding: '12px 14px', borderRadius: 10,
  background: 'var(--nv-light-surface-sunken)',
  border: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', fontSize: 13.5, lineHeight: '20px',
  color: 'var(--nv-light-text-secondary)', maxWidth: '72ch',
};

const noticeStyle: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: 0,
  padding: '12px 14px', borderRadius: 10,
  background: 'var(--nv-light-badge-waiting-bg)',
  border: '1px solid var(--nv-light-badge-waiting-border)',
  color: 'var(--nv-light-badge-waiting-text)',
  fontFamily: 'var(--nv-font-body)', fontSize: 14, lineHeight: '21px',
};

const bad: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: 0,
  borderRadius: 10, padding: '11px 14px', fontSize: 14, lineHeight: '21px',
  background: '#f3d7d2', border: '1px solid #c62f1e', color: '#b42c1d',
  fontFamily: 'var(--nv-font-body)',
};

const dismiss: CSSProperties = {
  marginLeft: 'auto', background: 'none', border: 'none', padding: 0,
  color: 'inherit', font: 'inherit', fontWeight: 600,
  textDecoration: 'underline', cursor: 'pointer',
};

const back: CSSProperties = {
  alignSelf: 'flex-start', minHeight: 44, padding: '0 14px', borderRadius: 10,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)', fontFamily: 'var(--nv-font-body)',
  fontWeight: 600, fontSize: 14, cursor: 'pointer',
};
