/**
 * Product Registry
 *
 * The product is the entity the rest of the regulatory model hangs off.
 * Before this existed, "product" was free text repeated independently in
 * regulatory_submissions, regulatory_licences, ctd_dossiers and
 * batch_records, so nothing could be joined: a registration could not be
 * shown against the batch it authorises.
 *
 * Two things are deliberately NOT done here:
 *
 *  - Status is never written. It is a derived read model maintained by
 *    the database from the lifecycle engine, and a direct write is
 *    rejected by a trigger. Use `transitionProduct()`, which goes through
 *    `lifecycleService`.
 *  - Eligibility is not enforced here. `isReleaseEligible()` exists so
 *    the UI can explain itself, but the actual gate is a database trigger
 *    on batch_records — a client-side check would be advisory only.
 */

import { logger } from './logger';
import type { ProductCategory } from './regulatoryAffairsService';

async function db() {
  const { supabase } = await import('./supabase');
  return supabase;
}

/* ── Types ─────────────────────────────────────────────────────────── */

export type ProductStatus =
  | 'concept'
  | 'regulatory_preparation'
  | 'submitted'
  | 'registered'
  | 'active'
  | 'suspended'
  | 'discontinued';

export type ManufacturingType = 'in_house' | 'contract_manufactured' | 'imported';

export type DocumentScope = 'company' | 'product';

