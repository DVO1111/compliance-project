// src/components/Chat/MessageBubble.tsx
import { useState } from 'react';
import {
    MessageCircle, Pin, Pencil, Trash2,
    SmilePlus, ExternalLink, Paperclip, Calendar, Clock,
    Play, Download, FileText
} from 'lucide-react';
import type { ChatMessage } from '../../lib/chatService';
import EmojiPicker from './EmojiPicker';

interface MessageBubbleProps {
    msg: ChatMessage;
    senderName: string;
    senderAvatar?: string;
    isOwnMessage: boolean;
    onReply?: () => void;
    onEdit?: (id: string, content: string) => void;
    onDelete?: (id: string) => void;
    onPin?: (id: string, pinned: boolean) => void;
    onReact?: (id: string, emoji: string) => void;
    onRemoveReaction?: (id: string, emoji: string) => void;
    replyCount?: number;
}

function formatTime(ts: string) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderContent(content: string) {
    // Highlight @mentions
    return content.replace(/@([a-zA-Z0-9._-]+)/g, '<span class="text-behance-blue font-semibold bg-behance-blue/10 px-1 rounded">@$1</span>');
}

const VoiceWaveform = ({ playing }: { playing: boolean }) => (
    <div className="flex items-center gap-0.5 h-6">
        {[0.4, 0.7, 0.5, 0.9, 0.6, 0.3, 0.8, 0.5, 0.9, 0.4, 0.7, 0.5, 0.8].map((h, i) => (
            <div
                key={i}
                className={`w-0.5 rounded-full bg-white/60 transition-all duration-300 ${playing ? 'animate-pulse' : ''}`}
                style={{ height: `${h * 100}%`, animationDelay: `${i * 0.1}s` }}
            />
        ))}
    </div>
);

const LinkPreview = ({ url }: { url: string }) => {
    let hostname = '';
    try {
        hostname = new URL(url).hostname;
    } catch (e) {
        hostname = url;
    }

    // Generic metadata logic
    const title = hostname.split('.').slice(-2, -1)[0]?.toUpperCase() || hostname;
    const description = `Visit ${hostname} to view more details about this shared content. Access resources, documentation, and collaboration tools directly.`;

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block max-w-md overflow-hidden rounded-2xl border dash-border bg-dash-surface-alt hover:border-behance-blue/40 transition-all group/link"
        >
            <div className="flex flex-col">
                <div className="h-24 bg-gradient-to-br from-dash-surface to-dash-surface-alt overflow-hidden relative flex items-center justify-center">
                    <img
                        src={`https://www.google.com/s2/favicons?domain=${url}&sz=128`}
                        alt=""
                        className="w-12 h-12 opacity-50 blur-[2px] absolute inset-0 m-auto scale-[3]"
                    />
                    <img
                        src={`https://www.google.com/s2/favicons?domain=${url}&sz=64`}
                        alt=""
                        className="w-10 h-10 relative z-10 drop-shadow-xl"
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-[10px] font-bold text-white backdrop-blur-md border border-white/10 uppercase tracking-widest">
                        External Link
                    </div>
                </div>
                <div className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <img src={`https://www.google.com/s2/favicons?domain=${url}&sz=32`} alt="" className="w-3 h-3" />
                        <span className="text-[10px] font-bold dash-text-tertiary uppercase tracking-widest">{hostname}</span>
                    </div>
                    <h4 className="text-sm font-bold dash-text group-hover/link:text-behance-blue transition-colors truncate">
                        {title}
                    </h4>
                    <p className="text-xs dash-text-tertiary mt-1 line-clamp-2 leading-relaxed">
                        {description}
                    </p>
                </div>
            </div>
        </a>
    );
};

