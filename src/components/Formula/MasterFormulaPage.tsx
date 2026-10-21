/**
 * Master formula versions — where W4·16's comparison and stage
 * reordering become reachable (MF-04, MF-05).
 *
 * WHY THE COMPARISON IS THE PAGE. A master formula is the
 * manufacturing instruction a batch is made against, frozen at
 * approval. The question somebody actually arrives with is not "what
 * does version 3 say" — they can read that — but "what changed
 * between the version we made the last batch against and this one",
 * because that difference is what a change control has to justify and
 * what an inspector asks about.
 *
 * THE DIFF COMES FROM THE DATABASE, which matters more than it looks.
 * master_formula_compare() matches stages on stage_code and parameters
 * on (stage_code, parameter), so a renamed stage reads as a rename.
 * A client-side diff would match on the id, which changes when a
 * version is cloned, and every comparison would be a wall of
 * additions with nothing to see.
 *
 * REORDERING IS OFFERED ONLY ON A DRAFT, and the database refuses it
 * on anything else — a formula's stage order is the instruction a
 * batch already followed. Here the buttons are absent rather than
 * disabled on an approved version, for the same reason the closure
 * signature is absent for a non-QA viewer: a control that cannot work
 * is an invitation to an error nobody can act on.
 */

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import VersionComparison from './VersionComparison';
import {
  listVersions, listStages, compareVersions, moveStage,
  type FormulaVersion, type FormulaStage,
} from '../../lib/formula/formulaService';
import type { FormulaDifference } from './VersionComparison';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

export interface MasterFormulaPageProps {
  companyId?: string | null;
}

interface ProductRow { id: string; name: string; code: string }