export interface Product {
  id: string;
  company_id: string;
  product_code: string;
  trade_name: string;
  generic_name: string | null;
  description: string | null;
  category: ProductCategory;
  status: ProductStatus;
  manufacturing_type: ManufacturingType;
  manufacturer_vendor_id: string | null;
  manufacturer_name: string | null;
  manufacturing_site: string | null;
  is_controlled_substance: boolean;
  controlled_substance_schedule: string | null;
  nafdac_number: string | null;
  registration_expiry_date: string | null;
  dosage_form: string | null;
  strength: string | null;
  pack_size: string | null;
  shelf_life_months: number | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductDocument {
  id: string;
  company_id: string;
  scope: DocumentScope;
  product_id: string | null;
  document_type: string;
  name: string;
  description: string | null;
  file_name: string | null;
  file_url: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  is_ctd_administrative: boolean;
  ctd_module: string | null;
  metadata: Record<string, unknown>;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

/* ── Display metadata ──────────────────────────────────────────────── */

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  concept:                'Concept / Development',
  regulatory_preparation: 'Regulatory Preparation',
  submitted:              'Submitted to Regulator',
  registered:             'Registered',
  active:                 'Active / Commercial',
  suspended:              'Suspended',
  discontinued:           'Discontinued',
};

export const PRODUCT_STATUS_COLORS: Record<ProductStatus, string> = {
  concept:                'text-gray-600 bg-gray-100',
  regulatory_preparation: 'text-blue-700 bg-blue-100',
  submitted:              'text-purple-700 bg-purple-100',
  registered:             'text-green-700 bg-green-100',
  active:                 'text-green-700 bg-green-100',
  suspended:              'text-orange-700 bg-orange-100',
  discontinued:           'text-gray-500 bg-gray-100',
};

export const MANUFACTURING_TYPE_LABELS: Record<ManufacturingType, string> = {
  in_house:              'Manufactured in-house',
  contract_manufactured: 'Contract manufactured',
  imported:              'Imported',
};

/**
 * Categories for which a controlled-substance declaration is meaningful.
 * Mirrors the CHECK constraint on products.
 *
 * FOOD IS INCLUDED, and that is the point: NAFDAC's remit covers
 * controlled substances in ingestible products, so a food application
 * must be able to declare one. An earlier version of this list omitted
 * food, which made the prompt drugs-only.
 *
 * Cosmetic, medical_device and agro_chemical remain excluded — the
 * requirement is a relevant prompt, not a checkbox on every product.
 */
export const CONTROLLED_SUBSTANCE_CATEGORIES: ProductCategory[] = [
  'food', 'drug_pharmaceutical', 'veterinary', 'biologic_vaccine', 'herbal_nutraceutical',
];

export function requiresControlledSubstancePrompt(category: ProductCategory): boolean {
  return CONTROLLED_SUBSTANCE_CATEGORIES.includes(category);
}

/**
 * NDLEA / NAFDAC schedules used for controlled substances in Nigeria.
 * Free text is accepted by the database; these are the offered values.
 */
export const CONTROLLED_SUBSTANCE_SCHEDULES = [
  'Schedule I', 'Schedule II', 'Schedule III', 'Schedule IV', 'Schedule V',
  'NDLEA Precursor Chemical',
] as const;

/* ── CTD administrative documents ──────────────────────────────────── */

/**
 * CTD Module 1 is the administrative and prescribing-information module,
 * and it is the one that differs by region — Modules 2–5 are the common
 * technical content. These are the Module 1 items NAFDAC expects, kept as
 * configuration rather than hard-coded rows so the list can be edited
 * without a migration, which is how CHECKLISTS in regulatoryAffairsService
 * already works.
 */
export interface CtdAdministrativeDocument {
  key: string;
  name: string;
  required: boolean;
  /** company-level documents are uploaded once and reused everywhere */
  scope: DocumentScope;
  description: string;
}

export const CTD_ADMINISTRATIVE_DOCUMENTS: CtdAdministrativeDocument[] = [
  { key: 'cover_letter',            name: 'Cover Letter',                        required: true,  scope: 'product', description: 'Addressed to the Director-General of NAFDAC, identifying the product and application type' },
  { key: 'application_form',        name: 'Completed Application Form',          required: true,  scope: 'product', description: 'NAPAMS application form for the product' },
  { key: 'toc',                     name: 'Table of Contents (Modules 1–5)',     required: true,  scope: 'product', description: 'Comprehensive table of contents covering the whole dossier' },
  { key: 'cac_certificate',         name: 'CAC Certificate of Incorporation',    required: true,  scope: 'company', description: 'Company registration certificate — reused across every product' },
  { key: 'manufacturing_licence',   name: 'Manufacturing Licence',               required: true,  scope: 'company', description: 'Current NAFDAC site manufacturing licence — a company-level document' },
  { key: 'gmp_certificate',         name: 'GMP Certificate',                     required: true,  scope: 'company', description: 'Valid GMP certificate for the manufacturing site' },
  { key: 'power_of_attorney',       name: 'Power of Attorney',                   required: false, scope: 'product', description: 'Required for imported products: from the brand owner to the Nigerian agent' },
  { key: 'certificate_free_sale',   name: 'Certificate of Free Sale',            required: false, scope: 'product', description: 'Required for imported products, from the country of origin' },
  { key: 'evidence_of_payment',     name: 'Evidence of Payment',                 required: true,  scope: 'product', description: 'Receipt for the application fee' },
  { key: 'labelling_artwork',       name: 'Labelling and Artwork',               required: true,  scope: 'product', description: 'Primary and secondary packaging artwork, and the patient information leaflet' },
  { key: 'smpc',                    name: 'Summary of Product Characteristics',  required: false, scope: 'product', description: 'Where an approved SmPC exists from the originating authority' },
  { key: 'controlled_substance_permit', name: 'Controlled Substance Permit',     required: false, scope: 'product', description: 'NDLEA / NAFDAC permit — required only where the product involves a controlled substance' },
];

/**
 * The administrative documents that actually apply to a given product.
 * The controlled-substance permit appears only when the product declares
 * one, which is the integration point the checklist architecture already
 * implies rather than a separate standalone form.
 */
export function getCtdAdministrativeDocuments(product: Pick<Product, 'is_controlled_substance' | 'manufacturing_type'>): CtdAdministrativeDocument[] {
  return CTD_ADMINISTRATIVE_DOCUMENTS.filter((d) => {
    if (d.key === 'controlled_substance_permit') return product.is_controlled_substance;
    if (d.key === 'power_of_attorney' || d.key === 'certificate_free_sale') {
      return product.manufacturing_type === 'imported';
    }
    return true;
  });
}

/* ── Eligibility ───────────────────────────────────────────────────── */

/**
 * Advisory only. The binding check is the batch_records trigger; this
 * exists so the UI can say WHY something is blocked before the user tries.
 */
export function isReleaseEligible(product: Pick<Product, 'status' | 'registration_expiry_date'>): boolean {
  if (product.status !== 'registered' && product.status !== 'active') return false;
  if (!product.registration_expiry_date) return true;
  return new Date(product.registration_expiry_date) >= new Date(new Date().toDateString());
}

export function eligibilityReason(product: Pick<Product, 'status' | 'registration_expiry_date'>): string | null {
  if (isReleaseEligible(product)) return null;
  if (product.status === 'suspended')    return 'The product is suspended.';
  if (product.status === 'discontinued') return 'The product is discontinued.';
  if (product.status !== 'registered' && product.status !== 'active') {
    return `The product is not yet registered (${PRODUCT_STATUS_LABELS[product.status]}).`;
  }
  return 'The product registration has expired.';
}

/* ── CRUD ──────────────────────────────────────────────────────────── */

export async function listProducts(companyId: string, status?: ProductStatus): Promise<Product[]> {
  let q = (await db() as any)
    .from('products').select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) { logger.error('listProducts', error); return []; }
  return data ?? [];
}

