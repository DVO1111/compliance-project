/**
 * Dispatch — PM-03's `Distribution` column, which had no page.
 *
 * A Storekeeper holds Act on Distribution and there was nowhere to
 * exercise it. DB-02's drawn rail carries a Dispatch item and the
 * derived rail had nothing to send it to.
 *
 * ── IT IS ALSO THE FAR END OF A TRACE ──
 *
 * Before this, a recall could be scoped backwards — batch to lots to
 * suppliers — and stopped at release. Nothing connected a released
 * batch to a customer, so "who received this batch" had no answer.
 * Each row recorded here is one.
 *
 * ── THE LIST OFFERS ONLY RELEASED BATCHES, AND THE DATABASE AGREES ──
 *
 * Dispatching a batch QA has not released is the failure the release
 * gate exists to prevent, arriving by a different door. The picker
 * shows released batches only — and that is a convenience, not the
 * control: a BEFORE INSERT trigger reads the batch's own state, which
 * is a mirror of the lifecycle engine and read-only to direct writes.
 * A caller going round this screen meets it.
 *
 * ── A DISPATCH IS A FACT, NOT A DRAFT ──
 *
 * The record says goods left the building. It cannot be edited or
 * deleted; a correction is another record. The screen says so before
 * the button rather than after it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  listDispatches, recordDispatch, type DispatchRow,
} from '../../lib/pharma/dispatchService';
import { canAct, actorsSentence } from '../../lib/access/roleAccess';
import type { WorkRole } from '../../lib/access/permissionRequests';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

export interface DispatchPageProps {
  companyId?: string | null;
  userId?: string | null;
  role?: WorkRole | null;
}

interface ReleasedBatch {
  id: string;
  batchNumber: string;
  productName: string | null;
  unit: string;
}

export default function DispatchPage({ companyId, userId, role }: DispatchPageProps) {
  const [batches, setBatches] = useState<ReleasedBatch[] | null>(null);
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [batchId, setBatchId] = useState('');
  const [destination, setDestination] = useState('');
  const [reference, setReference] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');

  const mayDispatch = role ? canAct(role, 'distribution') : false;

  const load = useCallback(async () => {
    if (!companyId) return;
    const [b, d] = await Promise.all([
      supabase.from('batch_records')
        .select('id, batch_number, product_name, unit')
        .eq('company_id', companyId)
        .eq('status', 'released')
        .order('released_at', { ascending: false })
        .limit(100),
      listDispatches(companyId),
    ]);
    if (b.error) {
      logger.error('[dispatch] released batches failed', b.error);
      setBatches([]);
      setFailure('The list of released batches could not be read.');
    } else {
      setBatches(((b.data as unknown[]) ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id),
          batchNumber: String(row.batch_number ?? ''),
          productName: (row.product_name as string | null) ?? null,
          unit: String(row.unit ?? ''),
        };
      }));
    }
    setRows(d);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const chosen = useMemo(
    () => (batches ?? []).find((b) => b.id === batchId) ?? null,
    [batches, batchId],
  );

  const missing = useMemo(() => {
    const out: string[] = [];
    if (!batchId) out.push('Choose a released batch.');
    if (destination.trim() === '') out.push('Say where it went.');
    const n = Number(quantity);
    if (quantity.trim() === '') out.push('Enter the quantity dispatched.');
    else if (!Number.isFinite(n) || n <= 0) out.push('The quantity must be greater than zero.');
    return out;
  }, [batchId, destination, quantity]);

  const submit = useCallback(async () => {
    if (!companyId || !chosen) return;
    setBusy(true); setFailure(null); setNotice(null);
    const result = await recordDispatch({
      companyId,
      batchId: chosen.id,
      destination,
      reference,
      quantity: Number(quantity),
      unit: chosen.unit || 'units',
      notes,
      userId,
    });
    setBusy(false);
    if (!result.ok) { setFailure(`${result.message} (${result.code})`); return; }
    setNotice(`Dispatch of ${chosen.batchNumber} to ${destination.trim()} recorded.`);
    setBatchId(''); setDestination(''); setReference(''); setQuantity(''); setNotes('');
    await load();
  }, [companyId, chosen, destination, reference, quantity, notes, userId, load]);

  if (!companyId) {
    return <p style={empty}>Dispatch belongs to a workspace. Finish setting one up and it
      appears here.</p>;
  }

  return (
    <div style={col}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={title}>Dispatch</h1>
        <p style={sub}>
          Where a released batch went. These records are what a recall is scoped from.
        </p>
      </header>

      {notice && <p style={good} role="status">{notice}</p>}
      {failure && <p style={bad} role="status">{failure}</p>}

      {!mayDispatch && (
        <p style={note}>
          {/*  The roles are read from the grid rather than typed out.
              This sentence said "the storekeeper and the QA officer"
              while the grid gave Act to the storekeeper alone. */}
          You can read this register but not add to it. Recording a dispatch is reserved
          to {actorsSentence('distribution')}. The database enforces that, not this
          screen.
        </p>
      )}

      {mayDispatch && (
        <section style={card}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Record a dispatch</h2>

          <label style={labelStyle}>
            Batch
            <select style={input} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">Choose a released batch…</option>
              {(batches ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchNumber}{b.productName ? ` — ${b.productName}` : ''}
                </option>
              ))}
            </select>
          </label>

          {/*  ONLY RELEASED BATCHES ARE LISTED, said rather than left to
              be inferred from a short list. An empty picker with no
              words leaves somebody unable to tell a broken screen from
              a workspace with nothing released. */}
          {batches !== null && batches.length === 0 && (
            <p style={note}>
              No batch has been released yet. Only a released batch can be dispatched, and
              the database refuses any other — so nothing is listed rather than being
              listed and refused.
            </p>
          )}

          <label style={labelStyle}>
            Destination
            <input style={input} value={destination} placeholder="Who received it"
              onChange={(e) => setDestination(e.target.value)} />
          </label>

          <label style={labelStyle}>
            Their reference
            <input style={input} value={reference} placeholder="Delivery note or order number"
              onChange={(e) => setReference(e.target.value)} />
          </label>

          <label style={labelStyle}>
            Quantity{chosen?.unit ? ` (${chosen.unit})` : ''}
            <input style={input} inputMode="decimal" value={quantity}
              onChange={(e) => setQuantity(e.target.value)} />
          </label>

          <label style={labelStyle}>
            Notes
            <input style={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          {/*  The missing things are named rather than the button being
              disabled with nothing said. */}
          {missing.map((m) => <p key={m} style={note}>{m}</p>)}

          <p style={note}>
            A dispatch record cannot be edited or deleted once written. If it turns out to
            be wrong, record a correcting dispatch — both stay, because the first one is
            what somebody acted on.
          </p>

          <button type="button" style={{ ...primary, opacity: missing.length === 0 && !busy ? 1 : 0.5 }}
            disabled={missing.length > 0 || busy} onClick={() => void submit()}>
            {busy ? 'Recording…' : 'Record dispatch'}
          </button>
        </section>
      )}

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
          {rows.length === 0 ? 'Nothing dispatched yet' : `${rows.length} dispatch${rows.length === 1 ? '' : 'es'}`}
        </h2>
        {rows.length === 0 ? (
          <p style={note}>
            Until a batch is dispatched, a trace of it stops at release — it can say the
            batch left the quality system and not where it went.
          </p>
        ) : (
          <ul style={listStyle}>
            {rows.map((r) => (
              <li key={r.id} style={row}>
                <span style={{ fontWeight: 600, minWidth: 0 }}>{r.destination}</span>
                <span style={quiet}>
                  {r.quantity} {r.unit}
                  {r.reference ? ` · ${r.reference}` : ''}
                  {` · ${new Date(r.dispatchedAt).toLocaleDateString('en-GB')}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const col: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0,
  fontFamily: 'var(--nv-font-body)',
};
const title: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 24, lineHeight: '32px', textWrap: 'balance',
};
const sub: CSSProperties = { margin: 0, fontSize: 14, lineHeight: '21px', color: '#5b6472' };
const quiet: CSSProperties = { fontSize: 13, color: '#5b6472', minWidth: 0 };
const card: CSSProperties = {
  background: '#fff', border: '1px solid #e3e6eb', borderRadius: 12,
  padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
};
const labelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13.5,
  fontWeight: 600, minWidth: 0,
};
const input: CSSProperties = {
  border: '1px solid #d9dde4', borderRadius: 8, padding: '9px 11px',
  fontSize: 15, fontWeight: 400, font: 'inherit', minWidth: 0, width: '100%',
  boxSizing: 'border-box',
};
const listStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0, listStyle: 'none',
};
const row: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  border: '1px solid #e3e6eb', borderRadius: 10, padding: '11px 14px',
  fontSize: 14, minWidth: 0,
};
const note: CSSProperties = {
  margin: 0, fontSize: 13, lineHeight: '19px', color: '#5b6472', maxWidth: '72ch',
};
const primary: CSSProperties = {
  border: 'none', borderRadius: 9, background: '#12A05A', color: '#fff',
  padding: '11px 16px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  alignSelf: 'flex-start', minHeight: 48,
};
const empty: CSSProperties = {
  margin: 0, padding: '18px 0', fontSize: 15, lineHeight: '23px', color: '#5b6472',
};
const good: CSSProperties = {
  margin: 0, borderRadius: 10, padding: '11px 14px', fontSize: 14, lineHeight: '21px',
  background: '#e4f3ea', border: '1px solid #12A05A', color: '#0d7a44',
};
const bad: CSSProperties = {
  margin: 0, borderRadius: 10, padding: '11px 14px', fontSize: 14, lineHeight: '21px',
  background: '#f3d7d2', border: '1px solid #c62f1e', color: '#b42c1d',
};
