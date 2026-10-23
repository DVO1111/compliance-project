/**
 * Traceability — forward from a lot, backward from a batch.
 *
 * Listed on both dashboards and in both rails; the route opened a
 * "not built" panel. W5·13 (Genealogy trace) has a page in the Figma
 * file that was never implemented and no function in the schema, so
 * this is built from the relationships that do exist: dispensing
 * records link a lot to a batch stage, and a stage to its batch.
 *
 * ── THE TWO QUESTIONS, AND WHY BOTH DIRECTIONS MATTER ──
 *
 * Forward is the recall question: this lot turned out to be bad, where
 * did it go. Backward is the investigation question: this batch is in
 * trouble, what did we put in it. They are not the same query read
 * two ways — one starts from a material and one from a product — so
 * the screen asks which you have before it asks for an identifier.
 *
 * ── THE LIMIT IS ON THE SCREEN, NOT JUST IN A COMMENT ──
 *
 * This traces through DISPENSING only. A lot consumed some other way
 * leaves no dispensing record and will not appear. On a traceability
 * screen that gap is the difference between "nothing used this lot"
 * and "nothing we can see used this lot", and somebody deciding the
 * scope of a recall needs to know which they are reading.
 *
 * A failed read says so rather than rendering an empty result, for the
 * same reason: an empty genealogy is a finding, and a genealogy that
 * failed to load is not.
 */

import { useCallback, useState } from 'react';
import StateBadge from '../Common/StateBadge';
import { batchesFromLot, lotsInBatch, traceSummary, tracedQuantity, type TraceLink } from '../../lib/materials/traceService';
import { listLots, type MaterialLotRow } from '../../lib/materials/materialLotService';
import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import SectionNotReady from '../Common/SectionNotReady';

export interface TraceabilityPageProps {
  companyId?: string | null;
}

type Direction = 'forward' | 'backward';

interface BatchOption { id: string; batch_number: string | null }

