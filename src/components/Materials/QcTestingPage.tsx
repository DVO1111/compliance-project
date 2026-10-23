/**
 * QC testing — the middle link between receiving a lot and releasing
 * it.
 *
 * Stage 03 on both dashboards, "Laboratory analysis". The rail lists
 * it and the route opened a "not built" panel. With goods receipt and
 * QA disposition built, this completes the chain the whole product is
 * about: received → tested → dispositioned → available to production.
 *
 * ── WHY THIS SCREEN CANNOT DECIDE ANYTHING ──
 *
 * The pass or fail verdict belongs to material_test_record_result,
 * which compares the value against the specification limit. This page
 * sends a number and reads back a verdict; it never computes one. A
 * screen that decided a pass itself could disagree with the stored
 * record, and on a QC result that disagreement IS the finding.
 *
 * Likewise it does not decide whether the lot may now be released —
 * material_lot_release_conditions does, and the QA disposition screen
 * reads it. This one reports testing and stops there.
 *
 * ── THE LIST IS BUILT FROM THE DEFINITIONS ──
 *
 * Not from the results. A list of what has been recorded shows a lot
 * nobody has tested as having nothing outstanding, which makes an
 * untested lot look finished — the most dangerous way to get this
 * screen wrong. Every required test is listed whether or not anyone
 * has touched it.
 */

import { useCallback, useEffect, useState } from 'react';
import SectionNotReady from '../Common/SectionNotReady';
import StateBadge from '../Common/StateBadge';
import {
  listLots, listSampling, listTestDefinitions, listTestResults,
  recordSampling, recordTestResult,
  type MaterialLotRow, type SamplingRow,
  type TestDefinitionRow, type TestResultRow,
} from '../../lib/materials/materialLotService';
import {
  mayRecordResults, testLines, testingHeadline, resultComplete,
} from '../../lib/materials/qcRules';
import type { WorkRole } from '../../lib/access/permissionRequests';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

export interface QcTestingPageProps {
  companyId?: string | null;
  role: WorkRole | null;
}

