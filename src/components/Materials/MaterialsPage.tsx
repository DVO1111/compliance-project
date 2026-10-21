/**
 * W4·15 — Materials, as a page.
 *
 * ReleaseReadinessCard and QuarantineBanner were built from the design
 * file and nothing reached them. This is the route: the lots a
 * workspace holds, and for the one you open, whether it may be
 * released and what is stopping it.
 *
 * THE READINESS LIST IS THE SCREEN, not a decoration on it. A lot is
 * released by a QA authority against six conditions, and the question
 * somebody arrives with is "why can't I release this one". So opening
 * a lot shows the conditions before anything else about the lot.
 *
 * It reads material_lot_release_conditions, which reports; it does not
 * re-derive readiness here. releaseReadiness() already fails CLOSED —
 * an empty list after a failed read would otherwise summarise as
 * "ready", which is the one wrong answer that matters.
 */

import { useCallback, useEffect, useState } from 'react';
import ReleaseReadinessCard from './ReleaseReadinessCard';
import QuarantineBanner from './QuarantineBanner';
import SectionNotReady from '../Common/SectionNotReady';
import {
  listLots, releaseReadiness, type MaterialLotRow,
} from '../../lib/materials/materialLotService';
import { readinessHeadline, type Readiness } from '../../lib/materials/releaseReadiness';
import { supabase } from '../../lib/supabase';

export interface MaterialsPageProps {
  companyId?: string | null;
}

export default function MaterialsPage({ companyId }: MaterialsPageProps) {
  const [lots, setLots] = useState<MaterialLotRow[]>([]);
  const [open, setOpen] = useState<MaterialLotRow | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    //  Asked directly, because listLots returns [] both for a workspace
    //  with no lots and for one whose table does not exist. On a
    //  compliance screen those must not look the same.
    const { error } = await supabase.from('material_lots').select('id').limit(1);
    setReady(!error);
    if (!error) setLots(await listLots(companyId, { limit: 50 }));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!open) { setReadiness(null); return; }
    void (async () => { setReadiness(await releaseReadiness(open.id)); })();
  }, [open]);

  if (!companyId) {
    return <p style={empty}>Material lots belong to a workspace. Finish setting one up
      and they appear here.</p>;
  }

  if (ready === false) {
    return (
      <SectionNotReady
        section="Materials"
        whatItWillShow={
          'Goods receipt, quarantine, sampling, QC results and the release decision for '
          + 'each lot will appear here.'
        }
      />
    );
  }

  if (open) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <button type="button" style={back} onClick={() => setOpen(null)}>
          ← All material lots
        </button>

        <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>Lot {open.lot_number}</h2>
          <span style={{ fontSize: 14, color: '#5b6472' }}>
            {open.quantity_available} {open.unit_of_measure} available
            {open.supplier_batch_number ? ` · supplier batch ${open.supplier_batch_number}` : ''}
          </span>
        </header>

        {/*  Before the conditions, because a quarantined lot is not a
            lot with outstanding conditions — it is a lot nobody may
            touch, and reading the checklist first would suggest
            otherwise. */}
        {open.status === 'quarantine' && (
          <QuarantineBanner
            since={new Date(open.received_date).toLocaleDateString('en-GB')}
            nextStep={readiness ? readinessHeadline(readiness) : undefined}
          />
        )}

        {readiness
          ? <ReleaseReadinessCard readiness={readiness} />
          : <p style={{ ...empty, padding: '10px 0' }}>Reading the release conditions…</p>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <h2 style={{ margin: 0, fontSize: 19 }}>Material lots</h2>
      {loading && <p style={empty}>Loading…</p>}
      {!loading && lots.length === 0 && (
        <p style={empty}>
          No material lots yet. They appear here as goods are received.
        </p>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {lots.map((l) => (
          <li key={l.id}>
            <button type="button" style={row} onClick={() => setOpen(l)}>
              <span style={{ fontWeight: 600, minWidth: 0 }}>{l.lot_number}</span>
              <span style={{ fontSize: 13, color: '#5b6472' }}>
                {l.quantity_available} {l.unit_of_measure}
              </span>
              <span style={{ fontSize: 13, color: '#5b6472', textTransform: 'capitalize' }}>
                {String(l.status ?? '').replace(/_/g, ' ')}
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
  width: '100%', display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between',
  border: '1px solid #e3e6eb', borderRadius: 10, background: '#fff',
  padding: '12px 14px', cursor: 'pointer', fontSize: 14, textAlign: 'left', minWidth: 0,
};
