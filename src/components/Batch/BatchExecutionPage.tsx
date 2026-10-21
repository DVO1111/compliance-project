/**
 * Running a batch — where W4·17's stage strip and W4·18's floor
 * conditions become reachable.
 *
 * THESE THREE SECTIONS ARE ONE SCREEN, which is why they share a page
 * rather than getting three. W4·17 is the strip of stages down a batch,
 * W4·18 is what the floor is told before it acts, and W4·19 is the
 * reading entry inside a stage. An operator at a press does not think
 * of them as three features; they think "which stage am I on, may I
 * start it, what do I record".
 *
 * THE ORDER ON THE PAGE IS THE ORDER OF THE QUESTIONS. Clearance
 * conditions sit ABOVE the strip, because whether the line is cleared
 * decides whether any of the stages below can begin — and a screen
 * that put them underneath would have somebody tap a stage and then
 * discover why not.
 *
 * NOTHING HERE DECIDES ANYTHING. Every verdict on this page — which
 * stage is current, what a locked one waits for, whether a condition
 * blocks or flags, what stops a stage completing — arrives already
 * decided from a database function derived from the gate that enforces
 * it. The page sorts and renders. That is the whole arrangement W4·18
 * was built around: the screens render the severity, they do not
 * classify.
 *
 * WHAT IS NOT CONNECTED YET says so. Signing a stage needs the
 * electronic signature dialog, which is its own wiring job; the button
 * reports that rather than appearing to sign.
 */

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import StageStrip from './StageStrip';
import { FloorNoticeList } from '../Floor/FloorNotice';
import { stageStrip, stageCompletionBlockers } from '../../lib/pharma/batchExecutionService';
import { clearanceConditions } from '../../lib/pharma/lineClearanceService';
import { assess, type FloorCondition } from '../../lib/floor/floorConditions';
import {
  progress, completeButtonLabel, signOffState,
  type StripStage, type CompletionBlocker,
} from '../../lib/batch/stageStrip';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

export interface BatchExecutionPageProps {
  companyId?: string | null;
  userId?: string | null;
}

interface BatchRow {
  id: string;
  batchNumber: string;
  productName: string | null;
  closedAt: string | null;
}

export default function BatchExecutionPage({ companyId, userId }: BatchExecutionPageProps) {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<BatchRow | null>(null);

  const [stages, setStages] = useState<StripStage[]>([]);
  const [conditions, setConditions] = useState<FloorCondition[]>([]);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<CompletionBlocker[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    void (async () => {
      const { data, error } = await supabase
        .from('batch_records')
        .select('id, batch_number, execution_closed_at, products(trade_name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        logger.error('[batchExecution] list failed', { companyId, error });
        setLoading(false);
        return;
      }
      setBatches(((data as unknown[]) ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        const product = row.products as { trade_name?: string } | null;
        return {
          id: String(row.id),
          batchNumber: String(row.batch_number),
          productName: product?.trade_name ?? null,
          closedAt: (row.execution_closed_at as string | null) ?? null,
        };
      }));
      setLoading(false);
    })();
  }, [companyId]);

  //  Both together. The strip without the clearance conditions would
  //  show stages that look startable for as long as the second request
  //  takes, which is the exact moment somebody taps one.
  const loadBatch = useCallback(async (batchId: string) => {
    const [s, c] = await Promise.all([
      stageStrip(batchId),
      clearanceConditions(batchId),
    ]);
    setStages(s);
    setConditions(c);
    setSelectedStage(s.find((x) => x.state === 'current')?.stageId ?? null);
  }, []);

  useEffect(() => {
    if (!open) { setStages([]); setConditions([]); setSelectedStage(null); return; }
    void loadBatch(open.id);
  }, [open, loadBatch]);

  useEffect(() => {
    if (!selectedStage) { setBlockers([]); return; }
    void (async () => setBlockers(await stageCompletionBlockers(selectedStage)))();
  }, [selectedStage]);

  if (!companyId) {
    return (
      <p style={empty}>
        Batch execution belongs to a workspace. Finish setting one up and batches appear
        here.
      </p>
    );
  }

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

        {loading ? (
          <p style={empty}>Loading batches…</p>
        ) : batches.length === 0 ? (
          <p style={empty}>
            No batch records yet. A batch is initiated against a product with a valid
            registration, from the batch release screen.
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

  const verdict = assess(conditions);
  const current = stages.find((s) => s.stageId === selectedStage) ?? null;
  const done = progress(stages);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      {notice && (
        <p style={noticeStyle} role="status">
          {notice}
          <button type="button" style={dismiss} onClick={() => setNotice(null)}>Dismiss</button>
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

      {/*  ABOVE the strip. Whether the line is cleared decides whether
          anything below can begin. */}
      {conditions.length > 0 && <FloorNoticeList conditions={verdict.conditions} />}

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
            <p style={{ margin: 0, fontSize: 14, lineHeight: '21px',
                        color: 'var(--nv-light-text-secondary)' }}>
              Nothing outstanding on this stage.
            </p>
          ) : (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 8,
                         margin: 0, padding: 0, listStyle: 'none' }}>
              {blockers.map((b) => (
                <li key={b.key} style={blockerRow}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{b.title}</span>
                  <span style={{ fontSize: 13, lineHeight: '19px',
                                 color: 'var(--nv-light-text-secondary)' }}>
                    {b.detail}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            style={{ ...primary, ...(blockers.length > 0 ? waiting : {}) }}
            onClick={() => setNotice(
              'Signing a stage needs the electronic signature dialog, which is not '
              + 'connected to this page yet. Nothing has been signed.',
            )}
          >
            {completeButtonLabel(blockers)}
            {current.requiresVerifier && signOffState(current) === 'operator'
              && ' · waiting on a verifier'}
          </button>
        </section>
      )}

      {userId === null && <span hidden />}
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

const number: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 12, lineHeight: '18px',
  letterSpacing: '0.04em', color: 'var(--nv-light-text-tertiary)',
  flexShrink: 0, minWidth: 110, textAlign: 'left',
};

const list: CSSProperties = {
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

const primary: CSSProperties = {
  alignSelf: 'flex-start', minHeight: 56, padding: '0 20px', borderRadius: 10,
  background: 'var(--nv-light-action-bg)', border: '1px solid var(--nv-light-action-bg)',
  color: '#ffffff', fontFamily: 'var(--nv-font-body)', fontWeight: 600,
  fontSize: 16, cursor: 'pointer',
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

const noticeStyle: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: 0,
  padding: '12px 14px', borderRadius: 10,
  background: 'var(--nv-light-badge-waiting-bg)',
  border: '1px solid var(--nv-light-badge-waiting-border)',
  color: 'var(--nv-light-badge-waiting-text)',
  fontFamily: 'var(--nv-font-body)', fontSize: 14, lineHeight: '21px',
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
