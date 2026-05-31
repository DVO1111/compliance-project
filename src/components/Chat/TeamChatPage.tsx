// src/components/Chat/TeamChatPage.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { Hash, Megaphone, Pin, X, MessageSquare } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import ChannelSidebar from './ChannelSidebar';
import MessageFeed from './MessageFeed';
import ChatComposer from './ChatComposer';
import MessageBubble from './MessageBubble';
import ChatInfoSidebar from './ChatInfoSidebar';
import type {
    ChatChannel, ChatMessage, UnreadCount, RelayDestination,
} from '../../lib/chatService';
import {
    ensureDefaultChannels, listChannels, createChannel,
    fetchMessages, sendMessage, editMessage, deleteMessage, pinMessage,
    addReaction, removeReaction, getReactionsForMessages,
    markChannelRead, getUnreadCounts, joinAllDefaultChannels, joinChannel,
    getCompanyProfiles, searchMessages, relayToExternal,
    subscribeToChannel, getReplyCount, uploadChatAttachment
} from '../../lib/chatService';
import { getAllEvents, type CalendarEvent } from '../../lib/calendarService';
import { logger } from '../../lib/logger';

export default function TeamChatPage() {
    const { user, profile } = useAuth();
    const companyId = profile?.company_id;
    const userId = user?.id;
    const userRole = (profile as any)?.company_role ?? profile?.role ?? '';

    // ── State ──────────────────────────────────────────────────
    const [channels, setChannels] = useState<ChatChannel[]>([]);
    const [activeChannel, setActiveChannel] = useState<ChatChannel | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [unreadCounts, setUnreadCounts] = useState<UnreadCount[]>([]);
    const [profiles, setProfiles] = useState<Map<string, { full_name: string; avatar_url?: string }>>(new Map());
    const [profileList, setProfileList] = useState<{ id: string; full_name: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [replyCounts, setReplyCounts] = useState<Record<string, number>>({});
    const [meetings, setMeetings] = useState<CalendarEvent[]>([]);

    // Thread panel
    const [threadParent, setThreadParent] = useState<ChatMessage | null>(null);
    const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);

    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ChatMessage[] | null>(null);

    // Pinned panel / Info panel
    const [showPinned, setShowPinned] = useState(false);
    const [showInfo, setShowInfo] = useState(true);

    const realtimeRef = useRef<any>(null);
    const threadRealtimeRef = useRef<any>(null);

    // ── Init ───────────────────────────────────────────────────
    useEffect(() => {
        if (!companyId || !userId) return;

        const init = async () => {
            await ensureDefaultChannels(companyId);
            await joinAllDefaultChannels(companyId, userId);

            const [chs, profs, unreads] = await Promise.all([
                listChannels(companyId),
                getCompanyProfiles(companyId),
                getUnreadCounts(companyId, userId),
            ]);

            setChannels(chs);
            setUnreadCounts(unreads);

            const pMap = new Map<string, { full_name: string; avatar_url?: string }>();
            const pList: { id: string; full_name: string }[] = [];
            for (const p of profs) {
                pMap.set(p.id, { full_name: p.full_name, avatar_url: (p as any).avatar_url });
                pList.push({ id: p.id, full_name: p.full_name });
            }
            setProfiles(pMap);
            setProfileList(profs.map(p => ({ id: p.id, full_name: p.full_name, avatar_url: (p as any).avatar_url })));

            if (chs.length > 0) {
                setActiveChannel(chs[0]);
            }

            // Fetch real meetings
            const now = new Date();
            const range = {
                start: now.toISOString(),
                end: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() // Next 7 days
            };
            const evts = await getAllEvents(companyId, range);
            setMeetings(evts.filter(e => e.event_type === 'meeting'));
        };

        init();
    }, [companyId, userId]);

    // ── Load messages when channel changes ─────────────────────
    useEffect(() => {
        if (!activeChannel || !userId) return;

        const load = async () => {
            setLoading(true);
            setThreadParent(null);
            setThreadMessages([]);
            setSearchResults(null);

            const msgs = await fetchMessages(activeChannel.id, { limit: 50 });

            // Load reactions
            if (msgs.length > 0) {
                const reactions = await getReactionsForMessages(msgs.map(m => m.id), userId);
                for (const m of msgs) {
                    m.reactions = reactions[m.id] ?? [];
                }
            }

            // Load reply counts for root messages
            const counts: Record<string, number> = {};
            for (const m of msgs) {
                if (!m.parent_id) {
                    counts[m.id] = await getReplyCount(m.id);
                }
            }
            setReplyCounts(counts);

            setMessages(msgs);
            setHasMore(msgs.length >= 50);
            setLoading(false);

            // Mark read
            await markChannelRead(activeChannel.id, userId);
            if (companyId) {
                const unreads = await getUnreadCounts(companyId, userId);
                setUnreadCounts(unreads);
            }
        };

        load();

        // Subscribe to realtime
        realtimeRef.current?.unsubscribe();
        realtimeRef.current = subscribeToChannel(activeChannel.id, async (newMsg) => {
            setMessages(prev => {
                const exists = prev.find(m => m.id === newMsg.id);
                if (exists) {
                    return prev.map(m => m.id === newMsg.id ? { ...m, ...newMsg, reactions: m.reactions } : m);
                }
                return [...prev, newMsg];
            });

            // Mark as read immediately
            await markChannelRead(activeChannel.id, userId);
        });

        return () => {
            realtimeRef.current?.unsubscribe();
        };
    }, [activeChannel?.id, userId, companyId]);

    // ── Thread loading ─────────────────────────────────────────
    useEffect(() => {
        if (!threadParent || !activeChannel || !userId) return;

        const loadThread = async () => {
            const replies = await fetchMessages(activeChannel.id, { parentId: threadParent.id, limit: 100 });
            if (replies.length > 0) {
                const reactions = await getReactionsForMessages(replies.map(m => m.id), userId);
                for (const m of replies) {
                    m.reactions = reactions[m.id] ?? [];
                }
            }
            setThreadMessages(replies);
        };

        loadThread();

        // Realtime for thread
        threadRealtimeRef.current?.unsubscribe();
        threadRealtimeRef.current = subscribeToChannel(activeChannel.id, (newMsg) => {
            if (newMsg.parent_id === threadParent.id) {
                setThreadMessages(prev => {
                    const exists = prev.find(m => m.id === newMsg.id);
                    if (exists) return prev.map(m => m.id === newMsg.id ? { ...m, ...newMsg } : m);
                    return [...prev, newMsg];
                });
            }
        });

        return () => {
            threadRealtimeRef.current?.unsubscribe();
        };
    }, [threadParent?.id, activeChannel?.id, userId]);

    // ── Handlers ───────────────────────────────────────────────
    const handleSend = useCallback(async (
        text: string,
        opts?: { gifUrl?: string; contentType?: 'text' | 'gif' | 'file' | 'audio' | 'meeting'; relayDestinations?: RelayDestination[]; file?: File },
    ) => {
        if (!activeChannel || !userId || !companyId) return;

        let fileMetadata = {};
        if (opts?.file) {
            try {
                const uploaded = await uploadChatAttachment(opts.file, companyId);
                fileMetadata = {
                    fileUrl: uploaded.url,
                    fileName: uploaded.name,
                    fileSize: uploaded.size,
                    fileType: uploaded.type,
                };
            } catch (err) {
                logger.error('Failed to upload attachment:', err);
                alert('Failed to upload attachment.');
                return;
            }
        }

        const msg = await sendMessage(activeChannel.id, userId, text, {
            contentType: opts?.contentType ?? 'text',
            gifUrl: opts?.gifUrl,
            ...fileMetadata,
        });

        // Relay to external
        if (msg && opts?.relayDestinations?.length) {
            const senderName = profiles.get(userId)?.full_name ?? 'Unknown';
            const companyName = profile?.organization ?? 'Unknown';

            // Group by connection_id
            const byConn = new Map<string, string[]>();
            for (const d of opts.relayDestinations) {
                const arr = byConn.get(d.connection_id) ?? [];
                arr.push(d.external_id);
                byConn.set(d.connection_id, arr);
            }

            for (const [connId, chIds] of byConn) {
                relayToExternal({
                    companyId,
                    connectionId: connId,
                    channelIds: chIds,
                    messageText: text,
                    senderName,
                    companyName,
                    internalMessageId: msg.id,
                }).catch(err => logger.warn('[Chat] relay failed:', err));
            }
        }
    }, [activeChannel, userId, companyId, profiles, profile]);

    const handleThreadSend = useCallback(async (
        text: string,
        opts?: { gifUrl?: string; contentType?: 'text' | 'gif' | 'file' | 'audio' | 'meeting'; file?: File },
    ) => {
        if (!activeChannel || !userId || !companyId || !threadParent) return;

        let fileMetadata = {};
        if (opts?.file) {
            try {
                const uploaded = await uploadChatAttachment(opts.file, companyId);
                fileMetadata = {
                    fileUrl: uploaded.url,
                    fileName: uploaded.name,
                    fileSize: uploaded.size,
                    fileType: uploaded.type,
                };
            } catch (err) {
                logger.error('Failed to upload attachment:', err);
                alert('Failed to upload attachment.');
                return;
            }
        }

        await sendMessage(activeChannel.id, userId, text, {
            parentId: threadParent.id,
            contentType: opts?.contentType ?? 'text',
            gifUrl: opts?.gifUrl,
            ...fileMetadata,
        });
    }, [activeChannel, userId, threadParent, companyId]);

    const handleEdit = async (id: string, content: string) => {
        await editMessage(id, content);
        setMessages(prev => prev.map(m => m.id === id ? { ...m, content, is_edited: true } : m));
    };

    const handleDelete = async (id: string) => {
        await deleteMessage(id);
        setMessages(prev => prev.map(m => m.id === id ? { ...m, is_deleted: true, content: '[message deleted]' } : m));
    };

    const handlePin = async (id: string, pinned: boolean) => {
        await pinMessage(id, pinned);
        setMessages(prev => prev.map(m => m.id === id ? { ...m, is_pinned: pinned } : m));
    };

    const handleReact = async (id: string, emoji: string) => {
        if (!userId) return;
        await addReaction(id, userId, emoji);
        setMessages(prev => prev.map(m => {
            if (m.id !== id) return m;
            const reactions = [...(m.reactions ?? [])];
            const existing = reactions.find(r => r.emoji === emoji);
            if (existing) {
                existing.count++;
                existing.users.push(userId);
                existing.reacted_by_me = true;
            } else {
                reactions.push({ emoji, count: 1, users: [userId], reacted_by_me: true });
            }
            return { ...m, reactions };
        }));
    };

    const handleRemoveReaction = async (id: string, emoji: string) => {
        if (!userId) return;
        await removeReaction(id, userId, emoji);
        setMessages(prev => prev.map(m => {
            if (m.id !== id) return m;
            const reactions = (m.reactions ?? [])
                .map(r => r.emoji === emoji ? { ...r, count: r.count - 1, users: r.users.filter(u => u !== userId), reacted_by_me: false } : r)
                .filter(r => r.count > 0);
            return { ...m, reactions };
        }));
    };

    const handleCreateChannel = async (name: string, description: string) => {
        if (!companyId || !userId) return;
        const ch = await createChannel(companyId, name, description, userId);
        if (ch) {
            await joinChannel(ch.id, userId);
            setChannels(prev => [...prev, ch]);
            setActiveChannel(ch);
        }
    };

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (!query.trim() || !companyId) {
            setSearchResults(null);
            return;
        }
        const results = await searchMessages(companyId, query);
        setSearchResults(results);
    };

    const handleLoadMore = async () => {
        if (!activeChannel || !messages.length || loading) return;
        setLoading(true);
        const oldest = messages[0]?.created_at;
        const older = await fetchMessages(activeChannel.id, { limit: 50, before: oldest });
        if (older.length > 0 && userId) {
            const reactions = await getReactionsForMessages(older.map(m => m.id), userId);
            for (const m of older) {
                m.reactions = reactions[m.id] ?? [];
            }
        }
        setMessages(prev => [...older, ...prev]);
        setHasMore(older.length >= 50);
        setLoading(false);
    };

    // ── Role check for #announcements ──────────────────────────
    const isAnnouncementsOnly = activeChannel?.channel_type === 'announcements';
    const canPostAnnouncements = ['executive', 'exec', 'admin', 'owner'].includes(
        (userRole ?? '').toLowerCase(),
    );
    const composerDisabled = isAnnouncementsOnly && !canPostAnnouncements;

    const pinnedMessages = messages.filter(m => m.is_pinned);

    // ── Render ─────────────────────────────────────────────────
    if (!companyId || !userId) {
        return (
            <div className="flex items-center justify-center h-full text-[var(--color-text-tertiary)]">
                <p>Loading…</p>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-64px)] dash-surface rounded-xl overflow-hidden border dash-border shadow-md">
            {/* Channel sidebar */}
            <ChannelSidebar
                channels={channels}
                activeChannelId={activeChannel?.id ?? null}
                unreadCounts={unreadCounts}
                onSelect={(ch) => setActiveChannel(ch)}
                onCreate={handleCreateChannel}
                onSearch={handleSearch}
                profiles={profileList}
                meetings={meetings}
                onlineCount={profileList.length} // Just using list length for now as a realistic proxy
            />

            {/* Main content area */}
            <div className="flex-1 flex flex-col min-w-0">
                {activeChannel ? (
                    <>
                        {/* Channel header */}
                        <div className="flex items-center justify-between px-5 py-3 border-b dash-border dash-surface backdrop-blur-md">
                            <div className="flex items-center gap-2.5">
                                {activeChannel.channel_type === 'announcements' ? (
                                    <Megaphone className="w-5 h-5 text-[var(--color-warning)]" />
                                ) : (
                                    <Hash className="w-5 h-5 dash-text-secondary" />
                                )}
                                <div>
                                    <h2 className="text-sm font-bold dash-text">{activeChannel.name}</h2>
                                    {activeChannel.description && (
                                        <p className="text-xs dash-text-tertiary">{activeChannel.description}</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setShowPinned(!showPinned)}
                                    className={`p-2 rounded-lg transition-colors ${showPinned ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' : 'hover:dash-surface-alt dash-text-tertiary'}`}
                                    title="Pinned messages"
                                >
                                    <Pin className="w-4 h-4" />
                                    {pinnedMessages.length > 0 && (
                                        <span className="ml-1 text-xs font-bold">{pinnedMessages.length}</span>
                                    )}
                                </button>
                                <button
                                    onClick={() => { setShowInfo(!showInfo); setShowPinned(false); setThreadParent(null); }}
                                    className={`p-2 rounded-lg transition-colors ${showInfo ? 'bg-behance-blue/10 text-behance-blue' : 'hover:dash-surface-alt dash-text-tertiary'}`}
                                    title="Channel Info"
                                >
                                    <MessageSquare className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Search results overlay */}
                        {searchResults !== null ? (
                            <div className="flex-1 overflow-y-auto p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold dash-text">
                                        Search results for "{searchQuery}" ({searchResults.length})
                                    </h3>
                                    <button
                                        onClick={() => { setSearchResults(null); setSearchQuery(''); }}
                                        className="p-1 rounded hover:dash-surface-alt"
                                    >
                                        <X className="w-4 h-4 dash-text-secondary" />
                                    </button>
                                </div>
                                {searchResults.length === 0 ? (
                                    <p className="text-sm dash-text-secondary text-center py-8">No messages found</p>
                                ) : (
                                    searchResults.map((msg) => {
                                        const p = profiles.get(msg.sender_id);
                                        const senderName = p?.full_name ?? 'Unknown';
                                        const senderAvatar = p?.avatar_url;
                                        const initials = senderName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                                        const avatarColor = `hsl(${senderName.charCodeAt(0) * 37 % 360}, 55%, 55%)`;

                                        return (
                                            <div key={msg.id} className="mb-2 p-3 dash-surface-alt rounded-lg border dash-border flex gap-3">
                                                <div
                                                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
                                                    style={{ backgroundColor: avatarColor }}
                                                >
                                                    {senderAvatar ? (
                                                        <img src={senderAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                                                    ) : initials}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-semibold dash-text">{senderName}</span>
                                                        <span className="text-[10px] dash-text-tertiary">
                                                            {new Date(msg.created_at).toLocaleString()}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm dash-text-secondary">{msg.content}</p>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        ) : showPinned ? (
                            /* Pinned messages panel */
                            <div className="flex-1 overflow-y-auto p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold dash-text flex items-center gap-2">
                                        <Pin className="w-4 h-4 text-[var(--color-warning)]" />
                                        Pinned Messages ({pinnedMessages.length})
                                    </h3>
                                    <button onClick={() => setShowPinned(false)} className="p-1 rounded hover:dash-surface-alt">
                                        <X className="w-4 h-4 dash-text-secondary" />
                                    </button>
                                </div>
                                {pinnedMessages.length === 0 ? (
                                    <p className="text-sm dash-text-secondary text-center py-8">No pinned messages</p>
                                ) : (
                                    pinnedMessages.map((msg) => (
                                        <MessageBubble
                                            key={msg.id}
                                            msg={msg}
                                            senderName={profiles.get(msg.sender_id)?.full_name ?? 'Unknown'}
                                            senderAvatar={profiles.get(msg.sender_id)?.avatar_url}
                                            isOwnMessage={msg.sender_id === userId}
                                            onPin={handlePin}
                                        />
                                    ))
                                )}
                            </div>
                        ) : (
                            /* Message feed */
                            <MessageFeed
                                messages={messages}
                                currentUserId={userId}
                                profiles={profiles}
                                onLoadMore={handleLoadMore}
                                hasMore={hasMore}
                                loading={loading}
                                onReply={(msg) => setThreadParent(msg)}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                onPin={handlePin}
                                onReact={handleReact}
                                onRemoveReaction={handleRemoveReaction}
                                replyCounts={replyCounts}
                            />
                        )}

                        {/* Composer */}
                        <ChatComposer
                            companyId={companyId}
                            channelId={activeChannel.id}
                            onSend={handleSend}
                            disabled={composerDisabled}
                            placeholder={
                                composerDisabled
                                    ? '🔒 Only Executives and Admins can post in #announcements'
                                    : `Message #${activeChannel.name}…`
                            }
                            profiles={profileList}
                            currentUserAvatar={profiles.get(userId)?.avatar_url}
                            currentUserName={profiles.get(userId)?.full_name ?? (profile as any)?.full_name ?? 'Me'}
                        />
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full dash-text-secondary">
                        <div className="text-center">
                            <MessageSquare className="w-12 h-12 mx-auto mb-3 dash-text-tertiary" />
                            <p className="text-sm font-medium">Select a channel to start chatting</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Thread panel */}
            {threadParent && (
                <div className="w-80 border-l dash-border flex flex-col dash-surface-alt">
                    <div className="flex items-center justify-between px-4 py-3 border-b dash-border">
                        <h3 className="text-sm font-bold dash-text">Thread</h3>
                        <button
                            onClick={() => setThreadParent(null)}
                            className="p-1 rounded-lg hover:dash-surface-alt transition-colors"
                        >
                            <X className="w-4 h-4 dash-text-secondary" />
                        </button>
                    </div>

                    {/* Parent message */}
                    <div className="border-b dash-border dash-surface">
                        <MessageBubble
                            msg={threadParent}
                            senderName={profiles.get(threadParent.sender_id)?.full_name ?? 'Unknown'}
                            senderAvatar={profiles.get(threadParent.sender_id)?.avatar_url}
                            isOwnMessage={threadParent.sender_id === userId}
                        />
                    </div>

                    {/* Thread replies */}
                    <div className="flex-1 overflow-y-auto">
                        {threadMessages.length === 0 ? (
                            <div className="p-4 text-center text-xs dash-text-secondary">
                                No replies yet. Start a thread!
                            </div>
                        ) : (
                            threadMessages.map((msg) => (
                                <MessageBubble
                                    key={msg.id}
                                    msg={msg}
                                    senderName={profiles.get(msg.sender_id)?.full_name ?? 'Unknown'}
                                    senderAvatar={profiles.get(msg.sender_id)?.avatar_url}
                                    isOwnMessage={msg.sender_id === userId}
                                    onEdit={handleEdit}
                                    onDelete={handleDelete}
                                    onReact={handleReact}
                                    onRemoveReaction={handleRemoveReaction}
                                />
                            ))
                        )}
                    </div>

                    {/* Thread composer */}
                    <ChatComposer
                        companyId={companyId}
                        channelId={activeChannel?.id ?? ''}
                        onSend={handleThreadSend}
                        placeholder="Reply in thread…"
                        profiles={profileList}
                        parentId={threadParent.id}
                        currentUserAvatar={profiles.get(userId)?.avatar_url}
                        currentUserName={profiles.get(userId)?.full_name ?? (profile as any)?.full_name ?? 'Me'}
                    />
                </div>
            )}

            {/* Info panel */}
            {showInfo && !threadParent && !showPinned && (
                <ChatInfoSidebar
                    onClose={() => setShowInfo(false)}
                    messages={messages}
                />
            )}
        </div>
    );
}
