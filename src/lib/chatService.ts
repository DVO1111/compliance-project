/* ═══════════════════════════════════════════════════════════════
   Team Chat — Service Layer
   ═══════════════════════════════════════════════════════════════
   All DB ops for channels, messages, reactions, mentions,
   read receipts, search, and external relay.
   ═══════════════════════════════════════════════════════════════ */

import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { logger } from './logger';

// ── Types ────────────────────────────────────────────────────

export interface ChatChannel {
  id: string;
  company_id: string;
  name: string;
  description: string;
  channel_type: 'general' | 'announcements' | 'custom';
  created_by: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  parent_id: string | null;
  content: string;
  content_type: 'text' | 'gif' | 'system' | 'file' | 'audio' | 'meeting';
  gif_url: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  is_pinned: boolean;
  is_edited: boolean;
  is_deleted: boolean;
  relay_sent: boolean;
  created_at: string;
  updated_at: string;
  // populated client-side
  sender_name?: string;
  sender_avatar?: string;
  reactions?: ReactionGroup[];
  reply_count?: number;
}

export interface ChatReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  users: string[];
  reacted_by_me: boolean;
}

export interface RelayDestination {
  id: string;
  company_id: string;
  connection_id: string;
  provider: 'slack' | 'teams' | 'discord';
  external_id: string;
  external_name: string;
  is_private: boolean;
  synced_at: string;
}

export interface ChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  last_read_at: string;
  joined_at: string;
}

export interface UnreadCount {
  channel_id: string;
  count: number;
}

// ── Channels ─────────────────────────────────────────────────

export async function ensureDefaultChannels(companyId: string): Promise<void> {
  try {
    await (supabase.rpc as any)('ensure_default_chat_channels', { p_company_id: companyId });
  } catch (err) {
    logger.warn('[Chat] ensureDefaultChannels failed (may need migration):', err);
  }
}

export async function listChannels(companyId: string): Promise<ChatChannel[]> {
  const { data, error } = await supabase
    .from('chat_channels')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_archived', false)
    .order('channel_type', { ascending: true })
    .order('name', { ascending: true });

  if (error) { logger.error('[Chat] listChannels:', error); return []; }
  return (data as any[]) ?? [];
}

export async function createChannel(
  companyId: string,
  name: string,
  description: string,
  createdBy: string,
): Promise<ChatChannel | null> {
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const { data, error } = await supabase
    .from('chat_channels')
    .insert({
      company_id: companyId,
      name: slug,
      description,
      channel_type: 'custom',
      created_by: createdBy,
    } as any)
    .select()
    .single();

  if (error) { logger.error('[Chat] createChannel:', error); throw error; }
  return (data as any) ?? null;
}

export async function deleteChannel(channelId: string): Promise<void> {
  await supabase.from('chat_channels').update({ is_archived: true } as any).eq('id', channelId);
}

// ── Channel Members ──────────────────────────────────────────

export async function joinChannel(channelId: string, userId: string): Promise<void> {
  await supabase.from('chat_channel_members').upsert(
    { channel_id: channelId, user_id: userId, last_read_at: new Date().toISOString() } as any,
    { onConflict: 'channel_id,user_id' },
  );
}

export async function leaveChannel(channelId: string, userId: string): Promise<void> {
  await supabase.from('chat_channel_members').delete().eq('channel_id', channelId).eq('user_id', userId);
}

export async function joinAllDefaultChannels(companyId: string, userId: string): Promise<void> {
  const channels = await listChannels(companyId);
  const defaults = channels.filter(c => c.channel_type === 'general' || c.channel_type === 'announcements');
  for (const ch of defaults) {
    await joinChannel(ch.id, userId);
  }
}

export async function markChannelRead(channelId: string, userId: string): Promise<void> {
  await supabase
    .from('chat_channel_members')
    .update({ last_read_at: new Date().toISOString() } as any)
    .eq('channel_id', channelId)
    .eq('user_id', userId);
}

export async function getUnreadCounts(companyId: string, userId: string): Promise<UnreadCount[]> {
  // Get all channels user is a member of with their last_read_at
  const { data: memberships } = await supabase
    .from('chat_channel_members')
    .select('channel_id, last_read_at')
    .eq('user_id', userId);

  if (!memberships?.length) return [];

  const counts: UnreadCount[] = [];
  for (const m of memberships as any[]) {
    const { count } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel_id', m.channel_id)
      .gt('created_at', m.last_read_at ?? '1970-01-01')
      .eq('is_deleted', false);

    if (count && count > 0) {
      counts.push({ channel_id: m.channel_id, count });
    }
  }
  return counts;
}

