/**
 * W4·19 — In-process control, as a page.
 *
 * WHAT THIS PAGE IS, AND WHAT IT DELIBERATELY IS NOT.
 *
 * W4·19 has two halves. The operator half — ReadingEntry, the keypad,
 * the zone gauge, the sampling prompt — is a FLOOR screen: it only
 * means anything with a batch, a stage and a parameter already chosen,
 * because the limits, the zone bands and the sampling interval all
 * come from that context. Lifting it into a nav item would mean asking
 * somebody to pick a batch from a dropdown before they can type a
 * weight, which is not how anybody uses it. It belongs on the batch,
 * reached from Batch Execution, and that is where it will go.
 *
 * The supervisor half is a QUEUE, and a queue is a page. An
 * out-of-specification reading is escalated by the operator and waits
 * for somebody who can decide; the person deciding is not standing at
 * the press, and arrives looking for "what is waiting for me". That is
 * this screen.
 *
 * It also carries the zone key, because the first question anybody
 * asks about a zone label is what the zones are, and the answer is a
 * property of the product rather than of the reading.
 */

import { useCallback, useEffect, useState } from 'react';
import SupervisorDecision from './SupervisorDecision';
import { ZoneKeyCard } from './ZoneChip';
import SectionNotReady from '../Common/SectionNotReady';
import {
  listEscalations, decideEscalation, zoneKey,
} from '../../lib/pharma/inprocessService';
import type { OosEscalation, OosDecision, StageReading } from '../../lib/pharma/inprocessModel';
import { ACTION_LABEL, type ZoneBand } from '../../lib/inprocess/zones';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

export interface InprocessPageProps {
  companyId?: string | null;
  userId?: string | null;
  /** Whether this viewer may decide an escalation. The queue is shown
   *  either way — seeing what is waiting is not privileged — and the
   *  decision controls are not. */
  canDecide?: boolean;
}

/** An escalation with the reading it was raised against. The queue is
 *  unreadable without the reading: "escalation 4f2a" tells nobody
 *  anything, "641 mg on check 14, zone 3U" tells them everything. */
interface Waiting {
  escalation: OosEscalation;
  reading: StageReading | null;
}

