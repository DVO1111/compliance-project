// src/components/Calendar/ContentCalendarPage.tsx
// Behance Elementor-inspired 3-column Calendar with Gantt timeline + detail panel
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    CalendarDays, Megaphone, Scale, Layers, AlertTriangle,
    Clock, CheckCircle, Loader2, LayoutGrid, GanttChart,
    ChevronLeft, ChevronRight, Send, X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
    getMarketingEvents,
    getLegalEvents,
    getWeekRange,
    type CalendarEvent,
} from '../../lib/calendarService';
import CalendarGrid, { getMonthRange } from './CalendarGrid';
import { supabase } from '../../lib/supabase';
import { useEventDetails } from '../../hooks/useEventDetails';
import GanttTimeline from './GanttTimeline';
import SchedulePromptModal from './SchedulePromptModal';
import MeetingScheduleModal from '../Chat/MeetingScheduleModal';
import { createMeetingEvent } from '../../lib/calendarService';
import { formatDateWAT, formatDateOnlyWAT, formatTimeWAT } from '../../lib/timezone';
import { logger } from '../../lib/logger';

type CalendarTab = 'marketing' | 'legal';
type ViewMode = 'timeline' | 'grid';

export default function ContentCalendarPage() {
    const { profile } = useAuth();
    const companyId = (profile as any)?.company_id as string | undefined;
    const role = ((profile as any)?.role ?? '').toLowerCase();
    const isLegal = role === 'compliance' || role === 'legal';
    const isExecutive = role === 'executive' || role === 'admin' || role === 'owner' || role === 'exec';

    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [scheduleModal, setScheduleModal] = useState<CalendarEvent | null>(null);
    const [activeTab, setActiveTab] = useState<CalendarTab>(isLegal ? 'legal' : 'marketing');
    const [viewMode, setViewMode] = useState<ViewMode>('timeline');

    // Timeline date window
    const [timelineStart, setTimelineStart] = useState<Date>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 3);
        return d;
    });
    const [timelineDays, setTimelineDays] = useState(21);

    // Grid month
    const [viewMonth, setViewMonth] = useState<Date>(new Date());

    // Selected event for detail panel
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

    // Grid day selection
    const [selectedDay, setSelectedDay] = useState<{ date: Date; events: CalendarEvent[] } | null>(null);
    const [showMeetingModal, setShowMeetingModal] = useState(false);
    const [profiles, setProfiles] = useState<{ id: string; full_name: string }[]>([]);

    // Load events
    const loadEvents = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const range = viewMode === 'timeline'
                ? getWeekRange(timelineStart, timelineDays)
                : getMonthRange(viewMonth);

            let data: CalendarEvent[];
            if (isExecutive) {
                data = activeTab === 'marketing'
                    ? await getMarketingEvents(companyId, range)
                    : await getLegalEvents(companyId, range);
            } else if (isLegal) {
                data = await getLegalEvents(companyId, range);
            } else {
                data = await getMarketingEvents(companyId, range);
            }
            setEvents(data);
        } catch (e) {
            logger.error('Failed to load calendar events:', e);
        } finally {
            setLoading(false);
        }
    }, [companyId, viewMonth, activeTab, isExecutive, isLegal, viewMode, timelineStart, timelineDays]);

    useEffect(() => { loadEvents(); }, [loadEvents]);

    // Fast-fetch profiles for the meeting scheduler
    useEffect(() => {
        if (!companyId) return;
        supabase.from('profiles').select('id, full_name').eq('company_id', companyId).limit(50)
            .then(({ data }) => { if (data) setProfiles(data as any[]); });
    }, [companyId]);

    // Stats
    const stats = useMemo(() => {
        const pending = events.filter(e => e.status === 'pending' || e.needs_schedule_confirmation).length;
        const confirmed = events.filter(e => e.status === 'confirmed').length;
        const overdue = events.filter(e => {
            const d = new Date(e.scheduled_at);
            return d < new Date() && e.status !== 'completed';
        }).length;
        const legalPending = events.filter(e => e.event_type === 'legal_review' && !e.legal_acknowledged).length;
        return { pending, confirmed, overdue, legalPending, total: events.length };
    }, [events]);

    const handleSelectDay = (date: Date, dayEvents: CalendarEvent[]) => {
        setSelectedDay({ date, events: dayEvents });
    };

    const handleSchedule = (event: CalendarEvent) => {
        setScheduleModal(event);
    };

    const handleRefresh = () => {
        loadEvents();
        setSelectedDay(null);
        setSelectedEvent(null);
    };

    const shiftTimeline = (dir: number) => {
        setTimelineStart(prev => {
            const d = new Date(prev);
            d.setDate(d.getDate() + dir * 7);
            return d;
        });
    };

    return (
        <div className="h-full flex flex-col" style={{ background: 'var(--color-bg)' }}>
            {/* ── Top bar ── */}
            <div className="px-6 py-4 dash-surface border-b dash-border">
                <div className="flex items-center justify-between flex-wrap gap-4 max-w-[1600px] mx-auto">
                    <div>
                        <h1 className="text-2xl font-bold dash-text">Calendar</h1>
                        <p className="text-xs dash-text-tertiary mt-0.5">
                            {isExecutive
                                ? 'Full visibility across marketing and legal calendars'
                                : isLegal
                                    ? 'Track content requiring your legal review'
                                    : 'Schedule, track, and manage your content pipeline'}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Executive tab toggle */}
                        {isExecutive && (
                            <div className="flex items-center gap-1 dash-surface-alt rounded-xl p-1">
                                <button
                                    onClick={() => setActiveTab('marketing')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'marketing'
                                        ? 'dash-surface dash-accent shadow-sm'
                                        : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                                        }`}
                                >
                                    <Megaphone className="w-3.5 h-3.5" /> Marketing
                                </button>
                                <button
                                    onClick={() => setActiveTab('legal')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'legal'
                                        ? 'dash-surface cal-text-legal shadow-sm'
                                        : 'dash-text-tertiary hover:dash-text-secondary'
                                        }`}
                                >
                                    <Scale className="w-3.5 h-3.5" /> Legal
                                </button>
                            </div>
                        )}

                        {/* View toggle */}
                        <div className="flex items-center gap-1 dash-surface-alt rounded-xl p-1">
                            <button
                                onClick={() => setViewMode('timeline')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === 'timeline'
                                    ? 'dash-surface dash-accent shadow-sm'
                                    : 'dash-text-tertiary hover:dash-text-secondary'
                                    }`}
                            >
                                <GanttChart className="w-3.5 h-3.5" /> Timeline
                            </button>
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === 'grid'
                                    ? 'dash-surface dash-accent shadow-sm'
                                    : 'dash-text-tertiary hover:dash-text-secondary'
                                    }`}
                            >
                                <LayoutGrid className="w-3.5 h-3.5" /> Grid
                            </button>
                        </div>

                        {/* Mini stats pills */}
                        <div className="hidden lg:flex items-center gap-2">
                            <span className="flex items-center gap-1 text-[10px] font-semibold cal-bg-marketing-soft cal-text-marketing px-2 py-1 rounded-full">
                                <Layers className="w-3 h-3" /> {stats.total}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] font-semibold cal-bg-warning-soft cal-text-warning px-2 py-1 rounded-full">
                                <AlertTriangle className="w-3 h-3" /> {stats.pending}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] font-semibold cal-bg-success-soft cal-text-success px-2 py-1 rounded-full">
                                <CheckCircle className="w-3 h-3" /> {stats.confirmed}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Main 3-column content area ── */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <Loader2 className="w-10 h-10 animate-spin dash-accent mx-auto" />
                        <p className="text-sm dash-text-tertiary mt-3 font-medium">Loading calendar…</p>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex overflow-hidden max-w-[1600px] mx-auto w-full">
                    {/* ═══════ Column 2 — Timeline / Grid ═══════ */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        {viewMode === 'timeline' ? (
                            <>
                                {/* Timeline navigation */}
                                <div className="flex items-center justify-between dash-card rounded-xl px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => shiftTimeline(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg border dash-border hover:dash-surface-alt">
                                            <ChevronLeft className="w-4 h-4 dash-text-secondary" />
                                        </button>
                                        <span className="text-sm font-semibold dash-text min-w-[200px] text-center">
                                            {formatDateOnlyWAT(timelineStart, { month: 'short', day: 'numeric' })}
                                            {' — '}
                                            {formatDateOnlyWAT(new Date(timelineStart.getTime() + (timelineDays - 1) * 86400000), { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                        <button onClick={() => shiftTimeline(1)} className="w-8 h-8 flex items-center justify-center rounded-lg border dash-border hover:dash-surface-alt">
                                            <ChevronRight className="w-4 h-4 dash-text-secondary" />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {[14, 21, 30].map(d => (
                                            <button
                                                key={d}
                                                onClick={() => setTimelineDays(d)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${timelineDays === d
                                                    ? 'cal-bg-marketing text-white shadow-sm'
                                                    : 'dash-surface-alt dash-text-tertiary hover:dash-text-secondary'
                                                    }`}
                                            >
                                                {d}d
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Gantt timeline */}
                                <GanttTimeline
                                    events={events}
                                    days={timelineDays}
                                    startDate={timelineStart}
                                    onSelectEvent={setSelectedEvent}
                                    selectedEventId={selectedEvent?.id}
                                />
                            </>
                        ) : (
                            /* Grid view */
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                                <div className="xl:col-span-2">
                                    <CalendarGrid
                                        events={events}
                                        onSelectDay={handleSelectDay}
                                        onSelectEvent={setSelectedEvent}
                                        selectedDate={selectedDay?.date}
                                        viewMonth={viewMonth}
                                        onMonthChange={setViewMonth}
                                        onAdd={() => setShowMeetingModal(true)}
                                    />
                                </div>
                                <div className="xl:col-span-1 space-y-4">
                                    {selectedDay ? (
                                        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-sm overflow-hidden">
                                            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
                                                <h4 className="text-sm font-bold text-[var(--color-text-primary)]">
                                                    {formatDateOnlyWAT(selectedDay.date, { weekday: 'long', month: 'long', day: 'numeric' })}
                                                </h4>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-[var(--color-text-tertiary)]">{selectedDay.events.length} event{selectedDay.events.length !== 1 ? 's' : ''}</span>
                                                    <button onClick={() => setSelectedDay(null)} className="p-1 hover:bg-[var(--color-surface-alt)] rounded-lg">
                                                        <X className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="divide-y divide-[var(--color-border)] max-h-[460px] overflow-y-auto">
                                                {selectedDay.events.length === 0 ? (
                                                    <div className="text-center py-8">
                                                        <CalendarDays className="w-8 h-8 mx-auto mb-2 text-[var(--color-text-tertiary)]" />
                                                        <p className="text-sm text-[var(--color-text-tertiary)]">No events this day</p>
                                                    </div>
                                                ) : (
                                                    selectedDay.events.map(evt => (
                                                        <GridEventRow
                                                            key={evt.id}
                                                            event={evt}
                                                            onSchedule={handleSchedule}
                                                            onClick={() => setSelectedEvent(evt)}
                                                        />
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-8 text-center">
                                            <CalendarDays className="w-10 h-10 mx-auto mb-3 text-[var(--color-text-tertiary)]" />
                                            <p className="text-sm text-[var(--color-text-secondary)] font-medium">Select a day</p>
                                            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Click on any date to view its events</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ═══════ Column 3 — Event Detail Panel ═══════ */}
                    {selectedEvent && (
                        <div className="w-[360px] shrink-0 bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-md overflow-y-auto animate-slide-in">
                            <EventDetailPanel
                                event={selectedEvent}
                                onSchedule={handleSchedule}
                                onClose={() => setSelectedEvent(null)}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Schedule modal */}
            {scheduleModal && companyId && (
                <SchedulePromptModal
                    event={scheduleModal}
                    mode={isLegal ? 'legal' : 'marketing'}
                    companyId={companyId}
                    onClose={() => setScheduleModal(null)}
                    onUpdated={handleRefresh}
                />
            )}

            {showMeetingModal && companyId && (
                <MeetingScheduleModal
                    companyId={companyId}
                    profiles={profiles}
                    onClose={() => setShowMeetingModal(false)}
                    onSchedule={async (m) => {
                        if (!profile?.id) return;
                        const start = new Date(`${m.date}T${m.startTime}:00.000Z`);
                        const end = new Date(start.getTime() + m.duration * 60000);
                        await createMeetingEvent({
                            companyId,
                            title: m.title,
                            description: m.description,
                            startTime: start.toISOString(),
                            endTime: end.toISOString(),
                            meetingLink: m.meetingLink,
                            userId: profile.id
                        });
                        setShowMeetingModal(false);
                        handleRefresh();
                    }}
                />
            )}

            {/* Injected CSS for slide-in animation */}
            <style>{`
                @keyframes slideIn {
                    from { opacity: 0; transform: translateX(20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                .animate-slide-in {
                    animation: slideIn 0.25s ease-out;
                }
            `}</style>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════ */

/* ── Event Detail Panel (Behance Column 3 right sidebar) ── */
function EventDetailPanel({ event, onSchedule, onClose }: {
    event: CalendarEvent;
    onSchedule: (e: CalendarEvent) => void;
    onClose: () => void;
}) {
    const isLegal = event.event_type === 'legal_review';
    const needsAction = event.needs_schedule_confirmation || (isLegal && !event.legal_acknowledged);
    const profile = event.creator_profile;
    const { user } = useAuth();

    const { data: deepData } = useEventDetails(event.submission_id || undefined);

    const [showExpeditedForm, setShowExpeditedForm] = useState(false);
    const [expeditedDate, setExpeditedDate] = useState('');
    const [expeditedMessage, setExpeditedMessage] = useState('');
    const [submittingExpedited, setSubmittingExpedited] = useState(false);
    const [expeditedSuccess, setExpeditedSuccess] = useState(false);
    const [activeTab, setActiveTab] = useState<'history' | 'tasks' | 'notes'>('notes');

    // Calculate time gap
    const timeGapMs = (!isLegal && event.legal_planned_at)
        ? new Date(event.scheduled_at).getTime() - new Date(event.legal_planned_at).getTime()
        : null;
    const isCloseGap = timeGapMs !== null && Math.abs(timeGapMs) < 60 * 60 * 1000;

    const handleRequestExpedite = async () => {
        if (!expeditedDate || !expeditedMessage) {
            alert('Please fill in both the proposed date and your message.');
            return;
        }
        setSubmittingExpedited(true);
        try {
            const recipientId = deepData?.reviewerProfile?.id || event.created_by;
            if (!recipientId) {
                alert('Could not find the legal reviewer to send the request to.');
                setSubmittingExpedited(false);
                return;
            }

            const { error: insertErr } = await supabase.from('notifications').insert({
                recipient_id: recipientId,
                user_id: user?.id,
                type: 'expedited_review_request',
                content_id: event.submission_id || null,
                message: JSON.stringify({
                    text: expeditedMessage,
                    proposed_date: expeditedDate,
                    event_title: event.title
                })
            } as any);

            if (insertErr) {
                logger.error('[Expedite] Insert failed:', insertErr);
                alert(`Failed to send request: ${insertErr.message}`);
                return;
            }

            setExpeditedSuccess(true);
            alert('✅ Your request for a faster review has been sent to the legal reviewer!');
            setTimeout(() => {
                setShowExpeditedForm(false);
                setExpeditedSuccess(false);
                setExpeditedDate('');
                setExpeditedMessage('');
            }, 2000);
        } catch (err: any) {
            logger.error('[Expedite] Exception:', err);
            alert(`Error sending request: ${err?.message || 'Unknown error'}`);
        } finally {
            setSubmittingExpedited(false);
        }
    };

    // Status label
    const statusLabel = event.status === 'completed' ? 'Completed'
        : event.legal_acknowledged ? 'In review'
            : needsAction ? 'Needs action'
                : 'In process';

    const statusColor = event.status === 'completed' ? 'cal-bg-success-soft cal-text-success'
        : needsAction ? 'cal-bg-warning-soft cal-text-warning'
            : 'bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)]';

    return (
        <div className="flex flex-col h-full">
            {/* ── Panel Header ── */}
            <div className="px-5 py-4 border-b border-[var(--color-border)]">
                <div className="flex items-center justify-between mb-3">
                    <Send className="w-4 h-4 text-[var(--color-info)]" />
                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${statusColor}`}>
                        {statusLabel}
                    </span>
                    <div className="flex items-center gap-1">
                        {/* Avatars */}
                        <div className="flex -space-x-2">
                            {profile?.avatar_url ? (
                                <img src={profile.avatar_url} alt={profile.full_name} className="w-7 h-7 rounded-full object-cover ring-2 ring-white" />
                            ) : (
                                <div className="w-7 h-7 rounded-full cal-bg-marketing ring-2 ring-white flex items-center justify-center text-[9px] font-bold text-white">
                                    {profile ? getInitials(profile.full_name) : '?'}
                                </div>
                            )}
                            {event.reviewer_profile?.avatar_url ? (
                                <img src={event.reviewer_profile.avatar_url} alt={event.reviewer_profile.full_name} className="w-7 h-7 rounded-full object-cover ring-2 ring-white" />
                            ) : event.reviewer_profile ? (
                                <div className="w-7 h-7 rounded-full cal-bg-legal ring-2 ring-white flex items-center justify-center text-[9px] font-bold text-white">
                                    {getInitials(event.reviewer_profile.full_name)}
                                </div>
                            ) : null}
                        </div>
                        <button onClick={onClose} className="ml-2 p-1 hover:bg-[var(--color-surface-alt)] rounded-lg">
                            <X className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                        </button>
                    </div>
                </div>

                {/* Title + date */}
                <h3 className="text-lg font-bold text-[var(--color-text-primary)]">{event.title}</h3>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                    {formatDateWAT(event.scheduled_at, { month: 'long', day: 'numeric', year: 'numeric' })}
                    {(!event.submission_status || ['awaiting_legal', 'in_review'].includes(event.submission_status)) && (
                        <>
                            , {formatTimeWAT(event.scheduled_at, { hour: '2-digit', minute: '2-digit' })}
                            {event.legal_planned_at && (
                                <> — Review: {formatTimeWAT(event.legal_planned_at, { hour: '2-digit', minute: '2-digit' })}</>
                            )}
                        </>
                    )}
                </p>
                {event.event_type === 'meeting' && (
                    <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 px-3 py-2 rounded-xl border border-cyan-100 dark:border-cyan-800">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Scheduled Meeting</span>
                    </div>
                )}
            </div>

            {/* ── Tag pills ── */}
            <div className="px-5 py-3 flex items-center gap-2 border-b border-[var(--color-border)]">
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${event.submission_status === 'rejected' ? 'bg-red-100 text-red-700' :
                    event.submission_status === 'published' ? 'bg-yellow-100 text-yellow-700' :
                        event.submission_status === 'signed_off' ? 'bg-green-100 text-green-700' :
                            event.submission_status === 'amend_requested' ? 'bg-orange-100 text-orange-700' :
                                event.event_type === 'legal_review' ? 'cal-bg-legal-soft cal-text-legal' :
                                    event.event_type === 'meeting' ? 'bg-cyan-100 text-cyan-700' :
                                        'cal-bg-marketing-soft cal-text-marketing'
                    }`}>
                    {event.submission_status === 'signed_off' ? 'Approved' :
                        event.submission_status === 'published' ? 'Published' :
                            event.submission_status === 'rejected' ? 'Rejected' :
                                event.submission_status === 'amend_requested' ? 'Amend Required' :
                                    event.event_type === 'legal_review' ? 'Review' :
                                        event.event_type === 'meeting' ? 'Meeting' : 'Publish'}
                </span>
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${event.status === 'completed' || event.submission_status === 'published' ? 'cal-bg-success-soft cal-text-success' : 'bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)]'
                    }`}>
                    {event.status === 'completed' || event.submission_status === 'published' ? 'Published' : 'Active'}
                </span>
            </div>

            {/* ── Description ── */}
            <div className="px-5 py-3 border-b border-[var(--color-border)]">
                <div className="flex items-start gap-2">
                    <div className="w-4 h-4 rounded-full bg-[var(--color-surface-alt)] flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[8px] text-[var(--color-text-secondary)]">i</span>
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                        {deepData?.topic
                            ? `${deepData.topic}${deepData.platform ? ` • ${deepData.platform}` : ''}${deepData.audience ? ` • ${deepData.audience}` : ''}`
                            : `Event details for "${event.title}"`}
                    </p>
                </div>
            </div>

            {/* ── Metadata rows ── */}
            <div className="px-5 py-3 space-y-3 border-b border-[var(--color-border)]">
                {/* Person name */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--color-text-tertiary)]">Person name</span>
                    <div className="flex items-center gap-2">
                        {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt={profile.full_name} className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                            <div className="w-5 h-5 rounded-full cal-bg-marketing flex items-center justify-center text-[8px] font-bold text-white">
                                {profile ? getInitials(profile.full_name) : '?'}
                            </div>
                        )}
                        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{profile?.full_name || 'Unknown'}</span>
                    </div>
                </div>

                {/* Reviewer */}
                {(event.reviewer_profile || deepData?.reviewerProfile) && (
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-tertiary)]">Reviewer</span>
                        <div className="flex items-center gap-2">
                            {event.reviewer_profile?.avatar_url || deepData?.reviewerProfile?.avatarUrl ? (
                                <img src={(event.reviewer_profile?.avatar_url || deepData?.reviewerProfile?.avatarUrl) || undefined} alt="Reviewer" className="w-5 h-5 rounded-full object-cover" />
                            ) : (
                                <div className="w-5 h-5 rounded-full cal-bg-legal flex items-center justify-center text-[8px] font-bold text-white">
                                    {getInitials(event.reviewer_profile?.full_name || deepData?.reviewerProfile?.fullName || 'R')}
                                </div>
                            )}
                            <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                                {event.reviewer_profile?.full_name || deepData?.reviewerProfile?.fullName || 'Unassigned'}
                            </span>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--color-text-tertiary)]">Link to join</span>
                    <button
                        onClick={() => {
                            if (event.meeting_link) {
                                window.open(event.meeting_link, '_blank');
                            } else {
                                alert('No meeting link available');
                            }
                        }}
                        className={`text-xs font-semibold text-white px-4 py-1.5 rounded-full transition-opacity ${event.meeting_link ? 'bg-cyan-600 hover:opacity-90' : 'cal-bg-marketing hover:opacity-90'}`}
                    >
                        Join
                    </button>
                </div>
            </div>

            {/* ── Current tasks block ── */}
            <div className="px-5 py-4 border-b border-[var(--color-border)]">
                <p className="text-xs text-[var(--color-text-tertiary)] mb-2">Current tasks</p>
                <div className="flex items-baseline gap-1 mb-3">
                    <span className="text-3xl font-bold text-[var(--color-text-primary)]">
                        {event.submission_status === 'published' ? 4 :
                            event.submission_status === 'signed_off' ? 3 :
                                event.submission_status === 'rejected' ? 4 :
                                    event.submission_status === 'amend_requested' ? 2 :
                                        event.status === 'completed' ? 4 : needsAction ? 1 : 2}
                    </span>
                    <span className="text-sm text-[var(--color-text-tertiary)]">/ 4</span>
                </div>
                {/* Segmented progress bar */}
                <div className="flex h-2 rounded-full overflow-hidden gap-0.5 mb-2">
                    <div className={`${event.submission_status === 'rejected' ? 'bg-red-500' : 'cal-bg-marketing'} rounded-l-full`}
                        style={{
                            width: (event.submission_status === 'published' || event.submission_status === 'rejected' || event.status === 'completed') ? '100%' :
                                (event.submission_status === 'signed_off' ? '75%' :
                                    event.submission_status === 'amend_requested' ? '50%' :
                                        needsAction ? '25%' : '50%')
                        }}
                    />
                    {!(event.submission_status === 'published' || event.submission_status === 'rejected' || event.status === 'completed') && (
                        <div className="bg-[var(--color-surface-alt)] rounded-r-full flex-1" />
                    )}
                </div>
                <p className="text-[10px] text-[var(--color-text-tertiary)]">• {
                    (event.submission_status === 'published' || event.submission_status === 'rejected' || event.status === 'completed') ? '0' :
                        (event.submission_status === 'signed_off' ? '1' :
                            event.submission_status === 'amend_requested' ? '2' :
                                needsAction ? '3' : '2')
                } Remaining</p>
            </div>

            {/* ── Legal Outcome if finalized ── */}
            {event.submission_status && ['signed_off', 'rejected', 'amend_requested', 'published'].includes(event.submission_status) && (
                <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)]/30">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] mb-2">Legal Outcome</p>
                    <div className="flex items-center gap-2 mb-2">
                        <span className={`text-sm font-bold ${event.submission_status === 'rejected' ? 'text-red-600' :
                                event.submission_status === 'amend_requested' ? 'text-orange-600' :
                                    'text-green-600'
                            }`}>
                            {event.submission_status === 'signed_off' || event.submission_status === 'published' ? '✅ Approved' :
                                event.submission_status === 'rejected' ? '❌ Rejected' : '⚠️ Amendment Requested'}
                        </span>
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] italic leading-relaxed">
                        "The content has been reviewed and {
                            event.submission_status === 'signed_off' || event.submission_status === 'published' ? 'is cleared for publication.' :
                                event.submission_status === 'rejected' ? 'cannot be used due to compliance conflicts.' :
                                    'requires adjustments as noted in the feedback.'
                        }"
                    </p>
                </div>
            )}

            {/* ── Tabs: History / Tasks / Notes ── */}
            <div className="px-5 pt-3 flex items-center gap-4 border-b border-[var(--color-border)]">
                {(['history', 'tasks', 'notes'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`pb-2 text-xs font-semibold capitalize transition-all ${activeTab === tab
                            ? 'text-[var(--color-text-primary)] border-b-2 border-[var(--color-border)]'
                            : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                            }`}
                    >
                        {tab}{tab === 'notes' ? ' (0)' : ''}
                    </button>
                ))}
            </div>

            {/* ── Tab content ── */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
                {activeTab === 'notes' && (
                    <div className="space-y-4">
                        <div className="text-center py-6">
                            <p className="text-xs text-[var(--color-text-tertiary)]">No notes yet</p>
                            <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">Notes will appear here</p>
                        </div>
                    </div>
                )}

                {activeTab === 'tasks' && (
                    <div className="space-y-3">
                        {/* Workflow progress */}
                        <WorkflowStep label="Content Uploaded" done completed={!!event.submission_id} />
                        <WorkflowStep label="Schedule Confirmed" done={event.status === 'confirmed' || event.status === 'completed'} completed={event.status === 'confirmed' || event.status === 'completed'} />
                        <WorkflowStep label="Legal Review" done={!!event.legal_acknowledged} completed={!!event.legal_acknowledged} />
                        <WorkflowStep label="Published" done={event.status === 'completed'} completed={event.status === 'completed'} />
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="space-y-3">
                        <HistoryItem label="Event created" time={formatDateWAT(event.scheduled_at, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} />
                        {event.legal_acknowledged && event.legal_planned_at && (
                            <HistoryItem label="Legal review acknowledged" time={formatDateWAT(event.legal_planned_at, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} />
                        )}
                        {event.status === 'completed' && (
                            <HistoryItem label="Published" time="Completed" />
                        )}
                    </div>
                )}
            </div>

            {/* ── Expedited review / action buttons ── */}
            {needsAction && !['signed_off', 'rejected', 'published'].includes(event.submission_status || '') && (
                <div className="px-5 py-3 border-t border-[var(--color-border)]">
                    {!showExpeditedForm ? (
                        <div className="flex gap-2">
                            <button
                                onClick={() => onSchedule(event)}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white transition-opacity hover:opacity-90 ${isLegal ? 'cal-bg-legal' : 'cal-bg-marketing'}`}
                            >
                                {isLegal ? <><Send className="w-3.5 h-3.5" /> Set Review Date</> : <><CalendarDays className="w-3.5 h-3.5" /> Schedule</>}
                            </button>
                            {isCloseGap && !isLegal && (
                                <button
                                    onClick={() => setShowExpeditedForm(true)}
                                    className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-warning-soft)] text-[var(--color-warning)] hover:bg-[var(--color-warning-soft)] transition-all"
                                >
                                    ⚡ Expedite
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Request Expedited Review</p>
                            <input
                                type="date"
                                value={expeditedDate}
                                onChange={(e) => setExpeditedDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                                className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs bg-[var(--color-surface)] focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
                            />
                            <textarea
                                value={expeditedMessage}
                                onChange={(e) => setExpeditedMessage(e.target.value)}
                                placeholder="Why do you need faster review?"
                                rows={2}
                                className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs bg-[var(--color-surface)] focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none resize-none"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowExpeditedForm(false)}
                                    className="flex-1 px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-secondary)]"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRequestExpedite}
                                    disabled={submittingExpedited}
                                    className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--color-warning)] text-white hover:bg-[var(--color-warning)] disabled:opacity-50"
                                >
                                    {submittingExpedited ? 'Sending…' : 'Send Request'}
                                </button>
                            </div>
                            {expeditedSuccess && <p className="text-[10px] text-[var(--color-success)] font-medium">✅ Sent!</p>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ── Workflow Step (for Tasks tab) ── */
function WorkflowStep({ label, completed }: { label: string; done?: boolean; completed: boolean }) {
    return (
        <div className="flex items-center gap-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${completed ? 'cal-bg-marketing text-white' : 'bg-[var(--color-surface-alt)] text-[var(--color-text-tertiary)]'}`}>
                {completed ? <CheckCircle className="w-3.5 h-3.5" /> : '○'}
            </div>
            <span className={`text-xs font-medium ${completed ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'}`}>{label}</span>
        </div>
    );
}

/* ── History Item ── */
function HistoryItem({ label, time }: { label: string; time: string }) {
    return (
        <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full cal-bg-marketing shrink-0" />
            <div className="flex-1 flex items-center justify-between">
                <span className="text-xs text-[var(--color-text-secondary)]">{label}</span>
                <span className="text-[10px] text-[var(--color-text-tertiary)]">{time}</span>
            </div>
        </div>
    );
}

/* ── Grid Event Row (used in month-grid sidebar) ── */
function GridEventRow({ event, onSchedule, onClick }: { event: CalendarEvent; onSchedule: (e: CalendarEvent) => void; onClick?: () => void }) {
    const isLegal = event.event_type === 'legal_review';
    const needsAction = event.needs_schedule_confirmation || (isLegal && !event.legal_acknowledged);
    const profile = event.creator_profile;

    return (
        <div
            onClick={onClick}
            className="cursor-pointer px-5 py-3.5 hover:bg-[var(--color-surface-alt)] transition-colors"
        >
            <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="flex -space-x-2 shrink-0">
                    {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt={profile.full_name} className="w-8 h-8 rounded-full object-cover ring-1 ring-gray-100" />
                    ) : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${isLegal ? 'cal-bg-legal' : 'cal-bg-marketing'}`}>
                            {profile ? getInitials(profile.full_name) : '?'}
                        </div>
                    )}
                    {event.reviewer_profile?.avatar_url ? (
                        <img src={event.reviewer_profile.avatar_url} alt={event.reviewer_profile.full_name} className="w-8 h-8 rounded-full object-cover ring-1 ring-gray-100" />
                    ) : event.reviewer_profile ? (
                        <div className="w-8 h-8 rounded-full cal-bg-legal flex items-center justify-center text-[10px] font-bold text-white ring-1 ring-gray-100">
                            {getInitials(event.reviewer_profile.full_name)}
                        </div>
                    ) : null}
                </div>

                {/* Details */}
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{event.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                        <Clock className="w-3 h-3" />
                        <span>{formatTimeWAT(event.scheduled_at, { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isLegal ? 'cal-bg-legal-soft cal-text-legal' : 'cal-bg-marketing-soft cal-text-marketing'}`}>
                            {isLegal ? 'Legal' : 'Publish'}
                        </span>
                    </div>
                </div>

                {needsAction && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onSchedule(event); }}
                        className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90 ${isLegal ? 'cal-bg-legal-soft cal-text-legal' : 'cal-bg-marketing text-white'}`}
                    >
                        {isLegal ? 'Set Date' : 'Schedule'}
                    </button>
                )}
            </div>
        </div>
    );
}

/* ── Helpers ── */
function getInitials(name: string) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}


