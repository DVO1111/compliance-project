import { supabase } from './supabase';
import { recordAuditEvent } from './auditService';

// ── Types ──────────────────────────────────────────────────────────────

export type ShipmentStatus =
  | 'created'
  | 'collected'
  | 'in_transit'
  | 'customs_hold'
  | 'cleared'
  | 'out_for_delivery'
  | 'delivered'
  | 'returned'
  | 'exception';

export type ShipmentEventType =
  | 'collected'
  | 'departed_origin'
  | 'arrived_hub'
  | 'customs_export_filed'
  | 'customs_export_cleared'
  | 'departed_origin_country'
  | 'arrived_destination_country'
  | 'customs_import_filed'
  | 'customs_import_cleared'
  | 'out_for_delivery'
  | 'delivered'
  | 'delivery_attempted'
  | 'returned_to_sender'
  | 'on_hold'
  | 'exception'
  | 'note';

export interface Shipment {
  id: string;
  company_id: string;
  reference: string;
  description: string | null;
  origin_country: string;
  destination_country: string;
  sender_name: string | null;
  recipient_name: string | null;
  service_type: string;
  status: ShipmentStatus;
  weight_kg: number | null;
  declared_value_gbp: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentEvent {
  id: string;
  company_id: string;
  shipment_id: string;
  event_type: ShipmentEventType;
  location: string | null;
  notes: string | null;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
  created_by_profile?: { full_name: string | null } | null;
}

// ── Reference data ─────────────────────────────────────────────────────

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  created:          'Created',
  collected:        'Collected',
  in_transit:       'In Transit',
  customs_hold:     'Customs Hold',
  cleared:          'Cleared',
  out_for_delivery: 'Out for Delivery',
  delivered:        'Delivered',
  returned:         'Returned',
  exception:        'Exception',
};

export const SHIPMENT_STATUS_COLORS: Record<ShipmentStatus, string> = {
  created:          'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  collected:        'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
  in_transit:       'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
  customs_hold:     'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  cleared:          'bg-teal-500/20 text-teal-300 border border-teal-500/30',
  out_for_delivery: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  delivered:        'bg-green-500/20 text-green-300 border border-green-500/30',
  returned:         'bg-gray-500/20 text-gray-300 border border-gray-500/30',
  exception:        'bg-red-500/20 text-red-300 border border-red-500/30',
};

export const SHIPMENT_STATUS_DOT: Record<ShipmentStatus, string> = {
  created:          'bg-blue-400',
  collected:        'bg-cyan-400',
  in_transit:       'bg-yellow-400',
  customs_hold:     'bg-orange-400',
  cleared:          'bg-teal-400',
  out_for_delivery: 'bg-purple-400',
  delivered:        'bg-green-400',
  returned:         'bg-gray-400',
  exception:        'bg-red-400',
};

export const EVENT_TYPE_LABELS: Record<ShipmentEventType, string> = {
  collected:                   'Parcel Collected',
  departed_origin:             'Departed Origin',
  arrived_hub:                 'Arrived at Hub',
  customs_export_filed:        'UK Export Declaration Filed',
  customs_export_cleared:      'UK Export Cleared',
  departed_origin_country:     'Departed UK',
  arrived_destination_country: 'Arrived in Nigeria',
  customs_import_filed:        'Nigeria Import Declaration Filed',
  customs_import_cleared:      'Nigeria Import Cleared',
  out_for_delivery:            'Out for Delivery',
  delivered:                   'Delivered',
  delivery_attempted:          'Delivery Attempted',
  returned_to_sender:          'Returned to Sender',
  on_hold:                     'On Hold',
  exception:                   'Exception / Incident',
  note:                        'Note Added',
};

export const ALL_EVENT_TYPES: ShipmentEventType[] = [
  'collected', 'departed_origin', 'arrived_hub',
  'customs_export_filed', 'customs_export_cleared', 'departed_origin_country',
  'arrived_destination_country', 'customs_import_filed', 'customs_import_cleared',
  'out_for_delivery', 'delivered', 'delivery_attempted',
  'returned_to_sender', 'on_hold', 'exception', 'note',
];

