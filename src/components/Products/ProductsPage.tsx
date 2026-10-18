/**
 * The product registry — where ONB-08's "Add your first product" lands.
 *
 * It did not exist. The dashboard's primary action pointed at a PageId
 * nothing matched, so the first thing the product asks a new workspace
 * to do had nowhere to happen; the button went to Regulatory Affairs as
 * the nearest true destination, which is a licence register and not
 * this. This is the page it was always meant to open.
 *
 * WHAT A PRODUCT IS HERE. Everything downstream hangs off it: a batch
 * can only be started for a product with a valid registration, and
 * renewal alerts are computed from each registration's expiry date. So
 * the registry is not a catalogue — it is the thing that decides what
 * may be manufactured, and the page says so rather than presenting a
 * list of names.
 *
 * STATUS IS NOT A FIELD ON THIS PAGE, and its absence is deliberate.
 * `products.status` is owned by the lifecycle engine: createProduct
 * omits it so the database's trigger takes ownership from the first
 * insert, and updateProduct strips it before writing. A dropdown here
 * would let somebody type "Registered" over a product nobody has
 * registered — a claim about a regulator's decision, made in a form.
 * The status is shown, never set; registration numbers and expiry dates
 * arrive from the regulatory workflow that records the approval.
 *
 * The same honesty rule as ONB-08 therefore applies to the release
 * line: `eligibilityReason` says WHY a product cannot start a batch,
 * and the row shows it, rather than leaving a green tick off and
 * letting somebody discover the reason at the manufacturing stage.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  listProducts, createProduct,
  PRODUCT_STATUS_LABELS, MANUFACTURING_TYPE_LABELS,
  CONTROLLED_SUBSTANCE_SCHEDULES, requiresControlledSubstancePrompt,
  isReleaseEligible, eligibilityReason,
  type Product, type ManufacturingType,
} from '../../lib/productService';
import type { ProductCategory } from '../../lib/regulatoryAffairsService';
import { logger } from '../../lib/logger';
import { STATUS_ICONS, iconProps } from '../../lib/design/icons';
import { CircleDashed, AlertTriangle } from 'lucide-react';
import {
  lightPage, lightCard, lightNextCard, lightPageTitle, lightCardTitle,
  lightBody, lightMeta, lightPrimaryButton, lightLinkButton,
  lightBadge, lightField, lightLabel,
} from '../../lib/design/lightSurface';

export interface ProductsPageProps {
  companyId: string | null | undefined;
  userId: string | null | undefined;
  /** Registrations & Licences, where a registration is actually recorded. */
  onOpenRegistrations: () => void;
  /** The spreadsheet route ONB-08 offers beside "Add your first product". */
  onImportSpreadsheet: () => void;
}

/** The categories, in the words NAFDAC uses for them. */
const CATEGORIES: { value: ProductCategory; label: string }[] = [
  { value: 'drug_pharmaceutical',  label: 'Drug / pharmaceutical' },
  { value: 'herbal_nutraceutical', label: 'Herbal / nutraceutical' },
  { value: 'food',                 label: 'Food' },
  { value: 'cosmetic',             label: 'Cosmetic' },
  { value: 'medical_device',       label: 'Medical device' },
  { value: 'veterinary',           label: 'Veterinary' },
  { value: 'biologic_vaccine',     label: 'Biologic / vaccine' },
  { value: 'agro_chemical',        label: 'Agro-chemical' },
  { value: 'other',                label: 'Other' },
];

const MANUFACTURING: ManufacturingType[] = ['in_house', 'contract_manufactured', 'imported'];

/** What the form holds. Only four of these are required to save. */
interface Draft {
  productCode: string;
  tradeName: string;
  genericName: string;
  category: ProductCategory;
  manufacturingType: ManufacturingType;
  manufacturerName: string;
  manufacturingSite: string;
  dosageForm: string;
  strength: string;
  packSize: string;
  shelfLifeMonths: string;
  isControlledSubstance: boolean;
  controlledSubstanceSchedule: string;
}

const EMPTY_DRAFT: Draft = {
  productCode: '', tradeName: '', genericName: '',
  category: 'drug_pharmaceutical', manufacturingType: 'in_house',
  manufacturerName: '', manufacturingSite: '',
  dosageForm: '', strength: '', packSize: '', shelfLifeMonths: '',
  isControlledSubstance: false, controlledSubstanceSchedule: '',
};

