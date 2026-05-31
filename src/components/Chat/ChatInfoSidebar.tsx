// src/components/Chat/ChatInfoSidebar.tsx
import { X, Image as ImageIcon, FileText, Link as LinkIcon, ChevronRight } from 'lucide-react';
import type { ChatMessage } from '../../lib/chatService';

interface ChatInfoSidebarProps {
    onClose: () => void;
    messages: ChatMessage[];
}

export default function ChatInfoSidebar({ onClose, messages }: ChatInfoSidebarProps) {
    // Extract media, files, and links from messages
    const mediaFiles = messages.filter(m => m.content_type === 'gif' || (m.content_type === 'file' && m.file_type?.startsWith('image/')));
    const docs = messages.filter(m => m.content_type === 'file' && !m.file_type?.startsWith('image/'));

    // Extract links from text content
    const links: { url: string; title: string; sender_id: string }[] = [];
    messages.forEach(m => {
        if (m.content_type === 'text') {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const matches = m.content.match(urlRegex);
            if (matches) {
                matches.forEach(url => {
                    links.push({ url, title: new URL(url).hostname, sender_id: m.sender_id });
                });
            }
        }
    });

    return (
        <div className="w-80 border-l dash-border flex flex-col h-full bg-[var(--color-surface)] shadow-xl relative z-20">
            {/* Header */}
            <div className="p-4 border-b dash-border flex items-center justify-between">
                <h3 className="text-sm font-bold dash-text">Shared Content</h3>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:dash-surface-alt transition-colors dash-text-tertiary"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-8 scrollbar-hide">
                {/* Media Files */}
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <ImageIcon className="w-4 h-4 text-behance-blue" />
                            <h4 className="text-xs font-bold uppercase tracking-wider dash-text-secondary">Media files</h4>
                        </div>
                        <button className="text-[10px] font-bold text-behance-blue hover:underline">See all</button>
                    </div>
                    {mediaFiles.length === 0 ? (
                        <p className="text-[10px] dash-text-tertiary italic">No media shared yet</p>
                    ) : (
                        <div className="grid grid-cols-3 gap-2">
                            {mediaFiles.slice(0, 6).map((m, i) => (
                                <div key={i} className="aspect-square rounded-lg bg-dash-surface-alt overflow-hidden border dash-border group cursor-pointer relative">
                                    <img
                                        src={m.content_type === 'gif' ? m.gif_url! : m.file_url!}
                                        alt=""
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <ChevronRight className="w-4 h-4 text-white" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Shared Files */}
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-[var(--color-warning)]" />
                            <h4 className="text-xs font-bold uppercase tracking-wider dash-text-secondary">Shared files</h4>
                        </div>
                        <button className="text-[10px] font-bold text-behance-blue hover:underline">See all</button>
                    </div>
                    {docs.length === 0 ? (
                        <p className="text-[10px] dash-text-tertiary italic">No files shared yet</p>
                    ) : (
                        <div className="space-y-2">
                            {docs.slice(0, 5).map((m, i) => (
                                <a
                                    key={i}
                                    href={m.file_url!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 p-2 rounded-xl hover:dash-surface-alt transition-colors group border dash-border border-transparent hover:border-behance-blue/20"
                                >
                                    <div className="w-9 h-9 rounded-lg bg-dash-surface-alt flex items-center justify-center text-[var(--color-warning)]">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold dash-text truncate">{m.file_name}</p>
                                        <p className="text-[10px] dash-text-tertiary">Download</p>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </section>

                {/* Shared Links */}
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <LinkIcon className="w-4 h-4 text-[var(--color-purple)]" />
                            <h4 className="text-xs font-bold uppercase tracking-wider dash-text-secondary">Shared Links</h4>
                        </div>
                        <button className="text-[10px] font-bold text-behance-blue hover:underline">See all</button>
                    </div>
                    {links.length === 0 ? (
                        <p className="text-[10px] dash-text-tertiary italic">No links shared yet</p>
                    ) : (
                        <div className="space-y-2">
                            {links.slice(0, 5).map((l, i) => (
                                <a
                                    key={i}
                                    href={l.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 p-2 rounded-xl hover:dash-surface-alt transition-colors group border dash-border border-transparent hover:border-behance-blue/20"
                                >
                                    <div className="w-9 h-9 rounded-lg bg-dash-surface-alt flex items-center justify-center text-[var(--color-purple)] overflow-hidden">
                                        <img src={`https://www.google.com/s2/favicons?domain=${l.url}&sz=32`} alt="" className="w-5 h-5 opacity-60 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold dash-text truncate">{l.title}</p>
                                        <p className="text-[10px] dash-text-tertiary truncate">{l.url.replace(/^https?:\/\//, '')}</p>
                                    </div>
                                    <LinkIcon className="w-3 h-3 dash-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                                </a>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