// ── Messages ─────────────────────────────────────────────────

export async function fetchMessages(
  channelId: string,
  opts?: { limit?: number; before?: string; parentId?: string | null },
): Promise<ChatMessage[]> {
  const limit = opts?.limit ?? 50;
  let query = supabase
    .from('chat_messages')
    .select('*')
    .eq('channel_id', channelId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  // Thread mode: fetch replies to a specific parent
  if (opts?.parentId) {
    query = query.eq('parent_id', opts.parentId);
  } else {
    // Main feed: only root messages (no parent)
    query = query.is('parent_id', null);
  }

  if (opts?.before) {
    query = query.lt('created_at', opts.before);
  }

  const { data, error } = await query;
  if (error) { logger.error('[Chat] fetchMessages:', error); return []; }
  return ((data as any[]) ?? []).reverse();
}

export async function sendMessage(
  channelId: string,
  senderId: string,
  content: string,
  opts?: { 
    parentId?: string; 
    contentType?: 'text' | 'gif' | 'system' | 'file' | 'audio' | 'meeting'; 
    gifUrl?: string;
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    meetingId?: string;
  },
): Promise<ChatMessage | null> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      channel_id: channelId,
      sender_id: senderId,
      content,
      content_type: opts?.contentType ?? 'text',
      gif_url: opts?.gifUrl ?? null,
      file_url: opts?.fileUrl ?? null,
      file_name: opts?.fileName ?? null,
      file_size: opts?.fileSize ?? null,
      file_type: opts?.fileType ?? null,
      parent_id: opts?.parentId ?? null,
      metadata: opts?.meetingId ? { meetingId: opts.meetingId } : undefined,
    } as any)
    .select()
    .single();

  if (error) { logger.error('[Chat] sendMessage:', error); throw error; }

  // Extract and insert @mentions
  const msg = data as any as ChatMessage;
  if (msg && msg.content_type === 'text') {
    await extractAndInsertMentions(msg.id, content);
  }
  return msg ?? null;
}

export async function uploadChatAttachment(file: File, companyId: string): Promise<{ url: string, name: string, size: number, type: string }> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${companyId}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
  
  const { data, error } = await supabase.storage
    .from('chat_attachments')
    .upload(fileName, file);

  if (error) throw error;

  const { data: publicUrlData } = supabase.storage
    .from('chat_attachments')
    .getPublicUrl(fileName);

  return {
    url: publicUrlData.publicUrl,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
  };
}

export async function editMessage(messageId: string, newContent: string): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .update({ content: newContent, is_edited: true, updated_at: new Date().toISOString() } as any)
    .eq('id', messageId);
  if (error) throw error;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .update({ is_deleted: true, content: '[message deleted]', updated_at: new Date().toISOString() } as any)
    .eq('id', messageId);
  if (error) throw error;
}

export async function pinMessage(messageId: string, pinned: boolean): Promise<void> {
  await supabase.from('chat_messages').update({ is_pinned: pinned } as any).eq('id', messageId);
}

export async function getReplyCount(messageId: string): Promise<number> {
  const { count } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('parent_id', messageId)
    .eq('is_deleted', false);
  return count ?? 0;
}

// ── Search ───────────────────────────────────────────────────

export async function searchMessages(
  companyId: string,
  query: string,
  limit = 20,
): Promise<ChatMessage[]> {
  // Get channel IDs for this company
  const { data: channels } = await supabase
    .from('chat_channels')
    .select('id')
    .eq('company_id', companyId);

  if (!channels?.length) return [];
  const channelIds = (channels as any[]).map(c => c.id);

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .in('channel_id', channelIds)
    .eq('is_deleted', false)
    .ilike('content', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) { logger.error('[Chat] searchMessages:', error); return []; }
  return (data as any[]) ?? [];
}

// ── Reactions ────────────────────────────────────────────────

export async function addReaction(messageId: string, userId: string, emoji: string): Promise<void> {
  await supabase.from('chat_reactions').upsert(
    { message_id: messageId, user_id: userId, emoji } as any,
    { onConflict: 'message_id,user_id,emoji' },
  );
}

