/**
 * The deviations page — where W5·11's register, raise flow and
 * investigation view become reachable.
 *
 * Until this existed, every piece of W5·11 was built, tested and
 * unreachable: the components rendered only in the preview harness,
 * with fixtures in place of Supabase. This is the join.
 *
 * ONE PAGE, THREE VIEWS. The register is the page; opening a row
 * replaces it with that deviation's investigation, and raising opens a
 * sheet OVER whichever is showing. That last part is the design's own
 * NOT DONE IF — "raise flow makes the user leave the record: no" — and
 * it is why raising is an overlay with a Cancel that returns, not a
 * route.
 *
 * WHAT IT DOES NOT DO YET, said plainly rather than faked:
 *   · Raising from the register asks what the deviation is against,
 *     and W5·11 decision 6 has not settled whether that should exist
 *     at all. So this page raises against the process, and raising
 *     against a batch or a lot happens from those records.
 *   · Signing a closure needs the electronic signature dialog, which
 *     is a separate existing component and a separate wiring job. The
 *     button is rendered for QA and reports that it is not connected,
 *     rather than appearing to sign and doing nothing.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import DeviationRegister from './DeviationRegister';
import InvestigationPanel from './InvestigationPanel';
import RootCausePanel from './RootCausePanel';
import RaiseDeviationSheet from './RaiseDeviationSheet';
import {
  registerRows, closureReadiness, impactConsequences, raiseDeviation,
  rootCauseCategories, rootCauseFor, startRootCause, defaultFramework,
  linkedRecords,
  answerWhy, addWhy, answerW5h1, setDeterminedRootCause, setRootCauseCategory,
  completeRootCause, raiseCapaFromDeviation, ownerName, deviationDetail,
} from '../../lib/deviations/deviationService';
import { emptyDraft, type DeviationDraft, type ImpactOption } from '../../lib/deviations/raise';
import type {
  RegisterRow, ReadinessCondition, RootCauseAnalysis, Investigation, Framework,
} from '../../lib/deviations/investigation';
import type { LinkedRecord } from './InvestigationPanel';
import { useFloorLayout } from '../../lib/inprocess/floorLayout';
import { logger } from '../../lib/logger';

export interface DeviationsPageProps {
  companyId?: string | null;
  userId?: string | null;
  /** Whether this viewer holds a QA role. Governs whether the sign
   *  button is rendered at all — not whether it is enabled. */
  isQa?: boolean;
}

/** The fields that belong to one deviation rather than to the register:
 *  who owns the investigation, and what was done immediately. */
interface DeviationDetail {
  ownerId: string | null;
  ownerName: string | null;
  immediateAction: string | null;
  containment: string | null;
}

const EMPTY_DETAIL: DeviationDetail = {
  ownerId: null, ownerName: null, immediateAction: null, containment: null,
};

