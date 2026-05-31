import { useState } from 'react';
import { X, Calendar, Clock, AlignLeft, Video } from 'lucide-react';

interface Props {
    companyId: string;
    profiles: { id: string; full_name: string }[];
    onClose: () => void;
    onSchedule: (meeting: {
        title: string;
        date: string;
        startTime: string;
        duration: number; // minutes
        description: string;
        meetingLink?: string;
    }) => void;
}

export default function MeetingScheduleModal({ onClose, onSchedule }: Props) {
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [startTime, setStartTime] = useState('09:00');
    const [duration, setDuration] = useState(30);
    const [description, setDescription] = useState('');
    const [meetingLink, setMeetingLink] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSchedule = () => {
        if (!title.trim() || !date || !startTime) return;
        setSaving(true);
        onSchedule({
            title,
            date,
            startTime,
            duration,
            description,
            meetingLink
        });
        // We don't close here, the parent will close after the async call
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="dash-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b dash-border dash-surface">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-behance-blue/10 rounded-lg text-behance-blue">
                            <Calendar className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold dash-text">Schedule Meeting</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:dash-surface-alt rounded-lg transition-colors">
                        <X className="w-5 h-5 dash-text-tertiary" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Title */}
                    <div>
                        <label className="text-[11px] font-semibold dash-text-tertiary uppercase tracking-wider block mb-1.5 ml-1">Meeting Title</label>
                        <input
                            type="text"
                            placeholder="e.g. Content Review Sync"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full dash-surface-alt border dash-border rounded-xl px-4 py-2.5 text-sm dash-text focus:ring-2 focus:ring-behance-blue/50 focus:border-behance-blue outline-none transition-all"
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Date */}
                        <div>
                            <label className="text-[11px] font-semibold dash-text-tertiary uppercase tracking-wider block mb-1.5 ml-1">Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary pointer-events-none" />
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    min={new Date().toISOString().split('T')[0]}
                                    className="w-full dash-surface-alt border dash-border rounded-xl pl-10 pr-4 py-2.5 text-sm dash-text focus:ring-2 focus:ring-behance-blue/50 focus:border-behance-blue outline-none"
                                />
                            </div>
                        </div>

                        {/* Start Time */}
                        <div>
                            <label className="text-[11px] font-semibold dash-text-tertiary uppercase tracking-wider block mb-1.5 ml-1">Start Time</label>
                            <div className="relative">
                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary pointer-events-none" />
                                <input
                                    type="time"
                                    value={startTime}
                                    onChange={(e) => setStartTime(e.target.value)}
                                    className="w-full dash-surface-alt border dash-border rounded-xl pl-10 pr-4 py-2.5 text-sm dash-text focus:ring-2 focus:ring-behance-blue/50 focus:border-behance-blue outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Duration */}
                    <div>
                        <label className="text-[11px] font-semibold dash-text-tertiary uppercase tracking-wider block mb-1.5 ml-1">Duration</label>
                        <select
                            value={duration}
                            onChange={(e) => setDuration(Number(e.target.value))}
                            className="w-full dash-surface-alt border dash-border rounded-xl px-4 py-2.5 text-sm dash-text focus:ring-2 focus:ring-behance-blue/50 focus:border-behance-blue outline-none appearance-none cursor-pointer"
                        >
                            <option value={15}>15 minutes</option>
                            <option value={30}>30 minutes</option>
                            <option value={45}>45 minutes</option>
                            <option value={60}>1 hour</option>
                            <option value={90}>1.5 hours</option>
                            <option value={120}>2 hours</option>
                        </select>
                    </div>

                    {/* Meeting Link */}
                    <div>
                        <label className="text-[11px] font-semibold dash-text-tertiary uppercase tracking-wider block mb-1.5 ml-1">Meeting Link (Optional)</label>
                        <div className="relative">
                            <Video className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary pointer-events-none" />
                            <input
                                type="url"
                                placeholder="https://zoom.us/j/..."
                                value={meetingLink}
                                onChange={(e) => setMeetingLink(e.target.value)}
                                className="w-full dash-surface-alt border dash-border rounded-xl pl-10 pr-4 py-2.5 text-sm dash-text focus:ring-2 focus:ring-behance-blue/50 focus:border-behance-blue outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-[11px] font-semibold dash-text-tertiary uppercase tracking-wider block mb-1.5 ml-1">Agenda / Description</label>
                        <div className="relative">
                            <AlignLeft className="absolute left-3 top-3 w-4 h-4 dash-text-tertiary pointer-events-none" />
                            <textarea
                                placeholder="What's the meeting about?"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                className="w-full dash-surface-alt border dash-border rounded-xl pl-10 pr-4 py-2.5 text-sm dash-text focus:ring-2 focus:ring-behance-blue/50 focus:border-behance-blue outline-none resize-none transition-all"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t dash-border dash-surface-alt">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm dash-text-secondary hover:dash-text transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSchedule}
                        disabled={!title.trim() || saving}
                        className="px-6 py-2.5 rounded-xl bg-behance-blue text-white text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50 shadow-md flex items-center gap-2"
                    >
                        {saving ? 'Scheduling...' : 'Schedule Meeting'}
                    </button>
                </div>
            </div>
        </div>
    );
}
