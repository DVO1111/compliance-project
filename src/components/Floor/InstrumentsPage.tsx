/**
 * W4·18 — instruments and calibration, as a page.
 *
 * W4·18 covers three floor gates: line clearance, dispensing and
 * calibration. Two of them are already where they belong and do not
 * want a nav item of their own.
 *
 * CLEARANCE is on the batch. BatchExecutionPage draws the clearance
 * conditions above the stage strip, because a line that is not cleared
 * is not a stage problem and putting it beside the stages would read
 * as one.
 *
 * DISPENSING is a step inside executing a batch — it happens against a
 * stage, with a material and a quantity already decided. A page that
 * asked somebody to choose a batch before weighing anything would
 * invert the order of the work.
 *
 * CALIBRATION is the one that is genuinely its own list. An instrument
 * is calibrated on a schedule, by somebody who maintains instruments
 * rather than runs batches, and the question they arrive with is
 * "which of these is out of date or about to be". That is a page, and
 * this is it.
 *
 * The conditions come from instrument_conditions — the same function
 * the dispensing gate consults — so what this page shows about an
 * instrument and what the floor refuses cannot drift apart.
 */

import { useCallback, useEffect, useState } from 'react';
import { FloorNoticeList } from './FloorNotice';
import SectionNotReady from '../Common/SectionNotReady';
import { listInstruments, instrumentConditions } from '../../lib/pharma/instrumentService';
import type { Instrument } from '../../lib/pharma/instrumentModel';
import { assess, type FloorCondition } from '../../lib/floor/floorConditions';
import { supabase } from '../../lib/supabase';

export interface InstrumentsPageProps {
  companyId?: string | null;
}

export default function InstrumentsPage({ companyId }: InstrumentsPageProps) {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [open, setOpen] = useState<Instrument | null>(null);
  const [conditions, setConditions] = useState<FloorCondition[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    //  Asked directly rather than inferred from an empty list: a
    //  workspace with no instruments and a database without the table
    //  are different facts, and only one of them means "nothing to
    //  calibrate".
    const { error } = await supabase.from('instruments').select('id').limit(1);
    setReady(!error);
    if (!error) setInstruments(await listInstruments(companyId));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!open) { setConditions([]); return; }
    void (async () => { setConditions(await instrumentConditions(open.id)); })();
  }, [open]);

  if (!companyId) {
    return <p style={empty}>Instruments belong to a workspace. Finish setting one up
      and they appear here.</p>;
  }

  if (ready === false) {
    return (
      <SectionNotReady
        section="Instruments and calibration"
        whatItWillShow={
          'Each instrument, when it was last calibrated, when it is next due, and '
          + 'whether it may be used will appear here.'
        }
      />
    );
  }

  if (open) {
    const a = assess(conditions);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <button type="button" style={back} onClick={() => setOpen(null)}>
          ← All instruments
        </button>
        <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>{open.code} · {open.name}</h2>
          <span style={{ fontSize: 14, color: '#5b6472' }}>
            {open.instrument_type}
            {open.location ? ` · ${open.location}` : ''}
            {open.calibration_due_date
              ? ` · next due ${new Date(open.calibration_due_date).toLocaleDateString('en-GB')}`
              : ' · never calibrated'}
          </span>
        </header>

        {/*  Blocked before flagged, and both before anything else about
            the instrument: somebody opening this is deciding whether
            they may use it. */}
        {conditions.length > 0
          ? <FloorNoticeList conditions={a.conditions} />
          : <p style={empty}>No conditions reported against this instrument.</p>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 19 }}>Instruments</h2>
        <span style={{ fontSize: 14, color: '#5b6472' }}>
          Calibration standing. An instrument that is out of date cannot be used to
          dispense or to record a reading.
        </span>
      </header>

      {loading && <p style={empty}>Loading…</p>}
      {!loading && instruments.length === 0 && (
        <p style={empty}>No instruments yet. They appear here once they are registered.</p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {instruments.map((i) => (
          <li key={i.id}>
            <button type="button" style={row} onClick={() => setOpen(i)}>
              <span style={{ fontWeight: 600, minWidth: 0 }}>{i.code}</span>
              <span style={{ fontSize: 13, color: '#5b6472', flex: 1, minWidth: 0 }}>{i.name}</span>
              <span style={{ fontSize: 13, color: i.calibration_due_date ? '#5b6472' : '#a32626' }}>
                {i.calibration_due_date
                  ? `due ${new Date(i.calibration_due_date).toLocaleDateString('en-GB')}`
                  : 'never calibrated'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const empty: React.CSSProperties = {
  margin: 0, padding: '20px 0', fontSize: 15, lineHeight: '23px', color: '#5b6472',
};
const back: React.CSSProperties = {
  border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
  fontSize: 14, color: '#2b3038', fontWeight: 600, alignSelf: 'flex-start',
};
const row: React.CSSProperties = {
  width: '100%', display: 'flex', gap: 14, alignItems: 'center',
  border: '1px solid #e3e6eb', borderRadius: 10, background: '#fff',
  padding: '12px 14px', cursor: 'pointer', fontSize: 14, textAlign: 'left', minWidth: 0,
};
