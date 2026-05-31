// src/components/Chat/ChannelSidebar.tsx
import { useState } from 'react';
import {
    Hash, Plus, Search, Megaphone,
    MessageSquare, ChevronDown, ChevronRight, X,
} from 'lucide-react';
import type { ChatChannel, UnreadCount } from '../../lib/chatService';
import type { CalendarEvent } from '../../lib/calendarService';

interface ChannelSidebarProps {
    channels: ChatChannel[];
    activeChannelId: string | null;
    unreadCounts: UnreadCount[];
    onSelect: (channel: ChatChannel) => void;
    onCreate: (name: string, description: string) => void;
    onSearch: (query: string) => void;
    profiles: { id: string; full_name: string; avatar_url?: string }[];
    meetings: CalendarEvent[];
    onlineCount: number;
}

export default function ChannelSidebar({
    channels, activeChannelId, unreadCounts, onSelect, onCreate, onSearch, profiles,
    meetings, onlineCount,
}: ChannelSidebarProps) {
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [meetingsExpanded, setMeetingsExpanded] = useState(true);
    const [channelsExpanded, setChannelsExpanded] = useState(true);
    const [dmExpanded, setDmExpanded] = useState(true);

    const unreadMap = Object.fromEntries(unreadCounts.map(u => [u.channel_id, u.count]));

    const handleCreate = () => {
        if (!newName.trim()) return;
        onCreate(newName.trim(), newDesc.trim());
        setNewName('');
        setNewDesc('');
        setShowCreate(false);
    };

    const channelIcon = (ch: ChatChannel) => {
        if (ch.channel_type === 'announcements') return <Megaphone className="w-4 h-4 text-[var(--color-warning)]" />;
        return <Hash className="w-4 h-4 text-[var(--color-text-tertiary)]" />;
    };

    const handleSearchChange = (val: string) => {
        setSearchQuery(val);
        onSearch(val);
    };

    // Sub-components for better rendering
    const AvatarCircle = ({ name, url, color }: { name: string, url?: string, color?: string }) => {
        const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const avatarColor = color || `hsl(${name.charCodeAt(0) * 37 % 360}, 55%, 55%)`;
        return (
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 overflow-hidden" style={{ backgroundColor: avatarColor }}>
                {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : initials}
            </div>
        );
    };

    return (
        <div className="w-64 dash-card flex flex-col h-full border-r dash-border bg-[var(--color-surface)] relative transition-all duration-300">
            {/* Header */}
            <div className="p-4 border-b dash-border">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-behance-blue flex items-center justify-center shadow-lg shadow-behance-blue/20">
                            <MessageSquare className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold tracking-tight dash-text">Team Chat</h2>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm animate-pulse" />
                                <span className="text-[10px] dash-text-tertiary">{onlineCount} Online</span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="p-2 rounded-xl hover:dash-surface-alt transition-all text-behance-blue border border-transparent hover:border-behance-blue/20"
                        title="New channel"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                {/* Search */}
                <div className="relative group">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 dash-text-tertiary group-focus-within:text-behance-blue transition-colors" />
                    <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs dash-surface-alt dash-text rounded-lg border dash-border placeholder-[var(--color-text-tertiary)] focus:ring-1 focus:ring-behance-blue focus:border-behance-blue outline-none transition-all"
                    />
                </div>
            </div>

            {/* Sidebar Sections */}
            <div className="flex-1 overflow-y-auto py-4 scrollbar-hide space-y-6">

                {/* Meetings Section */}
                {meetings.length > 0 && (
                    <div className="space-y-1">
                        <button
                            onClick={() => setMeetingsExpanded(!meetingsExpanded)}
                            className="w-full flex items-center justify-between px-4 py-1 text-[10px] font-bold uppercase tracking-wider dash-text-secondary hover:dash-text transition-colors"
                        >
                            <div className="flex items-center gap-1">
                                {meetingsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                Upcoming Meetings
                            </div>
                        </button>
                        {meetingsExpanded && (
                            <div className="px-2 space-y-0.5">
                                {meetings.map((m) => (
                                    <div
                                        key={m.id}
                                        className="w-full flex flex-col gap-1 px-3 py-2 rounded-xl hover:dash-surface-alt transition-all group border border-transparent hover:border-behance-blue/10"
                                    >
                                        <div className="flex items-center gap-2">
                                            <AvatarCircle name={m.creator_profile?.full_name || 'System'} url={m.creator_profile?.avatar_url} />
                                            <p className="text-xs font-bold dash-text truncate">{m.title}</p>
                                        </div>
                                        <div className="flex items-center justify-between mt-1">
                                            <span className="text-[9px] dash-text-tertiary uppercase tracking-wider">
                                                {new Date(m.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <span className="text-[9px] text-behance-blue font-bold">JOIN</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Channels Section */}
                <div className="space-y-1">
                    <button
                        onClick={() => setChannelsExpanded(!channelsExpanded)}
                        className="w-full flex items-center justify-between px-4 py-1 text-[10px] font-bold uppercase tracking-wider dash-text-secondary hover:dash-text transition-colors"
                    >
                        <div className="flex items-center gap-1">
                            {channelsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            Channels
                        </div>
                    </button>
                    {channelsExpanded && (
                        <div className="px-2 space-y-0.5">
                            {channels.map((ch) => (
                                <button
                                    key={ch.id}
                                    onClick={() => onSelect(ch)}
                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all group ${activeChannelId === ch.id
                                        ? 'bg-behance-blue/10 dash-text'
                                        : 'dash-text-secondary hover:dash-surface-alt hover:dash-text'
                                        }`}
                                >
                                    <div className={`transition-colors ${activeChannelId === ch.id ? 'text-behance-blue' : 'dash-text-tertiary'}`}>
                                        {channelIcon(ch)}
                                    </div>
                                    <span className="truncate flex-1 text-left text-xs font-bold">{ch.name}</span>
                                    {unreadMap[ch.id] > 0 && (
                                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-behance-blue text-white rounded-md min-w-[18px] text-center shadow-lg shadow-behance-blue/30">
                                            {unreadMap[ch.id]}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Personal Messages Section */}
                <div className="space-y-1">
                    <button
                        onClick={() => setDmExpanded(!dmExpanded)}
                        className="w-full flex items-center justify-between px-4 py-1 text-[10px] font-bold uppercase tracking-wider dash-text-secondary hover:dash-text transition-colors"
                    >
                        <div className="flex items-center gap-1">
                            {dmExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            Personal Messages
                        </div>
                        <Plus className="w-3 h-3" />
                    </button>
                    {dmExpanded && (
                        <div className="px-2 space-y-0.5">
                            {profiles.slice(0, 8).map((p) => (
                                <button
                                    key={p.id}
                                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:dash-surface-alt transition-all group"
                                >
                                    <AvatarCircle name={p.full_name} url={p.avatar_url} />
                                    <span className="truncate flex-1 text-left text-xs font-bold dash-text">{p.full_name}</span>
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Status Card (Placeholder - hidden for now until real VOIP integrated) */}
            {/* 
            <div className="p-4 border-t dash-border">
                ...
            </div>
            */}

            {/* Create channel modal */}
            {showCreate && (
                <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
                    <div className="dash-surface rounded-xl p-5 w-80 shadow-2xl border dash-border" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold dash-text">New Channel</h3>
                            <button onClick={() => setShowCreate(false)} className="dash-text-tertiary hover:dash-text-secondary">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <input
                            type="text"
                            placeholder="Channel name (e.g. design)"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="w-full dash-surface-alt border dash-border rounded-lg px-3 py-2 text-sm mb-2 focus:ring-2 focus:ring-behance-blue outline-none dash-text placeholder-[var(--color-text-tertiary)]"
                            autoFocus
                        />
                        <input
                            type="text"
                            placeholder="Description (optional)"
                            value={newDesc}
                            onChange={(e) => setNewDesc(e.target.value)}
                            className="w-full dash-surface-alt border dash-border rounded-lg px-3 py-2 text-sm mb-4 focus:ring-2 focus:ring-behance-blue outline-none dash-text placeholder-[var(--color-text-tertiary)]"
                        />
                        <button
                            onClick={handleCreate}
                            disabled={!newName.trim()}
                            className="w-full py-2 rounded-lg bg-behance-blue text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-all"
                        >
                            Create Channel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