export default function DeviationsPage({ companyId, isQa = false }: DeviationsPageProps) {
  const layout = useFloorLayout();

  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<RegisterRow | null>(null);

  const [conditions, setConditions] = useState<ReadinessCondition[]>([]);
  const [linked, setLinked] = useState<LinkedRecord[]>([]);
  const [rca, setRca] = useState<RootCauseAnalysis | null>(null);
  const [categories, setCategories] = useState<Array<{ key: string; label: string }>>([]);
  const [framework, setFramework] = useState<Framework>('five_whys');

  const [raising, setRaising] = useState(false);
  const [draft, setDraft] = useState<DeviationDraft>(() => emptyDraft('process', null));
  const [attempted, setAttempted] = useState(false);
  const [options, setOptions] = useState<ImpactOption[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRegister = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setRows(await registerRows(companyId, includeClosed));
    setLoading(false);
  }, [companyId, includeClosed]);

  useEffect(() => { void loadRegister(); }, [loadRegister]);

  useEffect(() => {
    if (!companyId) return;
    void (async () => {
      setCategories(await rootCauseCategories(companyId));
      setFramework(await defaultFramework(companyId));
    })();
  }, [companyId]);

  const [detail, setDetail] = useState<DeviationDetail>(EMPTY_DETAIL);

  //  Everything the investigation view needs, fetched together when a
  //  row is opened. Separately would show the panel with an empty
  //  checklist for a moment, which reads as "nothing outstanding".
  //
  //  The detail read is here rather than in the register: the owner's
  //  name, the immediate action and the containment are one deviation's
  //  fields, and fetching them for every row of a register nobody has
  //  opened would be a query per row.
  useEffect(() => {
    if (!open) {
      setConditions([]); setLinked([]); setRca(null); setDetail(EMPTY_DETAIL);
      return;
    }
    void (async () => {
      const [c, l, r, d] = await Promise.all([
        closureReadiness(open.id),
        linkedRecords(open.id),
        rootCauseFor(open.id),
        deviationDetail(open.id),
      ]);
      setConditions(c); setLinked(l); setRca(r);
      setDetail({ ...d, ownerName: await ownerName(d.ownerId) });
    })();
  }, [open]);

  //  Re-reads the analysis after a write instead of patching local
  //  state. Every one of these writes can be refused by a trigger — a
  //  category off the company's list, a change to a completed analysis
  //  — so the panel should show what the database now holds, not what
  //  was typed at it.
  const afterWrite = useCallback(async (
    result: { ok: true } | { ok: false; message: string },
  ) => {
    if (!result.ok) { setNotice(result.message); return; }
    if (open) setRca(await rootCauseFor(open.id));
  }, [open]);

  const investigation: Investigation | null = useMemo(() => {
    if (!open) return null;
    return {
      deviationId: open.id,
      deviationNumber: open.deviationNumber,
      title: open.title,
      severity: open.severity,
      impact: open.impact,
      stateKey: open.stateKey,
      stateLabel: open.stateLabel,
      //  Resolved from investigation_owner through profiles. Null means
      //  genuinely unassigned OR a failed lookup, and the panel draws
      //  both as "Not assigned" — a name invented to fill the gap would
      //  be a false statement about accountability.
      ownerName: detail.ownerName,
      dueDate: open.dueDate,
      daysOverdue: open.daysOverdue,
      isOverdue: open.isOverdue,
      immediateAction: detail.immediateAction,
      containment: detail.containment,
    };
  }, [open, detail]);

  const beginRaise = useCallback(async () => {
    if (!companyId) return;
    setDraft(emptyDraft('process', null));
    setAttempted(false);
    setNotice(null);
    setRaising(true);
    //  Fetched when the sheet opens rather than on page load: the
    //  consequence sentences name the record, so they are only right
    //  once we know what is being raised against.
    setOptions(await impactConsequences(companyId, 'process', null));
  }, [companyId]);

  const submit = useCallback(async () => {
    if (!companyId) return;
    setAttempted(true);
    const result = await raiseDeviation(companyId, draft);
    if (!result.ok) {
      setNotice(result.message);
      logger.error('[deviations] raise refused', { code: result.code });
      return;
    }
    setRaising(false);
    setNotice(`${result.deviationNumber} raised.`);
    await loadRegister();
  }, [companyId, draft, loadRegister]);

  const beginRootCause = useCallback(async () => {
    if (!companyId || !open) return;
    const result = await startRootCause(companyId, open.id, framework);
    if (!result.ok) { setNotice(result.message); return; }
    setRca(await rootCauseFor(open.id));
  }, [companyId, open, framework]);

  if (!companyId) {
    return (
      <p style={empty}>
        Deviations belong to a workspace. Finish setting one up and they appear here.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      {notice && (
        <p style={noticeStyle} role="status">
          {notice}
          <button type="button" style={dismiss} onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </p>
      )}

      {open ? (
        <>
          <button type="button" style={back} onClick={() => setOpen(null)}>
            ← All deviations
          </button>

          {investigation && (
            <InvestigationPanel
              investigation={investigation}
              conditions={conditions}
              linked={linked}
              isQa={isQa}
              onSign={() => setNotice(
                'Closing a deviation needs the electronic signature dialog, which is not '
                + 'connected to this page yet. Nothing has been signed.',
              )}
              onRaiseCapa={() => void (async () => {
                const r = await raiseCapaFromDeviation(open.id);
                if (!r.ok) { setNotice(r.message); return; }
                setNotice('CAPA raised and linked to this deviation.');
                //  The readiness checklist counts linked CAPAs, and the
                //  linked list shows them, so both are stale now.
                const [c, l] = await Promise.all([
                  closureReadiness(open.id), linkedRecords(open.id),
                ]);
                setConditions(c); setLinked(l);
                await loadRegister();
              })()}
            />
          )}

          {rca ? (
            <RootCausePanel
              analysis={rca}
              categories={categories}
              onAnswerWhy={(seq, answer) => void (async () => {
                await afterWrite(await answerWhy(rca.id, seq, answer));
              })()}
              onAddWhy={() => void (async () => {
                await afterWrite(await addWhy(rca.id, rca.whys));
              })()}
              onAnswer={(key, answer) => void (async () => {
                await afterWrite(await answerW5h1(rca.id, key, answer));
              })()}
              onChangeRootCause={(value) => void (async () => {
                await afterWrite(await setDeterminedRootCause(rca.id, value));
              })()}
              onChangeCategory={(key) => void (async () => {
                await afterWrite(await setRootCauseCategory(rca.id, key));
              })()}
              onComplete={() => void (async () => {
                const r = await completeRootCause(rca.id);
                await afterWrite(r);
                if (!r.ok) return;
                setNotice('Root cause recorded.');
                //  Completing one is a closure condition, so the
                //  checklist above changes with it.
                setConditions(await closureReadiness(open.id));
              })()}
            />
          ) : (
            <section style={startCard}>
              <h3 style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>Root cause</h3>
              <p style={{ margin: 0, fontSize: 14, lineHeight: '21px',
                          color: 'var(--nv-light-text-secondary)' }}>
                No analysis has been started. This company uses{' '}
                <strong>{framework === '5w1h' ? '5W1H' : 'five whys'}</strong>, and the
                framework is fixed once the analysis begins.
              </p>
              <button type="button" style={primary} onClick={() => void beginRootCause()}>
                Start the analysis
              </button>
            </section>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" style={primary} onClick={() => void beginRaise()}>
              Raise a deviation
            </button>
            <span style={{ fontSize: 13, color: 'var(--nv-light-text-secondary)' }}>
              Raising against a batch, a lot or an instrument happens from that record,
              so its context is filled in.
            </span>
          </div>

          {loading ? (
            <p style={empty}>Loading the register…</p>
          ) : (
            <DeviationRegister
              rows={rows}
              includingClosed={includeClosed}
              layout={layout}
              onOpen={setOpen}
              onToggleClosed={() => setIncludeClosed((v) => !v)}
            />
          )}
        </>
      )}

      {/*  OVER the page, never instead of it. */}
      {raising && (
        <div style={scrim} role="presentation">
          <RaiseDeviationSheet
            presentation={layout === 'phone' ? 'fullscreen' : 'sheet'}
            draft={draft}
            onChange={setDraft}
            attempted={attempted}
            context={[
              { key: 'scope', label: 'Raised against', value: 'The process' },
            ]}
            sourceLabel={null}
            impactOptions={options}
            onRaise={() => void submit()}
            onCancel={() => setRaising(false)}
          />
        </div>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

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
  color: 'var(--nv-light-text-primary)',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
};

const primary: CSSProperties = {
  alignSelf: 'flex-start', minHeight: 48, padding: '0 20px', borderRadius: 10,
  background: 'var(--nv-light-action-bg)', border: '1px solid var(--nv-light-action-bg)',
  color: '#ffffff',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 15, cursor: 'pointer',
};

const startCard: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
  padding: 18, borderRadius: 12,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const scrim: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 60,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: 24, overflowY: 'auto',
  background: 'rgba(13, 25, 51, 0.42)',
};