export default function TraceabilityPage({ companyId }: TraceabilityPageProps) {
  const [direction, setDirection] = useState<Direction>('forward');
  const [lots, setLots] = useState<MaterialLotRow[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [subject, setSubject] = useState('');
  const [links, setLinks] = useState<TraceLink[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    void (async () => {
      const { error } = await supabase.from('dispensing_records').select('id').limit(1);
      setReady(!error);
      if (error) return;
      const [l, b] = await Promise.all([
        listLots(companyId, { limit: 100 }),
        supabase.from('batch_records').select('id, batch_number')
          .eq('company_id', companyId).limit(100),
      ]);
      setLots(l);
      setBatches(((b.data ?? []) as BatchOption[]));
    })();
  }, [companyId]);

  const run = useCallback(async () => {
    if (!subject) return;
    setBusy(true); setLinks(null); setFailed(false);
    const result = direction === 'forward'
      ? await batchesFromLot(subject)
      : await lotsInBatch(subject);
    setBusy(false);
    if (!result.ok) { setFailed(true); return; }
    setLinks(result.links);
  }, [direction, subject]);

  if (!companyId) {
    return <p style={empty}>Traceability belongs to a workspace. Finish setting one up
      and it appears here.</p>;
  }

  if (ready === false) {
    return (
      <SectionNotReady
        section="Traceability"
        whatItWillShow={'Tracing a lot forward into the batches that used it, and a batch '
          + 'back to the materials that went into it, will happen here.'}
      />
    );
  }

  return (
    <div style={col}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 19 }}>Traceability</h2>
        <span style={sub}>
          Forward from a material lot into the batches that used it, or backward from a
          batch to the materials that went into it.
        </span>
      </header>

      <section style={card}>
        <div role="radiogroup" aria-label="Direction" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {([
            ['forward', 'This lot went where?'],
            ['backward', 'What went into this batch?'],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" role="radio" aria-checked={direction === key}
              style={{ ...choice, ...(direction === key ? choiceOn : null) }}
              onClick={() => { setDirection(key); setSubject(''); setLinks(null); setFailed(false); }}>
              {label}
            </button>
          ))}
        </div>

        {/*  AN EMPTY SELECT SAYS NOTHING. On a workspace with no lots or
            no batches this was a dropdown holding one disabled line and
            a Trace button that could never be pressed, which reads as a
            broken page rather than an empty one. Same fix as the
            specifications screen. */}
        {(direction === 'forward' ? lots.length : batches.length) === 0 ? (
          <p style={noteStyle}>
            {direction === 'forward'
              ? 'No material lots have been received yet. A forward trace starts from a lot, so book a delivery in under Goods receipt first.'
              : 'No batch records exist yet. A backward trace starts from a batch, so one has to be initiated under Batch execution first.'}
          </p>
        ) : (
          <>
            <label style={labelStyle}>
              {direction === 'forward' ? 'Material lot' : 'Batch'}
              <select style={input} value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">Choose one…</option>
                {direction === 'forward'
                  ? lots.map((l) => <option key={l.id} value={l.id}>{l.lot_number}</option>)
                  : batches.map((b) => <option key={b.id} value={b.id}>{b.batch_number ?? b.id}</option>)}
              </select>
            </label>

            <button type="button" style={{ ...primary, opacity: subject && !busy ? 1 : 0.5 }}
              disabled={!subject || busy} onClick={() => void run()}>
              {busy ? 'Tracing…' : 'Trace'}
            </button>
          </>
        )}
      </section>

      {failed && (
        <p style={bad} role="status">
          The trace could not be read. This is not the same as finding nothing — do not
          treat it as a clear result.
        </p>
      )}

      {links !== null && links.length > 0 && (() => {
        const sum = traceSummary(links);
        const qty = tracedQuantity(links);
        return (
          <section style={{ ...card, borderColor: sum.released.length > 0 ? '#c62f1e' : '#e3e6eb' }}>
            {/*  THE URGENT PART FIRST. A released batch may have left
                the site; everything else can be held where it stands,
                and that is the difference between a recall and a stock
                hold. A flat list of batch numbers does not make it. */}
            <h3 style={{ margin: 0, fontSize: 16 }}>
              {sum.released.length > 0
                ? `${sum.released.length} released batch${sum.released.length === 1 ? '' : 'es'} — may have left the site`
                : 'Nothing in this trace has been released'}
            </h3>

            {sum.released.length > 0 && (
              <p style={{ ...noteStyle, color: '#b42c1d', fontWeight: 600 }}>
                {sum.released.join(' · ')}
              </p>
            )}

            {sum.held.length > 0 && (
              <p style={noteStyle}>
                Still inside the quality system: {sum.held.join(' · ')}
              </p>
            )}

            <p style={noteStyle}>
              {sum.batches} batch{sum.batches === 1 ? '' : 'es'} · {sum.lots} lot
              {sum.lots === 1 ? '' : 's'}
              {qty ? ` · ${qty.amount} ${qty.unit} dispensed` : ' · quantity not fully recorded'}
            </p>

            {/*  Upstream. A backward trace that stops at our own lot
                number traces to a shelf, not to somebody who can be
                telephoned. */}
            {sum.suppliers.length > 0 && (
              <p style={noteStyle}>Supplied by: {sum.suppliers.join(' · ')}</p>
            )}
          </section>
        );
      })()}

      {links !== null && (
        <section style={card}>
          <h3 style={{ margin: 0, fontSize: 16 }}>
            {links.length === 0
              ? 'No dispensing records link this one to anything'
              : `${links.length} link${links.length === 1 ? '' : 's'}`}
          </h3>

          {links.length === 0 && (
            <p style={noteStyle}>
              Nothing has been dispensed against it. That is the whole of what this screen
              can see — see the note below.
            </p>
          )}

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {links.map((l, i) => (
              <li key={`${l.batchId}-${l.lotId}-${i}`} style={row}>
                <span style={{ fontWeight: 600, minWidth: 0 }}>
                  {direction === 'forward' ? (l.batchNumber ?? l.batchId) : (l.lotNumber ?? l.lotId)}
                </span>
                <span style={{ fontSize: 13, color: '#5b6472', flex: 1, minWidth: 0 }}>
                  {l.quantity != null && l.unit ? `${l.quantity} ${l.unit} · ` : ''}
                  {l.dispensedAt
                    ? `dispensed ${new Date(l.dispensedAt).toLocaleDateString('en-GB')}`
                    : 'dispensing date not recorded'}
                  {direction === 'forward' && l.productName ? ` · ${l.productName}` : ''}
                  {direction === 'backward' && l.supplierName
                    ? ` · ${l.supplierName}${l.supplierLotNumber ? ` (${l.supplierLotNumber})` : ''}`
                    : ''}
                </span>
                {direction === 'forward' && l.batchStatus && (
                  <StateBadge state={l.batchStatus === 'released' ? 'released'
                    : l.batchStatus === 'rejected' ? 'rejected' : 'pending'}>
                    {l.batchStatus.replace(/_/g, ' ')}
                  </StateBadge>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*  ON THE SCREEN, NOT ONLY IN A COMMENT. Somebody scoping a
           recall has to know what this cannot see. */}
      <p style={noteStyle}>
        This traces through dispensing records only. Material consumed another way —
        reworked, sampled to destruction, or transferred between sites — leaves no
        dispensing record and will not appear here.
      </p>

      {/*  THE OTHER END OF THE TRACE, AND IT DOES NOT EXIST. Nothing
          in this schema links a released batch to where it went: the
          shipments table carries senders, recipients and countries and
          has no batch at all. A trace can say a batch was released and
          cannot say to whom. */}
      <p style={noteStyle}>
        It also stops at release. No record here links a released batch to a customer or a
        consignment, so a trace can tell you a batch left the quality system and not where
        it went.
      </p>
    </div>
  );
}

const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 };
const sub: React.CSSProperties = { fontSize: 14, color: '#5b6472', lineHeight: '21px' };
const empty: React.CSSProperties = {
  margin: 0, padding: '18px 0', fontSize: 15, lineHeight: '23px', color: '#5b6472',
};
const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e3e6eb', borderRadius: 12,
  padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
};
const row: React.CSSProperties = {
  display: 'flex', gap: 14, alignItems: 'center',
  border: '1px solid #e3e6eb', borderRadius: 10, background: '#fff',
  padding: '11px 14px', fontSize: 14, minWidth: 0,
};
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13.5, fontWeight: 600, minWidth: 0,
};
const input: React.CSSProperties = {
  border: '1px solid #d9dde4', borderRadius: 8, padding: '9px 11px',
  fontSize: 14, fontWeight: 400, font: 'inherit', minWidth: 0, width: '100%',
};
const choice: React.CSSProperties = {
  border: '1px solid #d9dde4', borderRadius: 999, background: '#fff', color: '#5b6472',
  padding: '7px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', font: 'inherit',
};
const choiceOn: React.CSSProperties = {
  borderColor: '#1d2433', color: '#1d2433', background: '#f3f5f8',
};
const primary: React.CSSProperties = {
  border: 'none', borderRadius: 9, background: '#12A05A', color: '#fff',
  padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start',
};
const noteStyle: React.CSSProperties = {
  margin: 0, fontSize: 13, lineHeight: '19px', color: '#5b6472',
};
const bad: React.CSSProperties = {
  margin: 0, borderRadius: 10, padding: '11px 14px', fontSize: 14, lineHeight: '21px',
  background: '#f3d7d2', border: '1px solid #c62f1e', color: '#b42c1d',
};