export default function ProductsPage({
  companyId, userId, onOpenRegistrations, onImportSpreadsheet,
}: ProductsPageProps) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!companyId) { setProducts([]); return; }
    listProducts(companyId)
      .then(setProducts)
      //  An empty list and an unreadable one are different, and the
      //  screen says which: a failed read keeps the list null so the
      //  empty state — which invites you to add a first product — is
      //  not shown over a registry that may already have hundreds.
      .catch((err) => { logger.warn('[products] list failed', err); setProblem(READ_FAILED); });
  }, [companyId]);

  useEffect(() => { refresh(); }, [refresh]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  //  The controlled-substance prompt is meaningful for some categories
  //  and not others, so it appears and disappears with the category
  //  rather than sitting on every product as a checkbox nobody reads.
  const controlledApplies = requiresControlledSubstancePrompt(draft.category);

  const canSave = draft.productCode.trim() !== '' && draft.tradeName.trim() !== '';

  const save = async () => {
    if (!companyId || !canSave || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      await createProduct({
        companyId,
        productCode: draft.productCode,
        tradeName: draft.tradeName,
        genericName: draft.genericName || undefined,
        category: draft.category,
        manufacturingType: draft.manufacturingType,
        manufacturerName: draft.manufacturerName || undefined,
        manufacturingSite: draft.manufacturingSite || undefined,
        dosageForm: draft.dosageForm || undefined,
        strength: draft.strength || undefined,
        packSize: draft.packSize || undefined,
        shelfLifeMonths: draft.shelfLifeMonths.trim() === ''
          ? null : Number(draft.shelfLifeMonths),
        isControlledSubstance: controlledApplies && draft.isControlledSubstance,
        controlledSubstanceSchedule:
          controlledApplies && draft.isControlledSubstance
            ? (draft.controlledSubstanceSchedule || null) : null,
        createdBy: userId ?? null,
      });
      setDraft(EMPTY_DRAFT);
      setAdding(false);
      refresh();
    } catch (err: any) {
      logger.error('[products] create failed', err);
      //  The one failure worth naming, because it is the one somebody
      //  can fix without help: product_code is unique per company.
      setProblem(err?.code === '23505'
        ? `A product with the code “${draft.productCode.trim()}” already exists in this workspace.`
        : (err?.message ?? 'The product could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const loading = products === null && problem === null;
  const list = products ?? [];

  const countLine = useMemo(() => {
    if (loading) return 'Loading…';
    if (list.length === 0) return 'Nothing registered yet.';
    const releasable = list.filter(isReleaseEligible).length;
    //  Two numbers, because they answer different questions: how much
    //  is on file, and how much may actually be manufactured today.
    return `${plural(list.length, 'product', 'products')} · `
      + `${releasable} cleared to start a batch`;
  }, [list, loading]);

  return (
    <div style={lightPage}>
      <header style={header}>
        <div style={{ minWidth: 0 }}>
          <h1 style={lightPageTitle}>Products</h1>
          <p style={{ ...lightBody, marginTop: 6 }}>{countLine}</p>
        </div>
        {!adding && list.length > 0 && (
          <button type="button" style={lightPrimaryButton} onClick={() => setAdding(true)}>
            Add a product
          </button>
        )}
      </header>

      {problem && (
        <div style={problemBox} role="alert">
          <AlertTriangle {...iconProps('sm')} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{problem}</span>
        </div>
      )}

      {/* ── The form ──────────────────────────────────────────────── */}
      {adding && (
        <section style={lightCard} aria-labelledby="products-new">
          <div>
            <h2 id="products-new" style={lightCardTitle}>New product</h2>
            <p style={{ ...lightBody, marginTop: 6 }}>
              A code and a trade name are enough to start. Everything else can be
              filled in later, and the registration number and expiry date are
              recorded when the regulator approves it — not here.
            </p>
          </div>

          <div style={formGrid}>
            <Field label="Product code" required>
              <input style={lightField} value={draft.productCode}
                onChange={(e) => set('productCode', e.target.value)}
                placeholder="e.g. PARA-500-TAB" />
            </Field>
            <Field label="Trade name" required>
              <input style={lightField} value={draft.tradeName}
                onChange={(e) => set('tradeName', e.target.value)}
                placeholder="The name it is sold under" />
            </Field>
            <Field label="Generic name">
              <input style={lightField} value={draft.genericName}
                onChange={(e) => set('genericName', e.target.value)}
                placeholder="e.g. Paracetamol" />
            </Field>
            <Field label="Category">
              <select style={lightField} value={draft.category}
                onChange={(e) => set('category', e.target.value as ProductCategory)}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Made how">
              <select style={lightField} value={draft.manufacturingType}
                onChange={(e) => set('manufacturingType', e.target.value as ManufacturingType)}>
                {MANUFACTURING.map((m) =>
                  <option key={m} value={m}>{MANUFACTURING_TYPE_LABELS[m]}</option>)}
              </select>
            </Field>
            <Field label="Manufacturer">
              <input style={lightField} value={draft.manufacturerName}
                onChange={(e) => set('manufacturerName', e.target.value)}
                placeholder="Leave blank if it is you" />
            </Field>
            <Field label="Manufacturing site">
              <input style={lightField} value={draft.manufacturingSite}
                onChange={(e) => set('manufacturingSite', e.target.value)} />
            </Field>
            <Field label="Dosage form">
              <input style={lightField} value={draft.dosageForm}
                onChange={(e) => set('dosageForm', e.target.value)}
                placeholder="Tablet, syrup, cream…" />
            </Field>
            <Field label="Strength">
              <input style={lightField} value={draft.strength}
                onChange={(e) => set('strength', e.target.value)} placeholder="500 mg" />
            </Field>
            <Field label="Pack size">
              <input style={lightField} value={draft.packSize}
                onChange={(e) => set('packSize', e.target.value)} placeholder="10 x 10 blister" />
            </Field>
            <Field label="Shelf life (months)">
              <input style={lightField} value={draft.shelfLifeMonths} inputMode="numeric"
                onChange={(e) => set('shelfLifeMonths', e.target.value.replace(/[^0-9]/g, ''))} />
            </Field>
          </div>

          {/*  Only for the categories where NAFDAC's remit makes the
              declaration meaningful. See CONTROLLED_SUBSTANCE_CATEGORIES.  */}
          {controlledApplies && (
            <div style={controlledBox}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={draft.isControlledSubstance}
                  onChange={(e) => set('isControlledSubstance', e.target.checked)}
                  style={{ marginTop: 3 }} />
                <span>
                  <span style={{ ...lightLabel, marginBottom: 2 }}>
                    This is a controlled substance
                  </span>
                  <span style={lightMeta}>
                    Declaring it here is what puts the product under the schedule’s
                    handling and record-keeping rules.
                  </span>
                </span>
              </label>

              {draft.isControlledSubstance && (
                <div style={{ marginTop: 12, maxWidth: 320 }}>
                  <Field label="Schedule">
                    <select style={lightField} value={draft.controlledSubstanceSchedule}
                      onChange={(e) => set('controlledSubstanceSchedule', e.target.value)}>
                      <option value="">Not stated</option>
                      {CONTROLLED_SUBSTANCE_SCHEDULES.map((s) =>
                        <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button type="button" style={{ ...lightPrimaryButton, opacity: canSave && !saving ? 1 : 0.55 }}
              onClick={save} disabled={!canSave || saving}>
              {saving ? 'Saving…' : 'Save product'}
            </button>
            <button type="button" style={lightLinkButton}
              onClick={() => { setAdding(false); setDraft(EMPTY_DRAFT); setProblem(null); }}>
              Cancel
            </button>
            {!canSave && (
              <span style={lightMeta}>A product code and a trade name are needed.</span>
            )}
          </div>
        </section>
      )}

      {/* ── The empty state ───────────────────────────────────────── */}
      {!adding && !loading && list.length === 0 && problem === null && (
        <section style={lightNextCard} aria-labelledby="products-empty">
          <h2 id="products-empty" style={lightCardTitle}>Add your first product</h2>
          <p style={lightBody}>
            A batch can only be started for a product with a valid registration, and
            renewal alerts are worked out from each registration’s expiry date.
            Everything else in the workspace waits on this.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button type="button" style={lightPrimaryButton} onClick={() => setAdding(true)}>
              Add your first product
            </button>
            <button type="button" style={lightLinkButton} onClick={onImportSpreadsheet}>
              Upload a product spreadsheet
            </button>
          </div>
        </section>
      )}

      {/* ── The registry ──────────────────────────────────────────── */}
      {list.length > 0 && (
        <section style={lightCard} aria-labelledby="products-list">
          <h2 id="products-list" style={lightCardTitle}>Registry</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {list.map((p, i) => (
              <li key={p.id} style={{ ...row, borderTop: i === 0 ? 'none' : row.borderTop }}>
                <ProductRow product={p} onOpenRegistrations={onOpenRegistrations} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading && (
        <section style={lightCard}>
          <p style={lightMeta}>Reading the registry…</p>
        </section>
      )}
    </div>
  );
}

/**
 * One product. The second line is the part that matters: whether a
 * batch may be started for it, and when the answer is no, why.
 */
function ProductRow({ product, onOpenRegistrations }: {
  product: Product; onOpenRegistrations: () => void;
}) {
  const eligible = isReleaseEligible(product);
  const reason = eligibilityReason(product);
  const Tick = STATUS_ICONS.released.icon;

  const spec = [product.dosage_form, product.strength, product.pack_size]
    .filter(Boolean).join(' · ');

  return (
    <div style={rowInner}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={rowName}>{product.trade_name}</span>
          <span style={rowCode}>{product.product_code}</span>
        </div>
        {(product.generic_name || spec) && (
          <p style={{ ...lightMeta, marginTop: 3 }}>
            {[product.generic_name, spec].filter(Boolean).join(' — ')}
          </p>
        )}

        {/*  The registration line. A product with no number has not been
            registered, and the line says so rather than leaving a blank
            that reads as "not loaded yet".  */}
        <p style={{ ...lightMeta, marginTop: 6 }}>
          {product.nafdac_number
            ? `NAFDAC ${product.nafdac_number}${
              product.registration_expiry_date
                ? ` · expires ${product.registration_expiry_date}`
                : ' · no expiry date recorded'}`
            : 'No registration number yet.'}
        </p>

        {!eligible && reason && (
          <p style={{ ...lightMeta, marginTop: 6, color: 'var(--nv-light-badge-waiting-text)' }}>
            {reason}{' '}
            <button type="button" style={{ ...lightLinkButton, fontSize: 13 }}
              onClick={onOpenRegistrations}>
              Record a registration
            </button>
          </p>
        )}
      </div>

      <span style={{
        ...lightBadge,
        ...(eligible
          ? { background: 'var(--nv-light-badge-done-bg)', color: 'var(--nv-light-badge-done-text)' }
          : { background: 'var(--nv-light-badge-todo-bg)', color: 'var(--nv-light-badge-todo-text)' }),
      }}>
        {eligible
          ? <Tick {...iconProps('sm')} size={13} aria-hidden="true" />
          : <CircleDashed {...iconProps('sm')} size={13} aria-hidden="true" />}
        {PRODUCT_STATUS_LABELS[product.status]}
      </span>
    </div>
  );
}

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={lightLabel}>
        {label}
        {required && <span aria-hidden="true" style={{ color: 'var(--nv-status-danger)' }}> *</span>}
      </span>
      {children}
    </label>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const READ_FAILED =
  'The product registry could not be read. Nothing is lost — reload the page, and if it '
  + 'keeps failing the products table may not be installed on this workspace yet.';

/* ─────────────────────────── Styles ─────────────────────────── */

const header: CSSProperties = {
  display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
  gap: 16, flexWrap: 'wrap',
};

const formGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 14,
};

const controlledBox: CSSProperties = {
  padding: 16,
  borderRadius: 'var(--nv-radius-control)',
  background: 'var(--nv-light-surface-sunken)',
  border: '1px solid var(--nv-light-border)',
};

const row: CSSProperties = { borderTop: '1px solid var(--nv-light-border)' };

const rowInner: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
  gap: 16, padding: '14px 0',
};

const rowName: CSSProperties = {
  fontSize: 15, fontWeight: 600, lineHeight: '21px',
  color: 'var(--nv-light-text-primary)',
};

const rowCode: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)',
  fontSize: 12, color: 'var(--nv-light-text-tertiary)',
};

const problemBox: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'flex-start',
  padding: 14, borderRadius: 'var(--nv-radius-control)',
  background: 'var(--nv-light-badge-waiting-bg)',
  color: 'var(--nv-light-badge-waiting-text)',
  fontSize: 14, lineHeight: '20px',
};
