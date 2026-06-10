import { supabase } from './supabase';
import { recordAuditEvent } from './auditService';

// ── Types ──────────────────────────────────────────────────────────────

export type DeclarationType = 'CN22' | 'CN23';

export type ReasonForExport =
  | 'gift'
  | 'sale'
  | 'commercial_sample'
  | 'documents'
  | 'returned_goods'
  | 'other';

export interface DeclarationItem {
  description: string;
  quantity: number;
  weight_kg: number;
  value_gbp: number;
  hs_tariff_number?: string;
}

export interface CnDeclaration {
  id: string;
  company_id: string;
  shipment_id: string | null;
  shipment_ref: string;
  declaration_type: DeclarationType;
  sender_name: string;
  sender_address: string | null;
  recipient_name: string;
  recipient_address: string | null;
  contents_description: string;
  reason_for_export: ReasonForExport;
  items: DeclarationItem[];
  total_value_gbp: number;
  total_weight_kg: number;
  is_flagged: boolean;
  flag_reason: string | null;
  created_by: string | null;
  created_at: string;
}

// ── Reference data ─────────────────────────────────────────────────────

export const REASON_LABELS: Record<ReasonForExport, string> = {
  gift:               'Gift',
  sale:               'Sale / Commercial',
  commercial_sample:  'Commercial Sample',
  documents:          'Documents',
  returned_goods:     'Returned Goods',
  other:              'Other',
};

// CN22 is for items with total customs value not exceeding ~£270 (€300 equivalent)
export const CN22_VALUE_THRESHOLD_GBP = 270;

const VAGUE_DESCRIPTIONS = new Set([
  'items', 'goods', 'stuff', 'personal', 'misc', 'miscellaneous', 'various',
  'personal effects', 'personal belongings', 'clothing', 'gift',
]);

function autoFlag(
  declaration_type: DeclarationType,
  total_value_gbp: number,
  contents_description: string,
): { is_flagged: boolean; flag_reason: string | null } {
  if (declaration_type === 'CN22' && total_value_gbp > CN22_VALUE_THRESHOLD_GBP) {
    return {
      is_flagged: true,
      flag_reason: `Declared value £${total_value_gbp.toFixed(2)} exceeds the CN22 threshold of £${CN22_VALUE_THRESHOLD_GBP}. A CN23 form is required for items above this value.`,
    };
  }
  if (VAGUE_DESCRIPTIONS.has(contents_description.trim().toLowerCase())) {
    return {
      is_flagged: true,
      flag_reason: 'Vague contents description detected. Customs may require a specific itemised description to clear this shipment.',
    };
  }
  return { is_flagged: false, flag_reason: null };
}

// ── CRUD ────────────────────────────────────────────────────────────────

export async function listDeclarations(companyId: string): Promise<CnDeclaration[]> {
  const { data, error } = await (supabase as any)
    .from('cn_declarations')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createDeclaration(
  companyId: string,
  userId: string,
  payload: {
    shipment_id?: string | null;
    shipment_ref: string;
    declaration_type: DeclarationType;
    sender_name: string;
    sender_address?: string;
    recipient_name: string;
    recipient_address?: string;
    contents_description: string;
    reason_for_export: ReasonForExport;
    items: DeclarationItem[];
    total_value_gbp: number;
    total_weight_kg: number;
  },
): Promise<CnDeclaration> {
  const flagInfo = autoFlag(
    payload.declaration_type,
    payload.total_value_gbp,
    payload.contents_description,
  );

  const { data, error } = await (supabase as any)
    .from('cn_declarations')
    .insert([{ ...payload, ...flagInfo, company_id: companyId, created_by: userId }])
    .select()
    .single();
  if (error) throw error;

  await recordAuditEvent({
    userId,
    action: 'create',
    entityType: 'cn_declaration',
    entityId: data.id,
    companyId,
    metadata: {
      shipment_ref: data.shipment_ref,
      declaration_type: data.declaration_type,
      total_value_gbp: data.total_value_gbp,
      is_flagged: data.is_flagged,
    },
  });

  return data;
}

export async function resolveDeclarationFlag(
  companyId: string,
  userId: string,
  declarationId: string,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('cn_declarations')
    .update({ is_flagged: false, flag_reason: null })
    .eq('id', declarationId)
    .eq('company_id', companyId);
  if (error) throw error;

  await recordAuditEvent({
    userId,
    action: 'update',
    entityType: 'cn_declaration',
    entityId: declarationId,
    companyId,
    metadata: { is_flagged: false },
  });
}
