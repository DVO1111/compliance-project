import { supabase } from './supabase';
import { recordAuditEvent } from './auditService';

export interface ContrabandRejection {
  id: string;
  company_id: string;
  shipment_ref: string;
  rejection_date: string;
  items_found: string[];
  rejection_reason: string;
  description: string | null;
  reporter_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_flagged: boolean;
  status: 'pending' | 'rejected' | 'escalated';
  created_at: string;
  updated_at: string;
  reporter?: { full_name: string | null };
}

export interface CustomerFlag {
  id: string;
  company_id: string;
  customer_name: string;
  identifier_type: 'email' | 'phone' | 'name' | 'id_number' | 'other';
  identifier_value: string;
  flag_type: 'contraband' | 'fraud' | 'repeat_offender' | 'other';
  flag_reason: string;
  flagged_by: string | null;
  related_rejection_id: string | null;
  status: 'active' | 'cleared' | 'escalated';
  created_at: string;
  updated_at: string;
  flagged_by_profile?: { full_name: string | null };
}

export const REJECTION_REASONS = [
  'Prohibited Item — Narcotics/Drugs',
  'Prohibited Item — Weapons/Ammunition',
  'Prohibited Item — Counterfeit Goods',
  'Prohibited Item — Hazardous Materials',
  'Prohibited Item — Wildlife / CITES',
  'Prohibited Item — Stolen Property',
  'Prohibited Item — Pornographic Material',
  'Undeclared / Misdeclared Item',
  'Sanctioned Sender / Recipient',
  'Customs Declaration Fraud',
  'Other Policy Violation',
];

// ── Rejection Log ─────────────────────────────────────────────

export async function listRejections(companyId: string): Promise<ContrabandRejection[]> {
  const { data, error } = await (supabase as any)
    .from('contraband_rejection_log')
    .select('*, reporter:profiles!reporter_id(full_name)')
    .eq('company_id', companyId)
    .order('rejection_date', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createRejection(
  companyId: string,
  userId: string,
  payload: {
    shipment_ref: string;
    items_found: string[];
    rejection_reason: string;
    description?: string;
    customer_name?: string;
    customer_email?: string;
    customer_phone?: string;
    status?: 'pending' | 'rejected' | 'escalated';
  },
): Promise<ContrabandRejection> {
  const { data, error } = await (supabase as any)
    .from('contraband_rejection_log')
    .insert([{ ...payload, company_id: companyId, reporter_id: userId }])
    .select()
    .single();

  if (error) throw error;

  await recordAuditEvent({
    userId,
    action: 'create',
    entityType: 'contraband_rejection',
    entityId: data.id,
    companyId,
    metadata: {
      shipment_ref: data.shipment_ref,
      rejection_reason: data.rejection_reason,
      items_found: data.items_found,
    },
  });

  return data;
}

export async function updateRejectionStatus(
  companyId: string,
  userId: string,
  rejectionId: string,
  status: 'pending' | 'rejected' | 'escalated',
): Promise<void> {
  const { error } = await (supabase as any)
    .from('contraband_rejection_log')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', rejectionId)
    .eq('company_id', companyId);

  if (error) throw error;

  await recordAuditEvent({
    userId,
    action: 'update',
    entityType: 'contraband_rejection',
    entityId: rejectionId,
    companyId,
    metadata: { status },
  });
}

// ── Customer Flags ────────────────────────────────────────────

export async function listCustomerFlags(companyId: string): Promise<CustomerFlag[]> {
  const { data, error } = await (supabase as any)
    .from('customer_flags')
    .select('*, flagged_by_profile:profiles!flagged_by(full_name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function flagCustomer(
  companyId: string,
  userId: string,
  payload: {
    customer_name: string;
    identifier_type: CustomerFlag['identifier_type'];
    identifier_value: string;
    flag_type: CustomerFlag['flag_type'];
    flag_reason: string;
    related_rejection_id?: string;
  },
): Promise<CustomerFlag> {
  const { data, error } = await (supabase as any)
    .from('customer_flags')
    .upsert(
      [{
        ...payload,
        company_id: companyId,
        flagged_by: userId,
        status: 'active',
        updated_at: new Date().toISOString(),
      }],
      { onConflict: 'company_id,identifier_type,identifier_value', ignoreDuplicates: false },
    )
    .select()
    .single();

  if (error) throw error;

  await recordAuditEvent({
    userId,
    action: 'create',
    entityType: 'customer_flag',
    entityId: data.id,
    companyId,
    metadata: {
      customer_name: data.customer_name,
      flag_type: data.flag_type,
      identifier_type: data.identifier_type,
    },
  });

  return data;
}

export async function clearCustomerFlag(
  companyId: string,
  userId: string,
  flagId: string,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('customer_flags')
    .update({ status: 'cleared', updated_at: new Date().toISOString() })
    .eq('id', flagId)
    .eq('company_id', companyId);

  if (error) throw error;

  await recordAuditEvent({
    userId,
    action: 'update',
    entityType: 'customer_flag',
    entityId: flagId,
    companyId,
    metadata: { status: 'cleared' },
  });
}

export async function checkSenderFlag(
  companyId: string,
  identifierType: CustomerFlag['identifier_type'],
  identifierValue: string,
): Promise<CustomerFlag | null> {
  const { data, error } = await (supabase as any)
    .from('customer_flags')
    .select('*')
    .eq('company_id', companyId)
    .eq('identifier_type', identifierType)
    .eq('identifier_value', identifierValue)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  return data;
}