export default function MasterFormulaPage({ companyId }: MasterFormulaPageProps) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productId, setProductId] = useState<string | null>(null);
  const [versions, setVersions] = useState<FormulaVersion[]>([]);
  const [stages, setStages] = useState<FormulaStage[]>([]);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [differences, setDifferences] = useState<FormulaDifference[]>([]);
  const [comparing, setComparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    void (async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, trade_name, product_code')
        .eq('company_id', companyId)
        .order('trade_name');
      if (error) {
        logger.error('[formula] products failed', { companyId, error });
        setLoading(false);
        return;
      }
      const rows = ((data as unknown[]) ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id),
          name: String(row.trade_name ?? 'Unnamed product'),
          code: String(row.product_code ?? ''),
        };
      });
      setProducts(rows);
      setProductId(rows[0]?.id ?? null);
      setLoading(false);
    })();
  }, [companyId]);

  const loadVersions = useCallback(async () => {
    if (!companyId || !productId) { setVersions([]); return; }
    const v = await listVersions(companyId, productId);
    setVersions(v);
    //  THE TWO ENDS DEFAULT TO THE TWO MOST RECENT, in the order a
    //  person reads a change: older on the left. Defaulting both to
    //  the same version would show an empty comparison that looks like
    //  "nothing changed".
    setToId(v[0]?.id ?? null);
    setFromId(v[1]?.id ?? null);
    setStages(v[0] ? await listStages(v[0].id) : []);
  }, [companyId, productId]);

  useEffect(() => { void loadVersions(); }, [loadVersions]);

  const runComparison = useCallback(async () => {
    if (!fromId || !toId) return;
    setComparing(true);
    setDifferences(await compareVersions(fromId, toId));
    setComparing(false);
  }, [fromId, toId]);

  const move = useCallback(async (stageId: string, direction: 'up' | 'down') => {
    const result = await moveStage(stageId, direction);
    if (!result.ok) { setNotice(result.message); return; }
    setNotice(null);
    if (toId) setStages(await listStages(toId));
  }, [toId]);

  if (!companyId) {
    return <p style={empty}>Master formulas belong to a workspace.</p>;
  }

  const draft = versions.find((v) => v.id === toId);
  const canReorder = draft?.status === 'draft';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <header>
        <h1 style={title}>Master formulas</h1>
        <p style={sub}>
          The manufacturing instruction a batch is made against. Comparing two versions
          is what a change control has to justify.
        </p>
      </header>

      {notice && (
        <p style={noticeStyle} role="status">
          {notice}
          <button type="button" style={dismiss} onClick={() => setNotice(null)}>Dismiss</button>
        </p>
      )}

      {loading ? (
        <p style={empty}>Loading…</p>
      ) : products.length === 0 ? (
        <p style={empty}>
          No products yet. A master formula belongs to a product, so add one first.
        </p>
      ) : (
        <>
          <label style={field}>
            <span style={fieldLabel}>Product</span>
            <select
              value={productId ?? ''}
              onChange={(e) => setProductId(e.target.value || null)}
              style={select}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `${p.code} · ${p.name}` : p.name}
                </option>
              ))}
            </select>
          </label>

          {versions.length === 0 ? (
            <p style={empty}>This product has no master formula yet.</p>
          ) : versions.length === 1 ? (
            <p style={empty}>
              Only one version exists ({versions[0].version}), so there is nothing to
              compare it with yet.
            </p>
          ) : (
            <section style={card}>
              <h2 style={{ margin: 0, fontWeight: 600, fontSize: 17 }}>Compare versions</h2>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <label style={field}>
                  <span style={fieldLabel}>From</span>
                  <select value={fromId ?? ''} onChange={(e) => setFromId(e.target.value)}
                          style={select}>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>{v.version} · {v.status}</option>
                    ))}
                  </select>
                </label>
                <label style={field}>
                  <span style={fieldLabel}>To</span>
                  <select value={toId ?? ''} onChange={(e) => setToId(e.target.value)}
                          style={select}>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>{v.version} · {v.status}</option>
                    ))}
                  </select>
                </label>
                <button type="button" style={primary} onClick={() => void runComparison()}>
                  {comparing ? 'Comparing…' : 'Compare'}
                </button>
              </div>

              {fromId === toId && (
                <p style={{ margin: 0, fontSize: 13, lineHeight: '19px',
                            color: 'var(--nv-light-text-secondary)' }}>
                  Both ends are the same version, so there is nothing to compare.
                </p>
              )}
            </section>
          )}

          {differences.length > 0 && fromId && toId && (
            <VersionComparison
              fromVersion={versions.find((v) => v.id === fromId)?.version ?? '—'}
              toVersion={versions.find((v) => v.id === toId)?.version ?? '—'}
              differences={differences}
            />
          )}

          {stages.length > 0 && (
            <section style={card}>
              <h2 style={{ margin: 0, fontWeight: 600, fontSize: 17 }}>
                Stages of {draft?.version ?? 'this version'}
              </h2>
              {!canReorder && (
                <p style={{ margin: 0, fontSize: 13, lineHeight: '19px',
                            color: 'var(--nv-light-text-secondary)' }}>
                  This version is {draft?.status ?? 'not a draft'}, so its stage order is
                  fixed — it is the instruction batches were made against.
                </p>
              )}
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 8,
                           margin: 0, padding: 0, listStyle: 'none' }}>
                {stages.map((s, i) => (
                  <li key={s.id} style={stageRow}>
                    <span style={seq}>{s.sequenceNo}</span>
                    <span style={{ flex: 1, minWidth: 140 }}>
                      <strong style={{ fontWeight: 600 }}>{s.stageCode}</strong> · {s.name}
                    </span>
                    {/*  Absent on an approved version, not disabled. */}
                    {canReorder && (
                      <span style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button" style={move_} aria-label={`Move ${s.name} up`}
                          onClick={() => void move(s.id, 'up')}
                          hidden={i === 0}
                        >↑</button>
                        <button
                          type="button" style={move_} aria-label={`Move ${s.name} down`}
                          onClick={() => void move(s.id, 'down')}
                          hidden={i === stages.length - 1}
                        >↓</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const title: CSSProperties = {
  margin: '0 0 4px', fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 24, lineHeight: '32px', color: 'var(--nv-light-text-primary)',
};

const sub: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-body)', fontSize: 14, lineHeight: '21px',
  color: 'var(--nv-light-text-secondary)', maxWidth: '70ch',
};

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
  padding: 18, borderRadius: 12,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const field: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180,
  fontFamily: 'var(--nv-font-body)',
};

const fieldLabel: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 10, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--nv-light-text-tertiary)',
};

const select: CSSProperties = {
  minHeight: 44, padding: '0 10px', borderRadius: 8,
  border: '1px solid var(--nv-light-border)', background: 'var(--nv-light-surface)',
  color: 'var(--nv-light-text-primary)', fontFamily: 'var(--nv-font-body)', fontSize: 15,
};

const primary: CSSProperties = {
  alignSelf: 'flex-end', minHeight: 44, padding: '0 18px', borderRadius: 8,
  background: 'var(--nv-light-action-bg)', border: '1px solid var(--nv-light-action-bg)',
  color: '#ffffff', fontFamily: 'var(--nv-font-body)', fontWeight: 600,
  fontSize: 15, cursor: 'pointer',
};

const stageRow: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
  minHeight: 48, padding: '8px 12px', borderRadius: 8,
  background: 'var(--nv-light-surface-sunken)', fontSize: 14,
};

const seq: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 12,
  color: 'var(--nv-light-text-tertiary)', minWidth: 20,
};

const move_: CSSProperties = {
  width: 36, height: 36, borderRadius: 8, cursor: 'pointer',
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)', fontSize: 15, lineHeight: 1,
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
