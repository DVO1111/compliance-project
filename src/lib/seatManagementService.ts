// src/lib/seatManagementService.ts
// Budget / seat tracking per business unit for SaaS billing
import { supabase } from './supabase';

/* ── Types ─────────────────────────────────────────────── */

export interface SeatAllocation {
  id: string;
  business_unit_id: string;
  allocated_seats: number;
  used_seats: number;
  updated_at: string;
}

export interface SeatSummary {
  allocated: number;
  used: number;
  remaining: number;
}

/* ── Queries ──────────────────────────────────────────── */

export async function getSeatAllocation(
  businessUnitId: string
): Promise<SeatSummary> {
  const { data, error } = await (supabase as any)
    .from('business_unit_seats')
    .select('*')
    .eq('business_unit_id', businessUnitId)
    .maybeSingle();

  if (error || !data) {
    return { allocated: 0, used: 0, remaining: 0 };
  }

  const row = data as unknown as SeatAllocation;
  return {
    allocated: row.allocated_seats,
    used: row.used_seats,
    remaining: Math.max(0, row.allocated_seats - row.used_seats),
  };
}

/**
 * Get seat summaries for all BUs under an organization.
 */
export async function getOrgSeatSummaries(
  organizationId: string
): Promise<(SeatAllocation & { bu_name: string })[]> {
  // Join through business_units to get BU name
  const { data: bus } = await (supabase as any)
    .from('business_units')
    .select('id, name')
    .eq('organization_id', organizationId);

  if (!bus || bus.length === 0) return [];

  const buIds = bus.map((b: any) => b.id);
  const { data: seats } = await (supabase as any)
    .from('business_unit_seats')
    .select('*')
    .in('business_unit_id', buIds);

  if (!seats) return [];

  const buNames: Record<string, string> = {};
  for (const b of bus) {
    buNames[(b as any).id] = (b as any).name;
  }

  return (seats as unknown as SeatAllocation[]).map((s) => ({
    ...s,
    bu_name: buNames[s.business_unit_id] || 'Unknown',
  }));
}

/* ── Mutations ────────────────────────────────────────── */

export async function updateSeatAllocation(
  businessUnitId: string,
  newAllocatedSeats: number
): Promise<void> {
  const { error } = await (supabase as any)
    .from('business_unit_seats')
    .update({
      allocated_seats: newAllocatedSeats,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('business_unit_id', businessUnitId);

  if (error) throw error;
}

/**
 * Refresh the used_seats count by counting active profiles in this BU.
 */
export async function refreshUsedSeats(
  businessUnitId: string
): Promise<number> {
  const { count, error } = await (supabase as any)
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('business_unit_id', businessUnitId)
    .is('deleted_at', null);

  const used = error ? 0 : (count ?? 0);

  await (supabase as any)
    .from('business_unit_seats')
    .update({ used_seats: used, updated_at: new Date().toISOString() } as any)
    .eq('business_unit_id', businessUnitId);

  return used;
}

/**
 * Check if a seat is available in the given BU.
 * Returns true if used < allocated, or if no limit is set (allocated = 0 means unlimited).
 */
export async function checkSeatAvailable(
  businessUnitId: string
): Promise<boolean> {
  const summary = await getSeatAllocation(businessUnitId);

  // 0 allocated = unlimited (no cap)
  if (summary.allocated === 0) return true;

  return summary.used < summary.allocated;
}
