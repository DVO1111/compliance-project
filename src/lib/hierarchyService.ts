// src/lib/hierarchyService.ts
// Core CRUD + tree queries for the enterprise org hierarchy
import { supabase } from './supabase';

/* ── Types ─────────────────────────────────────────────── */

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  domain: string | null;
  settings: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessUnit {
  id: string;
  organization_id: string;
  company_id: string | null;
  name: string;
  slug: string;
  description: string;
  region: string | null;
  created_at: string;
  updated_at: string;
}

export interface Brand {
  id: string;
  business_unit_id: string;
  organization_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  jurisdictions: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrgTreeNode {
  organization: Organization;
  businessUnits: (BusinessUnit & { brands: Brand[] })[];
}

/* ── Organization CRUD ─────────────────────────────────── */

export async function createOrganization(opts: {
  name: string;
  slug: string;
  domain?: string;
  logoUrl?: string;
  createdBy: string;
}): Promise<Organization> {
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: opts.name,
      slug: opts.slug,
      domain: opts.domain || null,
      logo_url: opts.logoUrl || null,
      created_by: opts.createdBy,
    } as any)
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as Organization;
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .maybeSingle();

  if (error) return null;
  return (data ?? null) as unknown as Organization | null;
}

/* ── Business Unit CRUD ────────────────────────────────── */

export async function createBusinessUnit(opts: {
  organizationId: string;
  companyId?: string;
  name: string;
  slug: string;
  description?: string;
  region?: string;
}): Promise<BusinessUnit> {
  const { data, error } = await supabase
    .from('business_units')
    .insert({
      organization_id: opts.organizationId,
      company_id: opts.companyId || null,
      name: opts.name,
      slug: opts.slug,
      description: opts.description || '',
      region: opts.region || null,
    } as any)
    .select('*')
    .single();

  if (error) throw error;

  // Auto-create seat allocation row
  await supabase
    .from('business_unit_seats')
    .insert({
      business_unit_id: (data as any).id,
      allocated_seats: 0,
      used_seats: 0,
    } as any);

  return data as unknown as BusinessUnit;
}

export async function listBusinessUnits(organizationId: string): Promise<BusinessUnit[]> {
  const { data, error } = await supabase
    .from('business_units')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name');

  if (error) return [];
  return (data || []) as unknown as BusinessUnit[];
}

export async function updateBusinessUnit(
  buId: string,
  updates: Partial<Pick<BusinessUnit, 'name' | 'description' | 'region'>>
): Promise<void> {
  const { error } = await supabase
    .from('business_units')
    .update({ ...updates, updated_at: new Date().toISOString() } as any)
    .eq('id', buId);

  if (error) throw error;
}

export async function deleteBusinessUnit(buId: string): Promise<void> {
  const { error } = await supabase
    .from('business_units')
    .delete()
    .eq('id', buId);

  if (error) throw error;
}

/* ── Brand CRUD ────────────────────────────────────────── */

export async function createBrand(opts: {
  businessUnitId: string;
  organizationId: string;
  name: string;
  slug: string;
  jurisdictions?: string[];
  logoUrl?: string;
}): Promise<Brand> {
  const { data, error } = await supabase
    .from('brands')
    .insert({
      business_unit_id: opts.businessUnitId,
      organization_id: opts.organizationId,
      name: opts.name,
      slug: opts.slug,
      jurisdictions: opts.jurisdictions || [],
      logo_url: opts.logoUrl || null,
    } as any)
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as Brand;
}

export async function listBrands(businessUnitId: string): Promise<Brand[]> {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('business_unit_id', businessUnitId)
    .order('name');

  if (error) return [];
  return (data || []) as unknown as Brand[];
}

export async function listAllOrgBrands(organizationId: string): Promise<Brand[]> {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('name');

  if (error) return [];
  return (data || []) as unknown as Brand[];
}

export async function updateBrand(
  brandId: string,
  updates: Partial<Pick<Brand, 'name' | 'jurisdictions' | 'is_active' | 'logo_url'>>
): Promise<void> {
  const { error } = await supabase
    .from('brands')
    .update({ ...updates, updated_at: new Date().toISOString() } as any)
    .eq('id', brandId);

  if (error) throw error;
}

export async function deleteBrand(brandId: string): Promise<void> {
  const { error } = await supabase
    .from('brands')
    .delete()
    .eq('id', brandId);

  if (error) throw error;
}

export function getBrandJurisdictions(brand: Brand): string[] {
  return brand.jurisdictions || [];
}

/* ── Full org tree ─────────────────────────────────────── */

export async function getOrgTree(organizationId: string): Promise<OrgTreeNode | null> {
  const org = await getOrganization(organizationId);
  if (!org) return null;

  const bus = await listBusinessUnits(organizationId);
  const allBrands = await listAllOrgBrands(organizationId);

  const buWithBrands = bus.map((bu) => ({
    ...bu,
    brands: allBrands.filter((b) => b.business_unit_id === bu.id),
  }));

  return { organization: org, businessUnits: buWithBrands };
}

/* ── Descendant company IDs (for cross-unit reporting) ── */

export async function getDescendantCompanyIds(organizationId: string): Promise<string[]> {
  const bus = await listBusinessUnits(organizationId);
  return bus
    .map((bu) => bu.company_id)
    .filter((id): id is string => id !== null);
}

/* ── Assign user to org/BU/brand ──────────────────────── */

export async function assignUserToHierarchy(
  userId: string,
  opts: {
    organizationId: string;
    businessUnitId?: string;
    brandId?: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      organization_id: opts.organizationId,
      business_unit_id: opts.businessUnitId || null,
      brand_id: opts.brandId || null,
    } as any)
    .eq('id', userId);

  if (error) throw error;
}
