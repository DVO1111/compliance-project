/**
 * Goods receipt — booking a delivery in, and the first gate it meets.
 *
 * DB-02 makes this the Storekeeper's primary action: the one filled
 * button on the whole screen is "Create GRN", and the rail lists Goods
 * receipt directly under Overview. The route opened a "not built"
 * panel.
 *
 * ── THE UPSTREAM DEPENDENCY THIS SCREEN EXISTS TO HONOUR ──
 *
 * You cannot receive material from a supplier who has been suspended
 * or disqualified. That is not a rule this form implements — it is
 * fn_material_lots_supplier_gate, a BEFORE INSERT trigger, and it
 * fires whether the insert comes from here, from a script or from a
 * raw PostgREST call.
 *
 * So the form does not pre-filter the supplier list to the ones that
 * will be accepted. A storekeeper has a delivery note in their hand
 * with a supplier's name on it; a picker that silently omitted that
 * name would leave them hunting for it, concluding the system is
 * missing data, and booking the lot against the wrong supplier to get
 * the work done. Instead every supplier is listed with its standing
 * shown, and an attempt against a blocked one is refused by the
 * database with a message that names the supplier and the reason.
 *
 * 'pending' is deliberately accepted — the gate's own comment explains
 * why, and it is worth repeating here because it looks like a hole:
 * refusing receipt from an un-assessed supplier would stop a company
 * entering its existing stock on the day it starts using the system.
 * Qualification becomes something they work through rather than a wall
 * on arrival.
 *
 * ── WHAT THE FORM DOES NOT SEND ──
 *
 * The lot number. It belongs to the company's numbering format and is
 * issued by fn_material_lots_defaults; a client that invented one
 * would be the thing that breaks the sequence. The received lot comes
 * back numbered, dated, and already in quarantine — which is the next
 * screen's problem, not this one's.
 */

import { useCallback, useEffect, useState } from 'react';
import SectionNotReady from '../Common/SectionNotReady';
import StateBadge from '../Common/StateBadge';
import {
  listLots, listMaterials, listSuppliers, receiveLot,
  type MaterialLotRow,
} from '../../lib/materials/materialLotService';
import {
  mayReceive as roleMayReceive, supplierStanding, receiptComplete, receiptConfirmation,
} from '../../lib/materials/receiptRules';
import type { WorkRole } from '../../lib/access/permissionRequests';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

export interface GoodsReceiptPageProps {
  companyId?: string | null;
  role: WorkRole | null;
}

interface Material { id: string; code: string | null; name: string | null; unit_of_measure: string | null }
interface Supplier { id: string; name: string | null; qualification_status: string | null }