export const EVENT_DOT_COLOR: Partial<Record<ShipmentEventType, string>> = {
  delivered:            'bg-green-400',
  exception:            'bg-red-400',
  on_hold:              'bg-orange-400',
  customs_import_filed: 'bg-orange-400',
  returned_to_sender:   'bg-gray-400',
  note:                 'bg-blue-400',
};

export const SERVICE_TYPES = [
  'Air Freight',
  'Road Freight',
  'Document Courier',
  'E-Commerce Parcel',
  'Last-Mile Delivery',
  'Sea Freight',
];

export const COUNTRIES = [
  { code: 'GB', label: 'United Kingdom' },
  { code: 'NG', label: 'Nigeria' },
  { code: 'US', label: 'United States' },
  { code: 'DE', label: 'Germany' },
  { code: 'GH', label: 'Ghana' },
  { code: 'ZA', label: 'South Africa' },
  { code: 'CN', label: 'China' },
];

export const STATUS_ADVANCE: Partial<Record<ShipmentEventType, ShipmentStatus>> = {
  collected:                   'collected',
  departed_origin:             'in_transit',
  arrived_hub:                 'in_transit',
  customs_export_filed:        'in_transit',
  customs_export_cleared:      'in_transit',
  departed_origin_country:     'in_transit',
  arrived_destination_country: 'in_transit',
  customs_import_filed:        'customs_hold',
  customs_import_cleared:      'cleared',
  out_for_delivery:            'out_for_delivery',
  delivered:                   'delivered',
  returned_to_sender:          'returned',
  on_hold:                     'customs_hold',
  exception:                   'exception',
};

// ── CRUD ────────────────────────────────────────────────────────────────

export async function listShipments(companyId: string): Promise<Shipment[]> {
  const { data, error } = await (supabase as any)
    .from('shipments')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getShipmentEvents(
  companyId: string,
  shipmentId: string,
): Promise<ShipmentEvent[]> {
  const { data, error } = await (supabase as any)
    .from('shipment_events')
    .select('*, created_by_profile:profiles!created_by(full_name)')
    .eq('company_id', companyId)
    .eq('shipment_id', shipmentId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createShipment(
  companyId: string,
  userId: string,
  payload: {
    reference: string;
    description?: string;
    origin_country: string;
    destination_country: string;
    sender_name?: string;
    recipient_name?: string;
    service_type: string;
    weight_kg?: number | null;
    declared_value_gbp?: number | null;
  },
): Promise<Shipment> {
  const { data, error } = await (supabase as any)
    .from('shipments')
    .insert([{ ...payload, company_id: companyId, created_by: userId, status: 'created' }])
    .select()
    .single();
  if (error) throw error;

  await recordAuditEvent({
    userId,
    action: 'create',
    entityType: 'shipment',
    entityId: data.id,
    companyId,
    metadata: { reference: data.reference },
  });

  return data;
}

export async function addShipmentEvent(
  companyId: string,
  userId: string,
  shipmentId: string,
  payload: {
    event_type: ShipmentEventType;
    location?: string;
    notes?: string;
    occurred_at?: string;
  },
): Promise<ShipmentEvent> {
  const { data, error } = await (supabase as any)
    .from('shipment_events')
    .insert([{
      ...payload,
      company_id: companyId,
      shipment_id: shipmentId,
      created_by: userId,
      occurred_at: payload.occurred_at ?? new Date().toISOString(),
    }])
    .select()
    .single();
  if (error) throw error;

  const newStatus = STATUS_ADVANCE[payload.event_type];
  if (newStatus) {
    await (supabase as any)
      .from('shipments')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', shipmentId)
      .eq('company_id', companyId);
  }

  await recordAuditEvent({
    userId,
    action: 'create',
    entityType: 'shipment_event',
    entityId: data.id,
    companyId,
    metadata: { shipment_id: shipmentId, event_type: payload.event_type },
  });

  return data;
}
