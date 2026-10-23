/**
 * Finished-product specifications — what a batch is released against.
 *
 * ── WHY THIS SCREEN HAD TO EXIST ──
 *
 * 20261113000000 refuses to release a batch without an approved,
 * versioned specification for its product. Without somewhere to write
 * one, that gate would be unsatisfiable through the interface: every
 * batch blocked, and the only route out a hand-written SQL insert.
 * A control nobody can satisfy is not a control, it is an outage.
 *
 * ── THE SHAPE IS THE DATABASE'S, NOT THIS SCREEN'S ──
 *
 * A specification is drafted, given tests, and then APPROVED, and
 * approval is the irreversible step: once effective its tests are
 * frozen and what it says cannot be rewritten. The way on is a new
 * version, which supersedes the old one going forward while the old
 * one goes on governing the batches made under it.
 *
 * That is all enforced by triggers. This page draws it so somebody can
 * see which step they are on, and says plainly what approval costs
 * before the button rather than after it.
 *
 * ── WHAT IT DOES NOT DECIDE ──
 *
 * Who may approve one. PM-03 has no column for specifications and no
 * step for approving one, so the database uses the designated QA
 * authority register — the mechanism that already approves a master
 * formula and releases a material lot. This page does not hide the
 * button from anybody: it offers it and shows the refusal as written,
 * because guessing at a rule the design does not contain is how a
 * screen comes to disagree with the thing enforcing it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  listProductSpecifications, listSpecificationTests, createDraftSpecification,
  addSpecificationTest, approveSpecification, removeSpecificationTest,
  LIMIT_TYPES, limitSummary,
  type ProductSpecification, type SpecificationTest, type LimitType,
} from '../../lib/pharma/productSpecificationService';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

export interface ProductSpecificationsPageProps {
  companyId?: string | null;
  userId?: string | null;
}

interface ProductOption { id: string; label: string }

export default function ProductSpecificationsPage(
  { companyId, userId }: ProductSpecificationsPageProps,
) {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productId, setProductId] = useState('');
  const [specs, setSpecs] = useState<ProductSpecification[]>([]);
  const [open, setOpen] = useState<ProductSpecification | null>(null);
  const [tests, setTests] = useState<SpecificationTest[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [version, setVersion] = useState('');
  const [draftTest, setDraftTest] = useState({
    test_name: '', test_method: '', unit: '',
    limit_type: 'range' as LimitType,
    min_value: '', max_value: '', expected_text: '', is_required: true,
  });

  useEffect(() => {
    if (!companyId) return;
    void (async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, trade_name, product_code')
        .eq('company_id', companyId)
        .order('trade_name');
      if (error) { logger.error('[spec] products failed', error); return; }
      setProducts(((data as unknown[]) ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id),
          label: `${String(row.trade_name ?? 'Unnamed')} (${String(row.product_code ?? '')})`,
        };
      }));
    })();
  }, [companyId]);

  const loadSpecs = useCallback(async () => {
    if (!companyId || !productId) { setSpecs([]); return; }
    setSpecs(await listProductSpecifications(companyId, productId));
  }, [companyId, productId]);

  useEffect(() => { void loadSpecs(); setOpen(null); }, [loadSpecs]);

  useEffect(() => {
    if (!open) { setTests([]); return; }
    void (async () => setTests(await listSpecificationTests(open.id)))();
  }, [open]);

  const refresh = useCallback(async (keepOpen?: string) => {
    await loadSpecs();
    if (keepOpen) setTests(await listSpecificationTests(keepOpen));
  }, [loadSpecs]);

  const requiredCount = useMemo(() => tests.filter((t) => t.is_required).length, [tests]);

  const run = useCallback(async (
    what: string,
    action: () => Promise<{ ok: true } | { ok: false; code: string; message: string }>,
  ) => {
    setBusy(true); setFailure(null); setNotice(null);
    const r = await action();
    setBusy(false);
    if (!r.ok) { setFailure(`${r.message} (${r.code})`); return false; }
    setNotice(what);
    return true;
  }, []);

  if (!companyId) {
    return <p style={empty}>Specifications belong to a workspace. Finish setting one up
      and they appear here.</p>;
  }

  return (
    <div style={col}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={title}>Finished-product specifications</h1>
        <p style={sub}>
          What a batch of this product is released against: the tests it must pass and the
          limits they are judged by.
        </p>
      </header>

      {/*  SAID BEFORE SOMEBODY HITS IT. A batch cannot be released
          without one of these, and the refusal on the release screen
          points here. */}
      <p style={note}>
        A batch cannot be released unless an approved specification was in force on the day
        it was manufactured. A batch is judged against the version in force then — not the
        current one — so a specification tightened later does not retrospectively fail
        material made to the older standard.
      </p>

      {notice && <p style={good} role="status">{notice}</p>}
      {failure && <p style={bad} role="status">{failure}</p>}

      <label style={labelStyle}>
        Product
        <select style={input} value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Choose a product…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>

      {productId && !open && (
        <>
          <section style={card}>
            <h2 style={h2}>Versions</h2>
            {specs.length === 0 ? (
              <p style={note}>
                No specification for this product yet. Until one is approved, no batch of it
                can be released.
              </p>
            ) : (
              <ul style={listStyle}>
                {specs.map((s) => (
                  <li key={s.id}>
                    <button type="button" style={row} onClick={() => setOpen(s)}>
                      <span style={{ fontWeight: 600, minWidth: 90 }}>{s.version}</span>
                      <span style={statusChip(s.status)}>{s.status}</span>
                      <span style={{ ...quiet, flex: 1 }}>
                        {s.effective_date
                          ? `In force from ${new Date(s.effective_date).toLocaleDateString('en-GB')}`
                          : 'Not approved'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={card}>
            <h2 style={h2}>Start a new version</h2>
            <label style={labelStyle}>
              Version
              <input style={input} value={version} placeholder="1.0"
                onChange={(e) => setVersion(e.target.value)} />
            </label>
            <button type="button" style={{ ...primary, opacity: version.trim() && !busy ? 1 : 0.5 }}
              disabled={!version.trim() || busy}
              onClick={() => void (async () => {
                const r = await createDraftSpecification({
                  companyId, productId, version: version.trim(), userId,
                });
                if (!r.ok) { setFailure(`${r.message} (${r.code})`); return; }
                setVersion(''); setNotice('Draft created. Add its tests, then approve it.');
                await loadSpecs();
              })()}>
              Create draft
            </button>
          </section>
        </>
      )}

      {open && (
        <>
          <button type="button" style={back} onClick={() => setOpen(null)}>← All versions</button>

          <section style={card}>
            <h2 style={h2}>
              Version {open.version} <span style={statusChip(open.status)}>{open.status}</span>
            </h2>

            {tests.length === 0 ? (
              <p style={note}>No tests yet. A specification with no tests states no criteria.</p>
            ) : (
              <ul style={listStyle}>
                {tests.map((t) => (
                  <li key={t.id} style={row}>
                    <span style={{ fontWeight: 600, minWidth: 0 }}>{t.test_name}</span>
                    <span style={{ ...quiet, flex: 1 }}>
                      {limitSummary(t)}{t.test_method ? ` · ${t.test_method}` : ''}
                    </span>
                    <span style={t.is_required ? requiredChip : optionalChip}>
                      {t.is_required ? 'required' : 'recorded only'}
                    </span>
                    {open.status === 'draft' && (
                      <button type="button" style={linkBtn} disabled={busy}
                        onClick={() => void (async () => {
                          const ok = await run('Test removed.',
                            () => removeSpecificationTest(t.id));
                          if (ok) await refresh(open.id);
                        })()}>
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/*  "required" is what the release gate counts. A test that
                is not required is still judged if a result exists for
                it; it just does not hold the batch. Said here because
                the distinction decides whether a batch waits. */}
            <p style={note}>
              {requiredCount} of {tests.length} {tests.length === 1 ? 'test is' : 'tests are'}{' '}
              required. A required test with no result holds the batch; one marked
              &ldquo;recorded only&rdquo; does not, though a failure on it still does.
            </p>
          </section>

          {open.status === 'draft' ? (
            <>
              <section style={card}>
                <h2 style={h2}>Add a test</h2>
                <label style={labelStyle}>
                  Test name
                  <input style={input} value={draftTest.test_name}
                    placeholder="Assay"
                    onChange={(e) => setDraftTest((d) => ({ ...d, test_name: e.target.value }))} />
                </label>
                <label style={labelStyle}>
                  Method
                  <input style={input} value={draftTest.test_method} placeholder="HPLC"
                    onChange={(e) => setDraftTest((d) => ({ ...d, test_method: e.target.value }))} />
                </label>
                <label style={labelStyle}>
                  Limit
                  <select style={input} value={draftTest.limit_type}
                    onChange={(e) => setDraftTest((d) => ({ ...d, limit_type: e.target.value as LimitType }))}>
                    {LIMIT_TYPES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </label>

                {(draftTest.limit_type === 'range' || draftTest.limit_type === 'min') && (
                  <label style={labelStyle}>
                    Minimum
                    <input style={input} inputMode="decimal" value={draftTest.min_value}
                      onChange={(e) => setDraftTest((d) => ({ ...d, min_value: e.target.value }))} />
                  </label>
                )}
                {(draftTest.limit_type === 'range' || draftTest.limit_type === 'max') && (
                  <label style={labelStyle}>
                    Maximum
                    <input style={input} inputMode="decimal" value={draftTest.max_value}
                      onChange={(e) => setDraftTest((d) => ({ ...d, max_value: e.target.value }))} />
                  </label>
                )}
                {draftTest.limit_type === 'exact_text' && (
                  <label style={labelStyle}>
                    Expected text
                    <input style={input} value={draftTest.expected_text}
                      onChange={(e) => setDraftTest((d) => ({ ...d, expected_text: e.target.value }))} />
                  </label>
                )}
                <label style={labelStyle}>
                  Unit
                  <input style={input} value={draftTest.unit} placeholder="%"
                    onChange={(e) => setDraftTest((d) => ({ ...d, unit: e.target.value }))} />
                </label>

                <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={draftTest.is_required}
                    onChange={(e) => setDraftTest((d) => ({ ...d, is_required: e.target.checked }))} />
                  Required before a batch can be released
                </label>

                <button type="button" style={{ ...primary, opacity: draftTest.test_name.trim() && !busy ? 1 : 0.5 }}
                  disabled={!draftTest.test_name.trim() || busy}
                  onClick={() => void (async () => {
                    const ok = await run('Test added.', () => addSpecificationTest({
                      specificationId: open.id,
                      testName: draftTest.test_name,
                      testMethod: draftTest.test_method || null,
                      unit: draftTest.unit || null,
                      limitType: draftTest.limit_type,
                      minValue: draftTest.min_value === '' ? null : Number(draftTest.min_value),
                      maxValue: draftTest.max_value === '' ? null : Number(draftTest.max_value),
                      expectedText: draftTest.expected_text || null,
                      isRequired: draftTest.is_required,
                      sortOrder: (tests.length + 1) * 10,
                    }));
                    if (ok) {
                      setDraftTest((d) => ({ ...d, test_name: '', test_method: '',
                        min_value: '', max_value: '', expected_text: '' }));
                      await refresh(open.id);
                    }
                  })()}>
                  Add test
                </button>
              </section>

              <section style={card}>
                <h2 style={h2}>Approve</h2>
                {/*  IRREVERSIBLE, SAID BEFORE THE BUTTON. */}
                <p style={note}>
                  Approving fixes this version. Its tests cannot afterwards be changed, added
                  to or removed, and what it says cannot be rewritten — the way on is a new
                  version, which supersedes this one going forward while this one goes on
                  governing every batch made while it was in force.
                </p>
                <p style={note}>
                  Approving requires a designated QA authority. PM-03 names no role for
                  approving a specification, so the database uses the register that already
                  approves a master formula; if you are refused, that is why.
                </p>
                <label style={labelStyle}>
                  In force from
                  <input style={input} type="date"
                    value={open.effective_date ?? new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setOpen({ ...open, effective_date: e.target.value })} />
                </label>
                <button type="button" style={{ ...primary, opacity: requiredCount > 0 && !busy ? 1 : 0.5 }}
                  disabled={requiredCount === 0 || busy}
                  onClick={() => void (async () => {
                    const ok = await run(`Version ${open.version} is approved and in force.`,
                      () => approveSpecification(open.id, open.effective_date ?? null));
                    if (ok) { setOpen(null); await loadSpecs(); }
                  })()}>
                  Approve this version
                </button>
                {requiredCount === 0 && (
                  <p style={note}>
                    At least one test must be marked required: a specification that requires
                    nothing would approve a batch on nothing, and the database refuses it.
                  </p>
                )}
              </section>
            </>
          ) : (
            <p style={note}>
              This version is {open.status} and cannot be changed. Start a new version to
              change what is required.
            </p>
          )}
        </>
      )}
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
const h2: CSSProperties = { margin: 0, fontSize: 17, fontWeight: 600 };
const sub: CSSProperties = { margin: 0, fontSize: 14, lineHeight: '21px', color: '#5b6472' };
const quiet: CSSProperties = { fontSize: 13, color: '#5b6472', minWidth: 0 };
const card: CSSProperties = {
  background: '#fff', border: '1px solid #e3e6eb', borderRadius: 12,
  padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
};
const listStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0, listStyle: 'none',
};
const row: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', width: '100%',
  boxSizing: 'border-box', border: '1px solid #e3e6eb', borderRadius: 10,
  padding: '11px 14px', fontSize: 14, minWidth: 0, background: '#fff',
  font: 'inherit', textAlign: 'left', cursor: 'pointer',
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
const chipBase: CSSProperties = {
  padding: '3px 9px', borderRadius: 6, flexShrink: 0,
  fontFamily: 'var(--nv-font-mono, ui-monospace, monospace)', fontSize: 11, lineHeight: '16px',
  border: '1px solid #e3e6eb',
};
function statusChip(status: string): CSSProperties {
  if (status === 'effective') return { ...chipBase, background: '#e4f3ea', color: '#0d7a44', borderColor: '#12A05A' };
  if (status === 'draft') return { ...chipBase, background: '#fff8e6', color: '#8a6d1f', borderColor: '#e3c977' };
  return { ...chipBase, background: '#f3f5f8', color: '#5b6472' };
}
const requiredChip: CSSProperties = { ...chipBase, background: '#f3f5f8', color: '#1d2433' };
const optionalChip: CSSProperties = { ...chipBase, background: '#fff', color: '#8a919c' };
const note: CSSProperties = {
  margin: 0, fontSize: 13, lineHeight: '19px', color: '#5b6472', maxWidth: '72ch',
};
const primary: CSSProperties = {
  border: 'none', borderRadius: 9, background: '#12A05A', color: '#fff',
  padding: '11px 16px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  alignSelf: 'flex-start', minHeight: 48,
};
const linkBtn: CSSProperties = {
  background: 'none', border: 'none', padding: 0, color: '#b42c1d',
  font: 'inherit', fontSize: 13, textDecoration: 'underline', cursor: 'pointer',
};
const back: CSSProperties = {
  alignSelf: 'flex-start', minHeight: 44, padding: '0 14px', borderRadius: 10,
  background: '#fff', border: '1px solid #e3e6eb', color: '#1d2433',
  font: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer',
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
