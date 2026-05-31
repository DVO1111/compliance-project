// src/components/Chat/ChatComposer.tsx
import { useState, useRef, useEffect } from 'react';
import { Send, Plus, Image, X, Paperclip, Mic } from 'lucide-react';
import RelayPicker from './RelayPicker';
import MeetingScheduleModal from './MeetingScheduleModal';
import { createMeetingEvent } from '../../lib/calendarService';
import { useAuth } from '../../contexts/AuthContext';
import type { RelayDestination } from '../../lib/chatService';
import { logger } from '../../lib/logger';

interface ChatComposerProps {
    companyId: string;
    channelId: string;
    onSend: (text: string, opts?: {
        gifUrl?: string;
        contentType?: 'text' | 'gif' | 'file' | 'audio' | 'meeting';
        relayDestinations?: RelayDestination[];
        file?: File;
        meetingId?: string;
    }) => void;
    disabled?: boolean;
    placeholder?: string;
    profiles?: { id: string; full_name: string }[];
    parentId?: string;
    currentUserAvatar?: string;
    currentUserName?: string;
}

export default function ChatComposer({
    companyId, onSend, disabled, placeholder, profiles = [],
}: ChatComposerProps) {
    const [text, setText] = useState('');
    const [showRelay, setShowRelay] = useState(false);
    const [showGif, setShowGif] = useState(false);
    const [gifSearch, setGifSearch] = useState('');
    const [gifs, setGifs] = useState<any[]>([]);
    const [gifLoading, setGifLoading] = useState(false);
    const [relayDests, setRelayDests] = useState<RelayDestination[]>([]);
    const [showMentions, setShowMentions] = useState(false);
    const [showMeetingModal, setShowMeetingModal] = useState(false);
    const { user } = useAuth();
    const [mentionFilter, setMentionFilter] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // File state
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // Audio recording state
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<any>(null);

    // GIF search with Giphy
    useEffect(() => {
        if (!showGif || !gifSearch.trim()) { setGifs([]); return; }
        const t = setTimeout(async () => {
            setGifLoading(true);
            try {
                // Using Giphy public beta key (rate-limited but no secrets needed)
                const r = await fetch(
                    `https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(gifSearch)}&limit=12&rating=g`,
                );
                const d = await r.json();
                setGifs(d.data ?? []);
            } catch { setGifs([]); }
            setGifLoading(false);
        }, 400);
        return () => clearTimeout(t);
    }, [gifSearch, showGif]);

    // Detect @ for mention autocomplete
    useEffect(() => {
        if (!text) { setShowMentions(false); return; }
        const lastAt = text.lastIndexOf('@');
        if (lastAt !== -1 && lastAt === text.length - 1) {
            setShowMentions(true);
            setMentionFilter('');
        } else if (lastAt !== -1) {
            const afterAt = text.slice(lastAt + 1);
            if (/^[a-zA-Z0-9._-]*$/.test(afterAt) && afterAt.length < 30) {
                setShowMentions(true);
                setMentionFilter(afterAt.toLowerCase());
            } else {
                setShowMentions(false);
            }
        } else {
            setShowMentions(false);
        }
    }, [text]);

    // Detect + for relay
    useEffect(() => {
        if (text === '+') {
            setShowRelay(true);
            setText('');
        }
    }, [text]);

    const handleSend = () => {
        if (!text.trim() && relayDests.length === 0 && !selectedFile) return;

        if (selectedFile) {
            onSend(text.trim(), {
                contentType: 'file',
                file: selectedFile,
                relayDestinations: relayDests.length > 0 ? relayDests : undefined
            });
            setSelectedFile(null);
        } else {
            onSend(text.trim(), { relayDestinations: relayDests.length > 0 ? relayDests : undefined });
        }

        setText('');
        setRelayDests([]);
        setShowRelay(false);
        inputRef.current?.focus();
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], `voice_note_${Date.now()}.webm`, { type: 'audio/webm' });
                onSend('', { contentType: 'audio', file: audioFile });

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
                setIsRecording(false);
                setRecordingTime(0);
                clearInterval(timerRef.current);
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
        } catch (err) {
            logger.error('Microphone access denied', err);
            alert('Microphone access is required for voice notes.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
        }
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleGifSelect = (gif: any) => {
        const gifUrl = gif.images?.fixed_height?.url || gif.images?.original?.url;
        if (gifUrl) {
            onSend('', { gifUrl, contentType: 'gif' });
        }
        setShowGif(false);
        setGifSearch('');
        setGifs([]);
    };

    const handleMeetingSchedule = async (meeting: any) => {
        if (!user) return;
        try {
            const startStr = `${meeting.date}T${meeting.startTime}:00.000Z`;
            const startDate = new Date(startStr);
            const endDate = new Date(startDate.getTime() + meeting.duration * 60000);

            const evt = await createMeetingEvent({
                companyId,
                title: meeting.title,
                description: meeting.description,
                startTime: startDate.toISOString(),
                endTime: endDate.toISOString(),
                meetingLink: meeting.meetingLink,
                userId: user.id
            });

            if (evt) {
                const meetingInfo = JSON.stringify({
                    id: evt.id,
                    title: meeting.title,
                    startTime: startDate.toISOString(),
                    duration: meeting.duration,
                    description: meeting.description,
                    meetingLink: meeting.meetingLink
                });
                onSend(meetingInfo, { contentType: 'meeting', meetingId: evt.id });
                setShowMeetingModal(false);
            }
        } catch (err) {
            logger.error('Failed to schedule meeting:', err);
            alert('Failed to schedule meeting. Check console for details.');
        }
    };

    const handleMentionSelect = (name: string) => {
        const lastAt = text.lastIndexOf('@');
        const before = text.slice(0, lastAt);
        setText(`${before}@${name} `);
        setShowMentions(false);
        inputRef.current?.focus();
    };

    const handleRelayToggle = (dest: RelayDestination) => {
        setRelayDests(prev =>
            prev.find(d => d.id === dest.id)
                ? prev.filter(d => d.id !== dest.id)
                : [...prev, dest],
        );
    };

    const filteredProfiles = profiles.filter(p =>
        p.full_name.toLowerCase().includes(mentionFilter),
    ).slice(0, 6);

    return (
        <div className="relative border-t dash-border bg-[var(--color-surface)] px-4 py-3">
            {/* Relay badges */}
            {relayDests.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {relayDests.map((d) => (
                        <span
                            key={d.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-behance-blue/10 text-behance-blue rounded-lg text-[10px] font-bold border border-behance-blue/20 uppercase tracking-widest"
                        >
                            <span className="opacity-70">Relay:</span> {d.external_name}
                            <button onClick={() => handleRelayToggle(d)} className="ml-1 hover:text-behance-blue/60">
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* Selected File Preview */}
            {selectedFile && (
                <div className="flex items-center gap-3 mb-3 p-2 bg-dash-surface-alt border dash-border rounded-xl w-max animate-in fade-in slide-in-from-bottom-2">
                    <div className="w-8 h-8 rounded-lg bg-behance-blue/10 flex items-center justify-center text-behance-blue">
                        <Paperclip className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col pr-2">
                        <span className="text-xs font-bold dash-text truncate max-w-[200px]">{selectedFile.name}</span>
                        <span className="text-[10px] dash-text-tertiary uppercase tracking-widest">Selected File</span>
                    </div>
                    <button onClick={() => setSelectedFile(null)} className="p-1.5 hover:dash-surface-alt rounded-lg text-[var(--color-danger)] transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Composer area */}
            <div className="flex items-center gap-3 bg-dash-surface-alt border dash-border rounded-2xl p-2.5 focus-within:border-behance-blue/50 focus-within:ring-4 focus-within:ring-behance-blue/5 transition-all">
                {/* Actions button (Plus) */}
                <button
                    onClick={() => setShowMeetingModal(true)}
                    className="p-2 rounded-xl hover:dash-surface text-behance-blue transition-all shrink-0"
                    title="Actions"
                >
                    <Plus className="w-5 h-5" />
                </button>

                {/* Input area */}
                <div className="flex-1 relative">
                    {isRecording ? (
                        <div className="flex items-center justify-between px-2 py-1 text-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/30" />
                                <span className="font-bold dash-text uppercase tracking-widest text-[10px]">Recording... {formatTime(recordingTime)}</span>
                            </div>
                            <button onClick={stopRecording} className="text-[10px] font-bold text-red-500 hover:text-red-600 uppercase tracking-widest">
                                Stop & Send
                            </button>
                        </div>
                    ) : (
                        <textarea
                            ref={inputRef}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={placeholder ?? 'Your message...'}
                            disabled={disabled}
                            rows={1}
                            className="w-full bg-transparent border-none px-2 py-1 text-sm resize-none focus:ring-0 outline-none disabled:opacity-50 dash-text placeholder-[var(--color-text-tertiary)]"
                            style={{ minHeight: '24px', maxHeight: '150px' }}
                        />
                    )}

                    {/* Mentions popover */}
                    {showMentions && filteredProfiles.length > 0 && !isRecording && (
                        <div className="absolute bottom-full mb-4 left-0 w-64 dash-surface border dash-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95">
                            <div className="p-2 border-b dash-border bg-dash-surface-alt">
                                <span className="text-[10px] font-bold dash-text-tertiary uppercase tracking-widest">Mention someone</span>
                            </div>
                            {filteredProfiles.map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => handleMentionSelect(p.full_name)}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:dash-surface-alt transition-colors group"
                                >
                                    <div className="w-8 h-8 rounded-full bg-behance-blue/10 flex items-center justify-center text-behance-blue font-bold text-xs group-hover:bg-behance-blue group-hover:text-white transition-colors">
                                        {p.full_name[0]}
                                    </div>
                                    <span className="text-sm font-bold dash-text">{p.full_name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right side actions */}
                <div className="flex items-center gap-2 pr-1">
                    <button
                        onClick={() => { setShowGif(!showGif); }}
                        className={`p-2 rounded-xl transition-all ${showGif ? 'bg-behance-blue/10 text-behance-blue' : 'hover:dash-surface dash-text-tertiary hover:dash-text-secondary'}`}
                        title="GIF"
                    >
                        <Image className="w-5 h-5" />
                    </button>

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 rounded-xl hover:dash-surface dash-text-tertiary hover:dash-text-secondary transition-all"
                        title="File"
                    >
                        <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                        <Paperclip className="w-5 h-5" />
                    </button>

                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`p-2 rounded-xl transition-all ${isRecording ? 'text-red-500 animate-pulse bg-red-500/10' : 'hover:dash-surface dash-text-tertiary hover:dash-text-secondary'}`}
                        title="Voice"
                    >
                        <Mic className="w-5 h-5" />
                    </button>

                    <div className="w-px h-6 bg-dash-border mx-1" />

                    <button
                        onClick={handleSend}
                        disabled={disabled || (!text.trim() && relayDests.length === 0 && !selectedFile)}
                        className="w-10 h-10 rounded-xl bg-behance-blue text-white flex items-center justify-center shadow-lg shadow-behance-blue/20 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:scale-100 transition-all ml-1"
                    >
                        <Send className="w-4 h-4 ml-0.5" />
                    </button>
                </div>
            </div>

            {/* GIF picker */}
            {showGif && (
                <div className="absolute bottom-full mb-2 left-12 w-80 dash-card rounded-xl border dash-border shadow-2xl z-50 overflow-hidden">
                    <div className="p-2 border-b dash-border">
                        <input
                            type="text"
                            placeholder="Search GIFs…"
                            value={gifSearch}
                            onChange={(e) => setGifSearch(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm dash-surface-alt border dash-border rounded-lg focus:ring-2 focus:ring-behance-blue/50 focus:border-behance-blue dash-text placeholder-[var(--color-text-tertiary)] outline-none"
                            autoFocus
                        />
                    </div>
                    <div className="max-h-64 overflow-y-auto p-2">
                        {gifLoading ? (
                            <p className="text-center text-sm dash-text-secondary py-4">Searching…</p>
                        ) : gifs.length === 0 ? (
                            <p className="text-center text-sm dash-text-secondary py-4">
                                {gifSearch ? 'No GIFs found' : 'Type to search GIFs'}
                            </p>
                        ) : (
                            <div className="grid grid-cols-3 gap-1.5">
                                {gifs.map((g: any) => (
                                    <button
                                        key={g.id}
                                        onClick={() => handleGifSelect(g)}
                                        className="rounded-lg overflow-hidden hover:ring-2 hover:ring-indigo-400 transition-all"
                                    >
                                        <img
                                            src={g.images?.fixed_height_small?.url || g.images?.preview_gif?.url}
                                            alt={g.title ?? 'GIF'}
                                            className="w-full h-20 object-cover"
                                            loading="lazy"
                                        />
                                    </button>
                                ))}
                            </div>
                        )}
                        <p className="text-center text-[9px] text-[var(--color-text-tertiary)] mt-1">Powered by GIPHY</p>
                    </div>
                </div>
            )}

            {/* Relay picker */}
            {showRelay && (
                <RelayPicker
                    companyId={companyId}
                    selected={relayDests}
                    onToggle={handleRelayToggle}
                    onClose={() => setShowRelay(false)}
                />
            )}

            {/* Meeting Modal */}
            {showMeetingModal && (
                <MeetingScheduleModal
                    companyId={companyId}
                    profiles={profiles}
                    onClose={() => setShowMeetingModal(false)}
                    onSchedule={handleMeetingSchedule}
                />
            )}
        </div>
    );
}