export default function QcTestingPage({ companyId, role }: QcTestingPageProps) {
  const [lots, setLots] = useState<MaterialLotRow[]>([]);
  const [open, setOpen] = useState<MaterialLotRow | null>(null);
  const [definitions, setDefinitions] = useState<TestDefinitionRow[]>([]);
  const [results, setResults] = useState<TestResultRow[]>([]);
  const [sampling, setSampling] = useState<SamplingRow[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const [defId, setDefId] = useState('');
  const [value, setValue] = useState('');
  const [text, setText] = useState('');

  const mayRecord = mayRecordResults(role);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('material_lots').select('id').limit(1);
      setReady(!error);
      if (!error) {
        const [all, defs] = await Promise.all([
          listLots(companyId, { limit: 100 }),
          listTestDefinitions(companyId),
        ]);
        //  Quarantine is the testing window: received, not yet
        //  dispositioned. A released or rejected lot has been decided.
        setLots(all.filter((l) => l.status === 'quarantine'));
        setDefinitions(defs);
      }
    } catch (err) {
      //  HS-07. A load that fails for any reason other than the table
      //  being absent — a refused policy, a dropped connection — used
      //  to leave the page on its spinner with nothing said. Plain
      //  words, nothing lost, and the list stays as it was.
      logger.error('[qc-testing] load failed', err);
      setNotice({ tone: 'bad', text:
        'Could not load this page just now. Nothing has been lost — try again in a moment.' });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const loadLot = useCallback(async (lotId: string) => {
    const [res, samp] = await Promise.all([listTestResults(lotId), listSampling(lotId)]);
    setResults(res); setSampling(samp);
  }, []);

  useEffect(() => {
    if (!open) { setResults([]); setSampling([]); return; }
    void loadLot(open.id);
  }, [open, loadLot]);

  const submitResult = useCallback(async () => {
    if (!open || !resultComplete(defId, value, text)) return;
    setBusy(true); setNotice(null);
    const result = await recordTestResult({
      lotId: open.id,
      testDefinitionId: defId,
      actualValue: value.trim() === '' ? null : Number(value),
      actualText: text.trim() === '' ? null : text.trim(),
    });
    setBusy(false);
    if (!result.ok) { setNotice({ tone: 'bad', text: result.message }); return; }
    setDefId(''); setValue(''); setText('');
    //  Re-read rather than assume: the verdict is the database's and
    //  the only way to know it is to ask.
    await loadLot(open.id);
    setNotice({ tone: 'ok', text: 'Result recorded. The verdict is set against the specification.' });
  }, [open, defId, value, text, loadLot]);

  const sample = useCallback(async () => {
    if (!open) return;
    setBusy(true); setNotice(null);
    //  One container of one is the smallest honest record. The real
    //  sampling plan belongs on MT-05, which is not built; this exists
    //  so a lot can reach testing at all.
    const result = await recordSampling({
      lotId: open.id, containersSampled: 1, containersTotal: 1,
    });
    setBusy(false);
    if (!result.ok) { setNotice({ tone: 'bad', text: result.message }); return; }
    await loadLot(open.id);
    setNotice({ tone: 'ok', text: 'Sampling recorded.' });
  }, [open, loadLot]);

  if (!companyId) {
    return <p style={empty}>QC testing belongs to a workspace. Finish setting one up
      and it appears here.</p>;
  }

  if (ready === false) {
    return (
      <SectionNotReady
        section="QC testing"
        whatItWillShow={'Lots awaiting test, the required tests for each, and the results '
          + 'against specification will appear here.'}
      />
    );
  }

  if (open) {
    const lines = testLines(definitions, results);
    const untested = definitions.filter(
      (d) => !results.some((r) => r.test_definition_id === d.id),
    );

    return (
      <div style={col}>
        <button type="button" style={back} onClick={() => { setOpen(null); setNotice(null); }}>
          ← All lots awaiting test
        </button>

        {notice && <p style={noticeStyle(notice.tone)} role="status">{notice.text}</p>}

        <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>Lot {open.lot_number}</h2>
          <span style={sub}>{testingHeadline(lines)}</span>
        </header>

        <section style={card}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Sampling</h3>
          {sampling.length === 0 ? (
            <>
              <p style={noteStyle}>
                Nothing has been sampled from this lot yet. Testing is recorded against a
                sample, so this comes first.
              </p>
              {mayRecord && (
                <button type="button" style={secondary} disabled={busy}
                  onClick={() => void sample()}>
                  Record sampling
                </button>
              )}
            </>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
              {sampling.map((s) => (
                <li key={s.id} style={{ fontSize: 13.5, color: '#5b6472' }}>
                  {s.reference} · {s.containers_sampled} of {s.containers_total} containers ·{' '}
                  {new Date(s.sampled_on).toLocaleDateString('en-GB')}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={card}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Tests</h3>
          {lines.length === 0 && (
            <p style={noteStyle}>
              No test definitions exist for this workspace yet, so nothing is required.
            </p>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {lines.map(({ definition, result, state }) => (
              <li key={definition.id} style={row}>
                <span style={{ fontWeight: 600, minWidth: 0 }}>
                  {definition.name ?? definition.code}
                </span>
                <span style={{ fontSize: 13, color: '#5b6472', flex: 1, minWidth: 0 }}>
                  {result
                    ? `${result.actual_text ?? result.actual_value ?? ''}${
                      result.specification_limit ? ` · limit ${result.specification_limit}` : ''}`
                    : definition.is_required === false ? 'optional' : 'required'}
                </span>
                {/*  The database's verdict, shown. Never recomputed. */}
                <StateBadge state={state === 'pass' ? 'released'
                  : state === 'fail' ? 'rejected' : 'pending'}>
                  {state === 'pass' ? 'Pass' : state === 'fail' ? 'Fail' : 'Outstanding'}
                </StateBadge>
              </li>
            ))}
          </ul>
        </section>

        {!mayRecord ? (
          <p style={noteStyle}>
            Recording results is a QC Analyst task. What has been tested is above.
          </p>
        ) : (
          <section style={card}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Record a result</h3>
            <label style={labelStyle}>
              Test
              <select style={input} value={defId} onChange={(e) => setDefId(e.target.value)}>
                <option value="">Choose a test…</option>
                {/*  Outstanding tests first; a completed one can still
                     be chosen, because a retest is a real thing. */}
                {[...untested, ...definitions.filter((d) => !untested.includes(d))].map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name ?? d.code}{untested.includes(d) ? '' : ' (retest)'}
                  </option>
                ))}
              </select>
            </label>
            <div style={twoCol}>
              <label style={labelStyle}>
                Measured value
                <input style={input} value={value} inputMode="decimal"
                  onChange={(e) => setValue(e.target.value)} placeholder="e.g. 99.2" />
              </label>
              <label style={labelStyle}>
                Or a description
                <input style={input} value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="e.g. white crystalline powder" />
              </label>
            </div>
            <span style={hint}>
              A number or a description — some parameters are measured and some are observed.
              The pass or fail verdict is set against the specification, not here.
            </span>
            <button type="button"
              style={{ ...primary, opacity: resultComplete(defId, value, text) && !busy ? 1 : 0.5 }}
              disabled={!resultComplete(defId, value, text) || busy}
              onClick={() => void submitResult()}>
              {busy ? 'Saving…' : 'Record result'}
            </button>
          </section>
        )}
      </div>
    );
  }

  return (
    <div style={col}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 19 }}>QC testing</h2>
        <span style={sub}>
          Lots in quarantine awaiting test. A lot cannot be released until its required
          tests pass.
        </span>
      </header>

      {loading && <p style={empty}>Loading…</p>}
      {!loading && lots.length === 0 && (
        <p style={empty}>No lot is awaiting test. Lots appear here once they are received.</p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {lots.map((l) => (
          <li key={l.id}>
            <button type="button" style={{ ...row, cursor: 'pointer', width: '100%', textAlign: 'left' }}
              onClick={() => setOpen(l)}>
              <span style={{ fontWeight: 600, minWidth: 0 }}>{l.lot_number}</span>
              <span style={{ fontSize: 13, color: '#5b6472', flex: 1, minWidth: 0 }}>
                {l.quantity_available} {l.unit_of_measure}
              </span>
              <span style={{ fontSize: 13, color: '#5b6472' }}>
                received {new Date(l.received_date).toLocaleDateString('en-GB')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 };
const sub: React.CSSProperties = { fontSize: 14, color: '#5b6472', lineHeight: '21px' };
const empty: React.CSSProperties = {
  margin: 0, padding: '18px 0', fontSize: 15, lineHeight: '23px', color: '#5b6472',
};
const back: React.CSSProperties = {
  border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
  fontSize: 14, color: '#2b3038', fontWeight: 600, alignSelf: 'flex-start',
};
const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e3e6eb', borderRadius: 12,
  padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
};
const row: React.CSSProperties = {
  display: 'flex', gap: 14, alignItems: 'center',
  border: '1px solid #e3e6eb', borderRadius: 10, background: '#fff',
  padding: '11px 14px', fontSize: 14, minWidth: 0, font: 'inherit',
};
const twoCol: React.CSSProperties = {
  display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
};
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13.5, fontWeight: 600, minWidth: 0,
};
const input: React.CSSProperties = {
  border: '1px solid #d9dde4', borderRadius: 8, padding: '9px 11px',
  fontSize: 14, fontWeight: 400, font: 'inherit', minWidth: 0, width: '100%',
};
const hint: React.CSSProperties = { fontSize: 12.5, color: '#5b6472', lineHeight: '18px' };
const primary: React.CSSProperties = {
  border: 'none', borderRadius: 9, background: '#12A05A', color: '#fff',
  padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start',
};
const secondary: React.CSSProperties = {
  border: '1px solid #d9dde4', borderRadius: 9, background: '#fff', color: '#2b3038',
  padding: '9px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start',
};
const noteStyle: React.CSSProperties = {
  margin: 0, fontSize: 13.5, lineHeight: '20px', color: '#5b6472',
};
const noticeStyle = (tone: 'ok' | 'bad'): React.CSSProperties => ({
  margin: 0, borderRadius: 10, padding: '11px 14px', fontSize: 14, lineHeight: '21px',
  background: tone === 'ok' ? '#e8f6ee' : '#f3d7d2',
  border: `1px solid ${tone === 'ok' ? '#9ed9b8' : '#c62f1e'}`,
  color: tone === 'ok' ? '#0f6b3f' : '#b42c1d',
});
