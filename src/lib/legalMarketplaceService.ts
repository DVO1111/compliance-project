import { supabase } from './supabase';
import { Database } from './database.types';

export type LegalPartnerProfile = Database['public']['Tables']['legal_partner_profiles']['Row'] & {
  full_name?: string;
  avatar_url?: string | null;
};

export interface MarketplaceRequest {
  id: string;
  company_id: string;
  legal_partner_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  message: string | null;
  partner_reply: string | null;
  created_at: string;
  company_profiles?: {
    organization: string;
  };
}

export interface MarketplaceConnection {
  id: string;
  company_id: string;
  legal_partner_id: string;
  is_active: boolean;
  auto_assign_frequency: 'none' | 'on_demand' | 'monthly';
  created_at: string;
  partner_profile?: {
    full_name: string;
    firm_name: string | null;
    avatar_url: string | null;
  };
}

/* ── Partner Logic ── */

export async function fetchVerifiedPartners() {
  const { data, error } = await supabase
    .from('legal_partner_profiles')
    .select(`
      *,
      profiles:id (
        full_name,
        avatar_url
      )
    ` as any)
    .eq('verification_status', 'verified');

  if (error) throw error;
  
  return (data as any[]).map(row => ({
    ...row,
    full_name: row.profiles?.full_name,
    avatar_url: row.profiles?.avatar_url
  })) as LegalPartnerProfile[];
}

export async function createPartnerProfile(details: Partial<Database['public']['Tables']['legal_partner_profiles']['Insert']>) {
  const { error } = await supabase
    .from('legal_partner_profiles')
    .insert(details as any);
  
  if (error) throw error;
}

/* ── Marketplace Requests Logic ── */

export async function sendMarketplaceRequest(requestId: string, message: string) {
  // requestId here is actually partnerId based on usage in modal
  // but let's be careful with naming.
}

export async function sendConnectionRequest(partnerId: string, companyId: string, message: string) {
  const { error } = await supabase
    .from('marketplace_requests')
    .insert({
      company_id: companyId,
      legal_partner_id: partnerId,
      message,
      status: 'pending'
    } as any);

  if (error) throw error;
}

export async function fetchPartnerRequests(partnerId: string) {
  const { data, error } = await supabase
    .from('marketplace_requests')
    .select(`
      *,
      company_profiles:company_id (
        organization
      )
    ` as any)
    .eq('legal_partner_id', partnerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as any as MarketplaceRequest[];
}

export async function respondToRequest(requestId: string, status: 'accepted' | 'rejected', reply: string) {
  const { error } = await supabase
    .from('marketplace_requests')
    .update({ 
      status, 
      partner_reply: reply 
    } as any)
    .eq('id', requestId);

  if (error) throw error;

  if (status === 'accepted') {
    // Also create a connection
    const { data: req } = await supabase
      .from('marketplace_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (req) {
      await supabase
        .from('marketplace_connections')
        .insert({
          company_id: (req as any).company_id,
          legal_partner_id: (req as any).legal_partner_id,
          is_active: true,
          auto_assign_frequency: 'none'
        } as any);
    }
  }
}

/* ── Network Logic ── */

export async function fetchCompanyConnections(companyId: string) {
  const { data, error } = await supabase
    .from('marketplace_connections')
    .select(`
      *,
      partner_profiles:legal_partner_id (
        id,
        firm_name,
        profiles:id (
          full_name,
          avatar_url
        )
      )
    ` as any)
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (error) throw error;

  return (data as any[]).map(conn => ({
    ...conn,
    partner_profile: {
      full_name: conn.partner_profiles?.profiles?.full_name,
      firm_name: conn.partner_profiles?.firm_name,
      avatar_url: conn.partner_profiles?.profiles?.avatar_url
    }
  })) as MarketplaceConnection[];
}

export async function updateAutoAssign(connectionId: string, frequency: 'none' | 'on_demand' | 'monthly') {
  const { error } = await supabase
    .from('marketplace_connections')
    .update({ auto_assign_frequency: frequency } as any)
    .eq('id', connectionId);

  if (error) throw error;
}