export default function MessageBubble({
    msg, senderName, senderAvatar, isOwnMessage,
    onReply, onEdit, onDelete, onPin, onReact, onRemoveReaction,
    replyCount = 0,
}: MessageBubbleProps) {
    const [showActions, setShowActions] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState(msg.content);

    const handleSaveEdit = () => {
        if (editText.trim() && editText !== msg.content) {
            onEdit?.(msg.id, editText.trim());
        }
        setEditing(false);
    };

    const initials = senderName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const avatarColor = `hsl(${senderName.charCodeAt(0) * 37 % 360}, 55%, 55%)`;

    return (
        <div
            className="group flex gap-3 px-5 py-1.5 hover:dash-surface-alt transition-colors relative"
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => { setShowActions(false); setShowEmojiPicker(false); }}
        >
            {/* Avatar */}
            <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
                style={{ backgroundColor: avatarColor }}
            >
                {senderAvatar ? (
                    <img src={senderAvatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                ) : initials}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold dash-text">{senderName}</span>
                    <span className="text-[10px] dash-text-tertiary">{formatTime(msg.created_at)}</span>
                    {msg.is_edited && <span className="text-[10px] dash-text-tertiary italic">(edited)</span>}
                    {msg.is_pinned && <Pin className="w-3 h-3 text-[var(--color-warning)] inline-block" />}
                    {msg.relay_sent && <ExternalLink className="w-3 h-3 text-[var(--color-purple)] inline-block" />}
                </div>

                {editing ? (
                    <div className="mt-1">
                        <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full dash-surface-alt border dash-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-behance-blue dash-text resize-none"
                            rows={2}
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); } if (e.key === 'Escape') setEditing(false); }}
                        />
                        <div className="flex gap-1.5 mt-1">
                            <button onClick={handleSaveEdit} className="text-xs text-white bg-behance-blue px-2.5 py-1 rounded-md hover:opacity-90">Save</button>
                            <button onClick={() => setEditing(false)} className="text-xs dash-text-secondary px-2.5 py-1 rounded-md hover:dash-surface-alt">Cancel</button>
                        </div>
                    </div>
                ) : msg.content_type === 'gif' && msg.gif_url ? (
                    <div className="mt-1">
                        <img src={msg.gif_url} alt="GIF" className="max-w-xs rounded-lg border dash-border" loading="lazy" />
                        {msg.content && <p className="text-sm dash-text-secondary mt-1">{msg.content}</p>}
                    </div>
                ) : msg.content_type === 'file' && msg.file_url ? (
                    <div className="mt-1 pb-1">
                        <a
                            href={msg.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-4 p-3 pr-5 bg-dash-surface-alt border dash-border rounded-xl shadow-sm hover:border-behance-blue/40 transition-all group/file relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-behance-blue/5 opacity-0 group-hover/file:opacity-100 transition-opacity" />
                            <div className="w-12 h-12 bg-behance-blue/10 rounded-xl flex items-center justify-center text-behance-blue shrink-0">
                                {msg.file_type?.includes('pdf') ? <FileText className="w-6 h-6" /> : <Paperclip className="w-6 h-6" />}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-sm font-bold dash-text truncate">{msg.file_name}</span>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] font-bold dash-text-tertiary uppercase tracking-widest">
                                        {(msg.file_size || 0) < 1024 * 1024 ? Math.round((msg.file_size || 0) / 1024) + ' KB' : (Math.round((msg.file_size || 0) / (1024 * 1024) * 10) / 10) + ' MB'}
                                    </span>
                                    <span className="text-[10px] text-behance-blue font-bold flex items-center gap-1">
                                        <Download className="w-3 h-3" />
                                        Download
                                    </span>
                                </div>
                            </div>
                        </a>
                        {msg.content && <p className="text-sm dash-text-secondary mt-2 px-1">{msg.content}</p>}
                    </div>
                ) : msg.content_type === 'audio' && msg.file_url ? (
                    <div className="mt-2 max-w-xs">
                        <div className="bg-gradient-to-br from-behance-blue to-indigo-600 p-3 rounded-2xl shadow-lg shadow-behance-blue/20 flex items-center gap-4">
                            <button className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md flex items-center justify-center text-white transition-all">
                                <Play className="w-4 h-4 fill-white ml-0.5" />
                            </button>
                            <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Voice message</span>
                                    <span className="text-[10px] font-bold text-white/90 tracking-tighter">00:42</span>
                                </div>
                                <VoiceWaveform playing={false} />
                            </div>
                        </div>
                        {msg.content && <p className="text-sm dash-text-secondary mt-2 px-1">{msg.content}</p>}
                    </div>
                ) : msg.content_type === 'meeting' ? (() => {
                    try {
                        const data = JSON.parse(msg.content);
                        const start = new Date(data.startTime);
                        return (
                            <div className="mt-1.5 max-w-sm">
                                <div className="p-4 dash-surface border-2 border-behance-blue/30 rounded-2xl shadow-sm hover:border-behance-blue/50 transition-all group/meeting">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="p-2.5 bg-behance-blue/10 rounded-xl text-behance-blue group-hover/meeting:bg-behance-blue group-hover/meeting:text-white transition-colors">
                                            <Calendar className="w-5 h-5" />
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[10px] font-bold text-behance-blue uppercase tracking-widest block mb-0.5">Meeting Schedule</span>
                                            <span className="text-[10px] dash-text-tertiary">{data.duration} mins</span>
                                        </div>
                                    </div>
                                    <h4 className="font-bold dash-text text-base mb-1 group-hover/meeting:text-behance-blue transition-colors line-clamp-2">{data.title}</h4>
                                    <div className="space-y-2 mt-3">
                                        <div className="flex items-center gap-2 text-xs dash-text-secondary bg-dash-surface-alt p-1.5 rounded-lg border dash-border">
                                            <Clock className="w-3.5 h-3.5 text-behance-blue" />
                                            <span>
                                                {start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        {data.description && (
                                            <p className="text-xs dash-text-tertiary line-clamp-2 italic ml-1">
                                                "{data.description}"
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => window.location.href = '#calendar'}
                                        className="w-full mt-4 flex items-center justify-center gap-2 py-2 px-3 bg-behance-blue/5 hover:bg-behance-blue text-behance-blue hover:text-white rounded-xl text-xs font-bold transition-all border border-behance-blue/20"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        View in Calendar
                                    </button>
                                </div>
                            </div>
                        );
                    } catch (e) {
                        return <p className="text-sm dash-text mt-0.5">{msg.content}</p>;
                    }
                })() : msg.content_type === 'system' ? (
                    <p className="text-xs dash-text-tertiary italic mt-0.5">{msg.content}</p>
                ) : (
                    <div className="mt-0.5">
                        <p
                            className="text-sm dash-text whitespace-pre-wrap break-words leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
                        />
                        {/* URL detection for LinkPreview */}
                        {msg.content_type === 'text' && msg.content.includes('http') && (
                            msg.content.match(/(https?:\/\/[^\s]+)/g)?.map((url, i) => (
                                <LinkPreview key={i} url={url} />
                            ))
                        )}
                    </div>
                )}

                {/* Reactions */}
                {msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                        {msg.reactions.map((r) => (
                            <button
                                key={r.emoji}
                                onClick={() => r.reacted_by_me ? onRemoveReaction?.(msg.id, r.emoji) : onReact?.(msg.id, r.emoji)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${r.reacted_by_me
                                    ? 'bg-behance-blue/10 border-behance-blue/30 text-behance-blue'
                                    : 'dash-surface-alt dash-border dash-text-secondary hover:border-behance-blue/50'
                                    }`}
                            >
                                <span>{r.emoji}</span>
                                <span className="font-medium">{r.count}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Thread reply count */}
                {replyCount > 0 && !msg.parent_id && (
                    <button
                        onClick={onReply}
                        className="flex items-center gap-1.5 mt-1.5 text-xs text-behance-blue hover:text-[var(--color-info)] font-medium"
                    >
                        <MessageCircle className="w-3.5 h-3.5" />
                        {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                    </button>
                )}
            </div>

            {/* Hover Actions */}
            {showActions && !editing && (
                <div className="absolute right-3 -top-3 flex items-center gap-0.5 dash-surface border dash-border rounded-lg shadow-lg px-1 py-0.5">
                    <button
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="p-1.5 rounded-md hover:dash-surface-alt transition-colors"
                        title="Add reaction"
                    >
                        <SmilePlus className="w-3.5 h-3.5 dash-text-secondary" />
                    </button>
                    {!msg.parent_id && (
                        <button onClick={onReply} className="p-1.5 rounded-md hover:dash-surface-alt transition-colors" title="Reply in thread">
                            <MessageCircle className="w-3.5 h-3.5 dash-text-secondary" />
                        </button>
                    )}
                    {isOwnMessage && (
                        <button onClick={() => { setEditing(true); setEditText(msg.content); }} className="p-1.5 rounded-md hover:dash-surface-alt transition-colors" title="Edit">
                            <Pencil className="w-3.5 h-3.5 dash-text-secondary" />
                        </button>
                    )}
                    <button onClick={() => onPin?.(msg.id, !msg.is_pinned)} className="p-1.5 rounded-md hover:dash-surface-alt transition-colors" title={msg.is_pinned ? 'Unpin' : 'Pin'}>
                        <Pin className={`w-3.5 h-3.5 ${msg.is_pinned ? 'text-[var(--color-warning)]' : 'dash-text-secondary'}`} />
                    </button>
                    {isOwnMessage && (
                        <button onClick={() => onDelete?.(msg.id)} className="p-1.5 rounded-md hover:bg-[var(--color-danger)]/10 transition-colors" title="Delete">
                            <Trash2 className="w-3.5 h-3.5 text-[var(--color-danger)]" />
                        </button>
                    )}
                </div>
            )}

            {/* Emoji picker popover */}
            {showEmojiPicker && (
                <div className="absolute right-3 -top-56 z-50">
                    <EmojiPicker
                        onSelect={(emoji) => onReact?.(msg.id, emoji)}
                        onClose={() => setShowEmojiPicker(false)}
                    />
                </div>
            )}
        </div>
    );
}
