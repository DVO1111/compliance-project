// src/components/Calendar/CalendarEventCard.tsx
// Behance-style event card — theme-aware
import {
    Clock, FileText, CheckCircle, AlertTriangle,
    Calendar, Scale, X,
} from 'lucide-react';
import type { CalendarEvent } from '../../lib/calendarService';

interface Props {
    date: Date;
    events: CalendarEvent[];
    onSchedule: (event: CalendarEvent) => void;
    onClose: () => void;
    selectedEventId?: string | null;
    onSelectEvent?: (event: CalendarEvent) => void;
}

function formatTime(iso: string) {
    try {
        return new Date(iso).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
}

function formatDate(d: Date) {
    return d.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function getInitials(name: string) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getTagsForEvent(evt: CalendarEvent): string[] {
    const tags: string[] = [];
    const status = evt.submission_status;

    if (evt.event_type === 'meeting') {
        tags.push('Meeting');
        tags.push('Active');
    } else {
        // Use submission status first
        if (status === 'signed_off') tags.push('Approved');
        else if (status === 'published') tags.push('Published');
        else if (status === 'rejected') tags.push('Rejected');
        else if (status === 'amend_requested') tags.push('Amend Required');
        else if (status === 'awaiting_legal' || status === 'in_review') tags.push('In Review');
        else tags.push(evt.event_type === 'legal_review' ? 'Review' : 'Publish');

        if (evt.status === 'confirmed') tags.push('Confirmed');
        else if (evt.needs_schedule_confirmation) tags.push('Draft');
    }
    return tags;
}

export default function CalendarEventCard({ date, events, onSchedule, onClose, selectedEventId, onSelectEvent }: Props) {
    if (events.length === 0) {
        return (
            <div className="dash-card rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold dash-text">{formatDate(date)}</h4>
                    <button onClick={onClose} className="p-1 hover:dash-surface-alt rounded-lg">
                        <X className="w-4 h-4 dash-text-tertiary" />
                    </button>
                </div>
                <div className="text-center py-6">
                    <Calendar className="w-8 h-8 mx-auto mb-2 dash-text-tertiary" />
                    <p className="text-sm dash-text-tertiary">No events scheduled for this day.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="dash-card rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b dash-border dash-surface-alt">
                <h4 className="text-sm font-bold dash-text">{formatDate(date)}</h4>
                <div className="flex items-center gap-2">
                    <span className="text-xs dash-text-tertiary">{events.length} event{events.length !== 1 ? 's' : ''}</span>
                    <button onClick={onClose} className="p-1 hover:dash-surface-alt rounded-lg">
                        <X className="w-4 h-4 dash-text-tertiary" />
                    </button>
                </div>
            </div>

            <div className="divide-y max-h-[460px] overflow-y-auto" style={{ borderColor: 'var(--color-border)' }}>
                {events.map((evt) => {
                    const isLegal = evt.event_type === 'legal_review';
                    const needsAction = evt.needs_schedule_confirmation || (isLegal && !evt.legal_acknowledged);
                    const isSelected = selectedEventId === evt.id;
                    const profile = evt.creator_profile;
                    const tags = getTagsForEvent(evt);

                    return (
                        <div
                            key={evt.id}
                            onClick={() => onSelectEvent?.(evt)}
                            className={`px-5 py-3.5 cursor-pointer transition-all duration-200 ${isSelected
                                ? 'cal-selected-event'
                                : 'hover:dash-surface-alt'
                                }`}
                            style={!isSelected && needsAction ? { background: 'var(--color-accent-soft)' } : undefined}
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex -space-x-2 shrink-0">
                                    {profile?.avatar_url ? (
                                        <img src={profile.avatar_url} alt={profile.full_name}
                                            className={`w-9 h-9 rounded-full object-cover ${isSelected ? 'ring-2 ring-white' : 'ring-1 ring-[var(--color-border)]'}`}
                                            title={`Creator: ${profile.full_name}`}
                                        />
                                    ) : (
                                        <div
                                            className={`w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold ${isSelected ? 'bg-white/20 text-white ring-2 ring-white' : 'text-white'} 
                                                ${evt.submission_status === 'rejected' ? 'bg-red-500'
                                                    : evt.submission_status === 'published' ? 'bg-yellow-500'
                                                        : evt.submission_status === 'signed_off' ? 'bg-green-500'
                                                            : isLegal ? 'cal-bg-legal' : evt.event_type === 'meeting' ? 'bg-cyan-500' : 'cal-bg-marketing'}`}
                                            title={`Creator: ${profile?.full_name || 'Unknown'}`}
                                        >
                                            {evt.submission_status === 'rejected' ? '🚫'
                                                : evt.submission_status === 'amend_requested' ? '✍️'
                                                    : profile ? getInitials(profile.full_name) : <FileText className="w-4 h-4" />}
                                        </div>
                                    )}
                                    {evt.reviewer_profile?.avatar_url ? (
                                        <img src={evt.reviewer_profile.avatar_url} alt={evt.reviewer_profile.full_name}
                                            className={`w-9 h-9 rounded-full object-cover ${isSelected ? 'ring-2 ring-white' : 'ring-1 ring-[var(--color-border)]'} relative`}
                                            title={`Reviewer: ${evt.reviewer_profile.full_name}`}
                                        />
                                    ) : evt.reviewer_profile ? (
                                        <div
                                            className={`w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold text-white cal-bg-legal ${isSelected ? 'ring-2 ring-white' : 'ring-1 ring-[var(--color-border)]'} relative`}
                                            title={`Reviewer: ${evt.reviewer_profile.full_name}`}
                                        >
                                            {getInitials(evt.reviewer_profile.full_name)}
                                        </div>
                                    ) : null}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <p className={`text-sm font-semibold truncate ${isSelected ? 'text-white' : 'dash-text'}`}>
                                        {evt.title}
                                    </p>
                                    <div className={`flex items-center gap-2 mt-0.5 text-xs ${isSelected ? 'text-white/70' : 'dash-text-tertiary'}`}>
                                        <Clock className="w-3 h-3" />
                                        <span>{formatTime(evt.scheduled_at)}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                    {tags.map((tag) => {
                                        let tagClass = '';
                                        if (isSelected) tagClass = 'bg-white/20 text-white';
                                        else if (tag === 'Approved') tagClass = 'bg-green-100 text-green-700';
                                        else if (tag === 'Published') tagClass = 'bg-yellow-100 text-yellow-700';
                                        else if (tag === 'Rejected') tagClass = 'bg-red-100 text-red-700';
                                        else if (tag === 'Amend Required') tagClass = 'bg-orange-100 text-orange-700';
                                        else if (isLegal) tagClass = 'cal-bg-legal-soft cal-text-legal';
                                        else if (evt.event_type === 'meeting') tagClass = 'bg-cyan-100 text-cyan-700';
                                        else tagClass = 'dash-accent';

                                        return (
                                            <span
                                                key={tag}
                                                className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${tagClass}`}
                                                style={!isSelected && tagClass === 'dash-accent' ? { background: 'var(--color-accent-soft)' } : undefined}
                                            >
                                                {tag}
                                            </span>
                                        );
                                    })}
                                </div>

                                <span className={`text-sm font-bold leading-none shrink-0 ${isSelected ? 'text-white/60' : 'dash-text-tertiary'}`}>
                                    ⋮
                                </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 mt-2 ml-11">
                                {evt.status === 'completed' && (
                                    <span className={`flex items-center gap-1 text-[10px] font-medium ${isSelected ? 'text-white/80' : 'cal-text-success'}`}>
                                        <CheckCircle className="w-3 h-3" /> Completed
                                    </span>
                                )}
                                {evt.needs_schedule_confirmation && (
                                    <span className={`flex items-center gap-1 text-[10px] font-medium ${isSelected ? 'text-white/80' : 'cal-text-warning'}`}>
                                        <AlertTriangle className="w-3 h-3" /> Needs scheduling
                                    </span>
                                )}
                                {isLegal && !evt.legal_acknowledged && (
                                    <span className={`flex items-center gap-1 text-[10px] font-medium ${isSelected ? 'text-white/80' : 'cal-text-warning'}`}>
                                        <Clock className="w-3 h-3" /> Awaiting legal
                                    </span>
                                )}
                                {!isLegal && evt.legal_planned_at && (
                                    <span className={`flex items-center gap-1 text-[10px] font-medium ${isSelected ? 'text-white/80' : 'cal-text-legal'}`}>
                                        <Scale className="w-3 h-3" /> Legal: {new Date(evt.legal_planned_at).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', month: 'short', day: 'numeric' })}
                                    </span>
                                )}
                            </div>

                            {needsAction && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onSchedule(evt); }}
                                    className={`mt-2 ml-11 shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${isSelected
                                        ? 'bg-white/20 text-white hover:bg-white/30'
                                        : isLegal
                                            ? 'cal-bg-legal-soft cal-text-legal hover:opacity-80'
                                            : evt.event_type === 'meeting'
                                                ? 'bg-cyan-500 text-white hover:opacity-80'
                                                : 'cal-bg-marketing text-white hover:opacity-80'
                                        }`}
                                >
                                    {isLegal ? 'Set Date' : 'Schedule'}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