export default function InprocessPage({ companyId, userId, canDecide = false }: InprocessPageProps) {
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [bands, setBands] = useState<ZoneBand[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    //  Asked directly: listEscalations returns [] both for a quiet
    //  shift and for a database without the table, and on a floor
    //  screen those must not look the same. An empty queue says
    //  "nothing is waiting for you", which is a statement somebody
    //  acts on by going home.
    const { error } = await supabase
      .from('inprocess_oos_escalations').select('id').limit(1);
    setReady(!error);
    if (error) { setLoading(false); return; }

    const open = await listEscalations(companyId, { openOnly: true });
    const rows: Waiting[] = [];
    for (const e of open) {
      //  One read per escalation rather than a join, because the queue
      //  is short by construction — an out-of-specification reading
      //  that nobody has decided is not meant to accumulate.
      const { data, error: rErr } = await supabase
        .from('batch_stage_parameter_readings')
        .select('*')
        .eq('id', e.reading_id)
        .maybeSingle();
      if (rErr) logger.error('[inprocess] reading for escalation failed', { id: e.id, error: rErr });
      rows.push({ escalation: e, reading: (data as StageReading | null) ?? null });
    }
    setWaiting(rows);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  //  The zone key is per PRODUCT, and a reading carries its stage, not
  //  its product — so it is resolved through the stage's batch. Taken
  //  from the first escalation rather than from a picker: somebody
  //  looking at this queue is looking at these readings, not browsing
  //  products.
  useEffect(() => {
    const first = waiting.find((w) => w.reading?.batch_stage_id);
    if (!first?.reading) { setBands([]); return; }
    void (async () => {
      const { data, error } = await supabase
        .from('batch_stages')
        .select('batch_id, batch_records!inner(product_id)')
        .eq('id', first.reading!.batch_stage_id)
        .maybeSingle();
      if (error || !data) { setBands([]); return; }
      const productId = (data as { batch_records?: { product_id?: string } })
        .batch_records?.product_id;
      setBands(productId ? await zoneKey(String(productId)) : []);
    })();
  }, [waiting]);

  const decide = useCallback(async (e: OosEscalation, decision: OosDecision, reason: string) => {
    if (!companyId || !userId) return;
    const result = await decideEscalation(e.id, decision, reason, { userId, companyId });
    if (result && typeof result === 'object' && 'ok' in result && !result.ok) {
      setNotice(String((result as { message?: string }).message ?? 'The decision was refused.'));
      return;
    }
    setNotice('Decision recorded.');
    await load();
  }, [companyId, userId, load]);

  if (!companyId) {
    return <p style={empty}>In-process checks belong to a workspace. Finish setting one up
      and they appear here.</p>;
  }

  if (ready === false) {
    return (
      <SectionNotReady
        section="In-process control"
        whatItWillShow={
          'Readings taken during a stage, the zone each one falls in, and the '
          + 'out-of-specification results waiting for a supervisor decision will appear here.'
        }
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      {notice && <p style={noticeStyle} role="status">{notice}</p>}

      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 19 }}>Out-of-specification decisions</h2>
        <span style={{ fontSize: 14, color: '#5b6472' }}>
          Readings an operator escalated, waiting for a decision. Recording a reading
          happens on the batch, not here.
        </span>
      </header>

      {loading && <p style={empty}>Loading…</p>}

      {!loading && waiting.length === 0 && (
        <p style={empty}>
          Nothing is waiting for a decision. Escalated readings appear here as operators
          raise them.
        </p>
      )}

      {waiting.map(({ escalation, reading }) => (
        <SupervisorDecision
          key={escalation.id}
          reading={{
            parameter: reading?.parameter_name ?? 'Unknown parameter',
            value: Number(reading?.reading_value ?? 0),
            unit: reading?.unit ?? '',
            sequenceNo: Number(reading?.sequence_no ?? 0),
            //  'none' rather than null: ZoneOrNone spells "no zone" as a
            //  value, so a reading on a product with no weight limits
            //  says so instead of leaving the field absent.
            zone: reading?.weight_zone ?? 'none',
            inSpecification: reading?.in_specification ?? null,
            //  The id, not a name. The readings table stores who
            //  recorded it as a uuid, and resolving every one of them
            //  through profiles for a queue that is meant to stay short
            //  is a query per row for a label. Named properly when the
            //  queue grows a join.
            recordedBy: reading?.recorded_by ?? 'An operator',
            recordedAt: reading?.recorded_at
              ? new Date(reading.recorded_at).toLocaleString('en-GB')
              : '—',
          }}
          raisedBy={escalation.raised_by}
          raisedNote={escalation.raised_note}
          canDecide={canDecide}
          onDecide={(d, reason) => void decide(escalation, d, reason)}
        />
      ))}

      {/*  ZoneBand carries the arithmetic; the card wants the three
           strings it draws. Mapped here rather than widening the card's
           props, so the card stays a presentation component. */}
      {bands.length > 0 && (
        <ZoneKeyCard
          bands={bands.map((b) => ({
            zone: b.zone,
            boundText: b.boundText,
            actionText: ACTION_LABEL[b.action],
          }))}
        />
      )}
    </div>
  );
}

const empty: React.CSSProperties = {
  margin: 0, padding: '20px 0', fontSize: 15, lineHeight: '23px', color: '#5b6472',
};
const noticeStyle: React.CSSProperties = {
  margin: 0, background: '#eef3fb', border: '1px solid #cfe0f5', borderRadius: 10,
  padding: '11px 14px', fontSize: 14, lineHeight: '21px',
};
