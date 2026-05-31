// src/components/Chat/MessageFeed.tsx
import { useRef, useEffect, useCallback } from 'react';
import type { ChatMessage } from '../../lib/chatService';
import MessageBubble from './MessageBubble';

interface MessageFeedProps {
    messages: ChatMessage[];
    currentUserId: string;
    profiles: Map<string, { full_name: string; avatar_url?: string }>;
    onLoadMore?: () => void;
    hasMore?: boolean;
    loading?: boolean;
    onReply?: (msg: ChatMessage) => void;
    onEdit?: (id: string, content: string) => void;
    onDelete?: (id: string) => void;
    onPin?: (id: string, pinned: boolean) => void;
    onReact?: (id: string, emoji: string) => void;
    onRemoveReaction?: (id: string, emoji: string) => void;
    replyCounts?: Record<string, number>;
}

function formatDate(ts: string): string {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function MessageFeed({
    messages, currentUserId, profiles, onLoadMore, hasMore, loading,
    onReply, onEdit, onDelete, onPin, onReact, onRemoveReaction,
    replyCounts = {},
}: MessageFeedProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const prevLengthRef = useRef(0);

    // Auto-scroll to bottom on new message
    useEffect(() => {
        if (messages.length > prevLengthRef.current) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
        prevLengthRef.current = messages.length;
    }, [messages.length]);

    // Infinite scroll up
    const handleScroll = useCallback(() => {
        if (!containerRef.current || !hasMore || loading) return;
        if (containerRef.current.scrollTop < 80) {
            onLoadMore?.();
        }
    }, [hasMore, loading, onLoadMore]);

    // Group messages by date
    const groups: { date: string; msgs: ChatMessage[] }[] = [];
    for (const msg of messages) {
        const dateStr = formatDate(msg.created_at);
        if (!groups.length || groups[groups.length - 1].date !== dateStr) {
            groups.push({ date: dateStr, msgs: [msg] });
        } else {
            groups[groups.length - 1].msgs.push(msg);
        }
    }

    return (
        <div
            ref={containerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto"
        >
            {/* Load more */}
            {loading && (
                <div className="text-center py-3">
                    <div className="inline-flex items-center gap-2 text-xs dash-text-secondary">
                        <div className="w-4 h-4 border-2 border-behance-blue/30 border-t-behance-blue rounded-full animate-spin" />
                        Loading…
                    </div>
                </div>
            )}

            {hasMore && !loading && (
                <button
                    onClick={onLoadMore}
                    className="w-full text-center py-2 text-xs text-behance-blue hover:opacity-80 font-medium"
                >
                    Load earlier messages…
                </button>
            )}

            {/* Empty state */}
            {messages.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center h-full dash-text-secondary">
                    <div className="w-16 h-16 rounded-full bg-behance-blue/10 flex items-center justify-center mb-4">
                        <span className="text-3xl">💬</span>
                    </div>
                    <p className="text-sm font-medium">No messages yet</p>
                    <p className="text-xs mt-1">Be the first to say something!</p>
                </div>
            )}

            {/* Messages grouped by date */}
            {groups.map((group) => (
                <div key={group.date}>
                    {/* Date divider */}
                    <div className="flex items-center gap-4 px-5 py-3">
                        <div className="flex-1 h-px dash-border" />
                        <span className="text-[11px] font-semibold dash-text-tertiary uppercase tracking-wider">
                            {group.date}
                        </span>
                        <div className="flex-1 h-px dash-border" />
                    </div>

                    {/* Messages */}
                    {group.msgs.map((msg) => {
                        const profile = profiles.get(msg.sender_id);
                        return (
                            <MessageBubble
                                key={msg.id}
                                msg={msg}
                                senderName={profile?.full_name ?? 'Unknown'}
                                senderAvatar={profile?.avatar_url}
                                isOwnMessage={msg.sender_id === currentUserId}
                                onReply={() => onReply?.(msg)}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                onPin={onPin}
                                onReact={onReact}
                                onRemoveReaction={onRemoveReaction}
                                replyCount={replyCounts[msg.id] ?? msg.reply_count ?? 0}
                            />
                        );
                    })}
                </div>
            ))}

            <div ref={bottomRef} />
        </div>
    );
}