export default function GoodsReceiptPage({ companyId, role }: GoodsReceiptPageProps) {
  const [recent, setRecent] = useState<MaterialLotRow[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const [materialId, setMaterialId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [batchNo, setBatchNo] = useState('');

  const mayReceive = roleMayReceive(role);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('material_lots').select('id').limit(1);
      setReady(!error);
      if (!error) {
        const [lots, mats, sups] = await Promise.all([
          listLots(companyId, { limit: 15 }),
          listMaterials(companyId),
          listSuppliers(companyId),
        ]);
        setRecent(lots); setMaterials(mats); setSuppliers(sups);
      }
    } catch (err) {
      //  HS-07. A load that fails for any reason other than the table
      //  being absent — a refused policy, a dropped connection — used
      //  to leave the page on its spinner with nothing said. Plain
      //  words, nothing lost, and the list stays as it was.
      logger.error('[goods-receipt] load failed', err);
      setNotice({ tone: 'bad', text:
        'Could not load this page just now. Nothing has been lost — try again in a moment.' });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const qty = Number(quantity);
  const complete = receiptComplete(materialId, quantity);

  const submit = useCallback(async () => {
    if (!companyId || !complete) return;
    setBusy(true);
    setNotice(null);
    const chosen = materials.find((m) => m.id === materialId);
    const result = await receiveLot({
      companyId,
      materialId,
      supplierId: supplierId || null,
      quantity: qty,
      unitOfMeasure: chosen?.unit_of_measure ?? null,
      supplierBatchNumber: batchNo.trim() || null,
    });
    setBusy(false);

    if (!result.ok) {
      //  Verbatim. The gate's message names the supplier and why it
      //  refused; "could not save" would throw that away and leave
      //  somebody guessing at a qualification problem.
      setNotice({ tone: 'bad', text: result.message });
      return;
    }

    setNotice({
      tone: 'ok',
      text: receiptConfirmation(String(result.data.lot_number)),
    });
    setMaterialId(''); setSupplierId(''); setQuantity(''); setBatchNo('');
    await load();
  }, [companyId, complete, materialId, supplierId, qty, batchNo, materials, load]);

  if (!companyId) {
    return <p style={empty}>Goods receipt belongs to a workspace. Finish setting one up
      and it appears here.</p>;
  }

  if (ready === false) {
    return (
      <SectionNotReady
        section="Goods receipt"
        whatItWillShow={'Booking a delivery in against its supplier, raising the lot and '
          + 'putting it into quarantine will happen here.'}
      />
    );
  }

  return (
    <div style={col}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 19 }}>Goods receipt</h2>
        <span style={sub}>
          Booking a delivery in raises the lot and puts it straight into quarantine.
          It cannot be issued until QA has released it.
        </span>
      </header>

      {notice && <p style={noticeStyle(notice.tone)} role="status">{notice.text}</p>}

      {!mayReceive ? (
        <p style={noteStyle}>
          Booking deliveries in is a Storekeeper task. Recent receipts are below.
        </p>
      ) : (
        <section style={card}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Book a delivery in</h3>

          <label style={labelStyle}>
            Material
            <select style={input} value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}>
              <option value="">Choose a material…</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {[m.code, m.name].filter(Boolean).join(' · ') || m.id}
                </option>
              ))}
            </select>
            {materials.length === 0 && !loading && (
              <span style={hint}>
                No materials are registered yet. A receipt has to be booked against one.
              </span>
            )}
          </label>

          <label style={labelStyle}>
            Supplier
            <select style={input} value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Not stated</option>
              {suppliers.map((s) => {
                const st = supplierStanding(s.qualification_status);
                return (
                  <option key={s.id} value={s.id}>
                    {s.name ?? s.id} — {st.label}
                  </option>
                );
              })}
            </select>
            {/*  Every supplier is listed, blocked ones included, with
                 the reason visible. See the header. */}
            <span style={hint}>
              A suspended or disqualified supplier will be refused when you save, and the
              refusal will say which.
            </span>
          </label>

          <div style={twoCol}>
            <label style={labelStyle}>
              Quantity
              <input style={input} value={quantity} inputMode="decimal"
                onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 400" />
            </label>
            <label style={labelStyle}>
              Supplier batch number
              <input style={input} value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)} placeholder="From the delivery note" />
            </label>
          </div>

          <button type="button" style={{ ...primary, opacity: complete && !busy ? 1 : 0.5 }}
            disabled={!complete || busy} onClick={() => void submit()}>
            {busy ? 'Saving…' : 'Create GRN'}
          </button>
          {!complete && (
            <span style={hint}>A material and a quantity above zero are both required.</span>
          )}
        </section>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Recent receipts</h3>
        {loading && <p style={empty}>Loading…</p>}
        {!loading && recent.length === 0 && (
          <p style={empty}>Nothing has been received yet.</p>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {recent.map((l) => (
            <li key={l.id} style={row}>
              <span style={{ fontWeight: 600, minWidth: 0 }}>{l.lot_number}</span>
              <span style={{ fontSize: 13, color: '#5b6472', flex: 1, minWidth: 0 }}>
                {l.quantity_received} {l.unit_of_measure}
                {l.supplier_batch_number ? ` · ${l.supplier_batch_number}` : ''}
              </span>
              <span style={{ fontSize: 13, color: '#5b6472' }}>
                {new Date(l.received_date).toLocaleDateString('en-GB')}
              </span>
              <StateBadge state={l.status === 'quarantine' ? 'quarantine'
                : l.status === 'approved' ? 'released'
                : l.status === 'rejected' ? 'rejected' : 'pending'}>
                {String(l.status ?? '').replace(/_/g, ' ')}
              </StateBadge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const col: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0,
};
const sub: React.CSSProperties = { fontSize: 14, color: '#5b6472', lineHeight: '21px' };
const empty: React.CSSProperties = {
  margin: 0, padding: '16px 0', fontSize: 15, lineHeight: '23px', color: '#5b6472',
};
const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e3e6eb', borderRadius: 12,
  padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
};
const twoCol: React.CSSProperties = {
  display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
};
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13.5, fontWeight: 600,
  minWidth: 0,
};
const input: React.CSSProperties = {
  border: '1px solid #d9dde4', borderRadius: 8, padding: '9px 11px',
  fontSize: 14, fontWeight: 400, font: 'inherit', minWidth: 0, width: '100%',
};
const hint: React.CSSProperties = { fontSize: 12.5, fontWeight: 400, color: '#5b6472' };
const primary: React.CSSProperties = {
  border: 'none', borderRadius: 9, background: '#12A05A', color: '#fff',
  padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  alignSelf: 'flex-start',
};
const row: React.CSSProperties = {
  display: 'flex', gap: 14, alignItems: 'center',
  border: '1px solid #e3e6eb', borderRadius: 10, background: '#fff',
  padding: '11px 14px', fontSize: 14, minWidth: 0,
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