export async function getProduct(id: string, companyId: string): Promise<Product | null> {
  const { data, error } = await (await db() as any)
    .from('products').select('*').eq('id', id).eq('company_id', companyId).maybeSingle();
  if (error) { logger.error('getProduct', error); return null; }
  return data;
}

export type NewProduct = {
  companyId: string;
  productCode: string;
  tradeName: string;
  genericName?: string;
  description?: string;
  category: ProductCategory;
  manufacturingType: ManufacturingType;
  manufacturerVendorId?: string | null;
  manufacturerName?: string;
  manufacturingSite?: string;
  isControlledSubstance?: boolean;
  controlledSubstanceSchedule?: string | null;
  dosageForm?: string;
  strength?: string;
  packSize?: string;
  shelfLifeMonths?: number | null;
  createdBy?: string | null;
};

export async function createProduct(input: NewProduct): Promise<Product> {
  // status is omitted deliberately: the database sets it and the lifecycle
  // trigger takes ownership from the first insert.
  const controlled = input.isControlledSubstance === true
    && requiresControlledSubstancePrompt(input.category);

  const { data, error } = await (await db() as any)
    .from('products')
    .insert({
      company_id: input.companyId,
      product_code: input.productCode.trim(),
      trade_name: input.tradeName.trim(),
      generic_name: input.genericName?.trim() || null,
      description: input.description?.trim() || null,
      category: input.category,
      manufacturing_type: input.manufacturingType,
      manufacturer_vendor_id: input.manufacturerVendorId ?? null,
      manufacturer_name: input.manufacturerName?.trim() || null,
      manufacturing_site: input.manufacturingSite?.trim() || null,
      is_controlled_substance: controlled,
      controlled_substance_schedule: controlled ? (input.controlledSubstanceSchedule ?? null) : null,
      dosage_form: input.dosageForm?.trim() || null,
      strength: input.strength?.trim() || null,
      pack_size: input.packSize?.trim() || null,
      shelf_life_months: input.shelfLifeMonths ?? null,
      created_by: input.createdBy ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  // The existing audit trail, not a second one.
  try {
    const { recordAuditEvent } = await import('./auditService');
    await recordAuditEvent({
      userId: input.createdBy ?? '',
      action: 'product.created',
      entityType: 'product',
      entityId: data.id,
      companyId: input.companyId,
      metadata: {
        product_code: data.product_code,
        trade_name: data.trade_name,
        category: data.category,
        manufacturing_type: data.manufacturing_type,
        is_controlled_substance: data.is_controlled_substance,
      },
    });
  } catch (err) {
    logger.error('[product] created but audit write failed', err);
  }

  return data;
}

/** Everything except status, which the lifecycle engine owns. */
export async function updateProduct(
  id: string, companyId: string, patch: Partial<Omit<Product, 'id' | 'company_id' | 'status' | 'created_at' | 'updated_at'>>
): Promise<Product | null> {
  const { status, ...safe } = patch as any;
  const { data, error } = await (await db() as any)
    .from('products').update(safe)
    .eq('id', id).eq('company_id', companyId)
    .select().maybeSingle();
  if (error) throw error;
  return data;
}

/* ── Lifecycle ─────────────────────────────────────────────────────── */

export async function getProductActions(productId: string, companyId: string) {
  const { getAvailableActions } = await import('./lifecycleService');
  return getAvailableActions('product', productId, companyId);
}

export async function transitionProduct(params: {
  productId: string; companyId: string; actionKey: string; comment?: string;
}) {
  const { transition } = await import('./lifecycleService');
  return transition({
    entityType: 'product',
    entityId: params.productId,
    actionKey: params.actionKey,
    companyId: params.companyId,
    comment: params.comment,
  });
}

export async function getProductHistory(productId: string, companyId: string) {
  const { getHistory } = await import('./lifecycleService');
  return getHistory('product', productId, companyId);
}

/* ── Documents ─────────────────────────────────────────────────────── */

/** Company-level documents: uploaded once, available to every product. */
export async function listCompanyDocuments(companyId: string): Promise<ProductDocument[]> {
  const { data, error } = await (await db() as any)
    .from('product_documents').select('*')
    .eq('company_id', companyId).eq('scope', 'company')
    .order('document_type');
  if (error) { logger.error('listCompanyDocuments', error); return []; }
  return data ?? [];
}

/**
 * Everything a product can show — its own documents plus the company's.
 * Resolved by the database function so the reuse rule lives in one place.
 */
export async function listAvailableDocuments(productId: string): Promise<ProductDocument[]> {
  const { data, error } = await (await db() as any)
    .rpc('product_available_documents', { p_product_id: productId });
  if (error) { logger.error('listAvailableDocuments', error); return []; }
  return (data ?? []) as ProductDocument[];
}

export async function addDocument(input: {
  companyId: string;
  scope: DocumentScope;
  productId?: string | null;
  documentType: string;
  name: string;
  description?: string;
  fileName?: string;
  fileUrl?: string;
  issueDate?: string | null;
  expiryDate?: string | null;
  isCtdAdministrative?: boolean;
  ctdModule?: string | null;
  uploadedBy?: string | null;
}): Promise<ProductDocument> {
  const { data, error } = await (await db() as any)
    .from('product_documents')
    .insert({
      company_id: input.companyId,
      scope: input.scope,
      // the database CHECK enforces this too; normalising here keeps the
      // client from sending a contradictory pair in the first place
      product_id: input.scope === 'company' ? null : (input.productId ?? null),
      document_type: input.documentType,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      file_name: input.fileName ?? null,
      file_url: input.fileUrl ?? null,
      issue_date: input.issueDate ?? null,
      expiry_date: input.expiryDate ?? null,
      is_ctd_administrative: input.isCtdAdministrative ?? false,
      ctd_module: input.ctdModule ?? null,
      uploaded_by: input.uploadedBy ?? null,
    })
    .select().single();
  if (error) throw error;
  return data;
}

/* ── Related regulatory records ────────────────────────────────────── */

export async function listProductRegistrations(productId: string) {
  const client = await db() as any;
  const [subs, licences] = await Promise.all([
    client.from('regulatory_submissions').select('*').eq('product_id', productId).order('created_at', { ascending: false }),
    client.from('regulatory_licences').select('*').eq('product_id', productId).order('created_at', { ascending: false }),
  ]);
  return {
    submissions: subs.error ? [] : (subs.data ?? []),
    licences: licences.error ? [] : (licences.data ?? []),
  };
}
