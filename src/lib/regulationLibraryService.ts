// src/lib/regulationLibraryService.ts
// Shared regulation libraries owned at org level, inherited downward
import { supabase } from './supabase';

/* ── Types ─────────────────────────────────────────────── */

export interface OrgRegulationEntry {
  id: string;
  organization_id: string;
  regulation_id: string;
  added_by: string | null;
  notes: string;
  created_at: string;
}

/* ── Org-level library CRUD ────────────────────────────── */

export async function addToOrgLibrary(opts: {
  organizationId: string;
  regulationId: string;
  addedBy: string;
  notes?: string;
}): Promise<OrgRegulationEntry> {
  const { data, error } = await supabase
    .from('org_regulation_libraries')
    .upsert(
      {
        organization_id: opts.organizationId,
        regulation_id: opts.regulationId,
        added_by: opts.addedBy,
        notes: opts.notes || '',
      } as any,
      { onConflict: 'organization_id,regulation_id' }
    )
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as OrgRegulationEntry;
}

export async function removeFromOrgLibrary(
  organizationId: string,
  regulationId: string
): Promise<void> {
  const { error } = await supabase
    .from('org_regulation_libraries')
    .delete()
    .eq('organization_id', organizationId)
    .eq('regulation_id', regulationId);

  if (error) throw error;
}

export async function getOrgLibrary(
  organizationId: string
): Promise<OrgRegulationEntry[]> {
  const { data, error } = await supabase
    .from('org_regulation_libraries')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data || []) as unknown as OrgRegulationEntry[];
}

/* ── Inherited regulations ─────────────────────────────── */

/**
 * Get all regulation IDs that a brand inherits from its org.
 * Inheritance flows: org → all descendants.
 * Brand-level overrides could be added later, but for now
 * org-level = the shared set visible to all brands.
 */
export async function getInheritedRegulations(
  organizationId: string
): Promise<string[]> {
  const entries = await getOrgLibrary(organizationId);
  return entries.map((e) => e.regulation_id);
}

/**
 * Check if a regulation is in the org's shared library.
 */
export async function isInOrgLibrary(
  organizationId: string,
  regulationId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('org_regulation_libraries')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('regulation_id', regulationId)
    .maybeSingle();

  return data !== null;
}