export async function removeReaction(messageId: string, userId: string, emoji: string): Promise<void> {
  await supabase
    .from('chat_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji);
}

export async function getReactionsForMessages(messageIds: string[], currentUserId: string): Promise<Record<string, ReactionGroup[]>> {
  if (!messageIds.length) return {};

  const { data } = await supabase
    .from('chat_reactions')
    .select('*')
    .in('message_id', messageIds);

  const grouped: Record<string, ReactionGroup[]> = {};
  for (const r of (data as any[] ?? [])) {
    if (!grouped[r.message_id]) grouped[r.message_id] = [];
    const existing = grouped[r.message_id].find(g => g.emoji === r.emoji);
    if (existing) {
      existing.count++;
      existing.users.push(r.user_id);
      if (r.user_id === currentUserId) existing.reacted_by_me = true;
    } else {
      grouped[r.message_id].push({
        emoji: r.emoji,
        count: 1,
        users: [r.user_id],
        reacted_by_me: r.user_id === currentUserId,
      });
    }
  }
  return grouped;
}

// ── Mentions ─────────────────────────────────────────────────

async function extractAndInsertMentions(messageId: string, content: string): Promise<void> {
  // Match @username patterns
  const mentionRegex = /@([a-zA-Z0-9._-]+)/g;
  const matches = [...content.matchAll(mentionRegex)];
  if (!matches.length) return;

  const usernames = matches.map(m => m[1]);

  // Lookup user IDs by full_name
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('full_name', usernames);

  if (!profiles?.length) return;

  const inserts = (profiles as any[]).map(p => ({
    message_id: messageId,
    user_id: p.id,
  }));

  await supabase.from('chat_mentions').insert(inserts as any);
}

// ── Relay (external posting) ─────────────────────────────────

export async function listRelayDestinations(companyId: string): Promise<RelayDestination[]> {
  const { data, error } = await supabase
    .from('chat_relay_destinations')
    .select('*')
    .eq('company_id', companyId)
    .order('external_name');

  if (error) { logger.error('[Chat] listRelayDestinations:', error); return []; }
  return (data as any[]) ?? [];
}

export async function syncSlackDestinations(companyId: string, connectionId: string): Promise<void> {
  try {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;

    const res = await supabase.functions.invoke('slack-channels', {
      body: { action: 'list_channels', company_id: companyId, connection_id: connectionId },
      headers: { Authorization: `Bearer ${token}` },
    });

    const channels = res.data?.channels ?? [];
    if (!channels.length) return;

    // Upsert into relay destinations
    const rows = channels.map((ch: any) => ({
      company_id: companyId,
      connection_id: connectionId,
      provider: 'slack',
      external_id: ch.id,
      external_name: `#${ch.name}`,
      is_private: ch.is_private,
      synced_at: new Date().toISOString(),
    }));

    await supabase.from('chat_relay_destinations').upsert(rows as any, {
      onConflict: 'company_id,provider,external_id',
    });
  } catch (err) {
    logger.warn('[Chat] syncSlackDestinations failed:', err);
  }
}

export async function relayToExternal(opts: {
  companyId: string;
  connectionId: string;
  channelIds: string[];
  messageText: string;
  senderName: string;
  companyName: string;
  internalMessageId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return { success: false, error: 'No auth token' };

    const res = await supabase.functions.invoke('chat-relay', {
      body: {
        company_id: opts.companyId,
        connection_id: opts.connectionId,
        channel_ids: opts.channelIds,
        message_text: opts.messageText,
        sender_name: opts.senderName,
        company_name: opts.companyName,
        internal_message_id: opts.internalMessageId,
      },
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.error) return { success: false, error: res.error.message };

    // Mark the message as relayed
    await supabase
      .from('chat_messages')
      .update({ relay_sent: true } as any)
      .eq('id', opts.internalMessageId);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Realtime ─────────────────────────────────────────────────

export function subscribeToChannel(
  channelId: string,
  onMessage: (msg: ChatMessage) => void,
  onReaction?: (payload: any) => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`chat:${channelId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chat_messages',
        filter: `channel_id=eq.${channelId}`,
      },
      (payload) => {
        if (payload.eventType === 'INSERT') {
          onMessage(payload.new as ChatMessage);
        } else if (payload.eventType === 'UPDATE') {
          onMessage(payload.new as ChatMessage);
        }
      },
    );

  if (onReaction) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chat_reactions',
      },
      (payload) => {
        onReaction(payload);
      },
    );
  }

  channel.subscribe();
  return channel;
}

// ── Profile Helpers (for display names) ──────────────────────

export async function getCompanyProfiles(companyId: string): Promise<{ id: string; full_name: string; avatar_url?: string }[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('company_id', companyId);

  return (data as any[]) ?? [];
}
