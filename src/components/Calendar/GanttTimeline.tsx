// src/components/Calendar/GanttTimeline.tsx
// Behance-style horizontal Gantt timeline — theme-aware
import { useMemo, useRef, useEffect } from 'react';
import { Clock } from 'lucide-react';
import type { CalendarEvent } from '../../lib/calendarService';

/* ─────────────────────────── Props ─────────────────────────── */
interface GanttTimelineProps {
    events: CalendarEvent[];
    days: number;
    startDate: Date;
    onSelectEvent: (event: CalendarEvent) => void;
    selectedEventId?: string | null;
}

/* ─────────────────────────── Constants ─────────────────────────── */
const HALF_HOUR_W = 100;
const LANE_H = 100;
const LANE_LABEL_W = 48;
const TIME_HEADER_H = 36;
const HOURS_SHOWN = 14;
const START_HOUR = 6;
const TOTAL_SLOTS = HOURS_SHOWN * 2;
const TIMELINE_W = TOTAL_SLOTS * HALF_HOUR_W;

/* ─────────────────────────── Swim-lane categories ─────────────────────────── */
const LANE_CATEGORIES = [
    { key: 'meeting', label: 'Meeting', color: 'var(--color-cal-lane-1)' },
    { key: 'design', label: 'Design', color: 'var(--color-cal-lane-2)' },
    { key: 'sales', label: 'Sales', color: 'var(--color-cal-lane-3)' },
    { key: 'ads', label: 'Ads', color: 'var(--color-cal-lane-4)' },
    { key: 'personal', label: 'Personal', color: 'var(--color-cal-lane-5)' },
];

function getLaneIndex(evt: CalendarEvent): number {
    if (evt.event_type === 'meeting') return 0;
    if (evt.event_type === 'legal_review') return 1;
    if (evt.status === 'completed') return 4;
    if (evt.needs_schedule_confirmation) return 3;
    const hash = evt.title.length % LANE_CATEGORIES.length;
    return hash;
}

/* ─────────────────────────── Helpers ─────────────────────────── */
function getInitials(name: string) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatTimeSlot(slotIdx: number): string {
    const totalMins = (START_HOUR * 60) + (slotIdx * 30);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m === 0 ? '00' : '30'} ${ampm}`;
}

function getEventLeft(evt: CalendarEvent): number {
    const d = new Date(evt.scheduled_at);
    const mins = d.getHours() * 60 + d.getMinutes();
    const offset = mins - (START_HOUR * 60);
    return Math.max(0, (offset / 30) * HALF_HOUR_W);
}

function getEventWidth(evt: CalendarEvent): number {
    const durationMins = evt.event_type === 'legal_review' ? 120 : 90;
    return (durationMins / 30) * HALF_HOUR_W;
}

function formatTimeRange(iso: string, durationMins: number = 90): string {
    try {
        const d = new Date(iso);
        const end = new Date(d.getTime() + durationMins * 60000);
        const fmt = (dt: Date) => dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        return `${fmt(d)} - ${fmt(end)}`;
    } catch { return ''; }
}

function getTagsForEvent(evt: CalendarEvent): string[] {
    const tags: string[] = [];
    const status = evt.submission_status;

    if (evt.event_type === 'meeting') {
        tags.push('Meeting');
        tags.push('Active');
    } else {
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

/* ─────────────────────────── Component ─────────────────────────── */
export default function GanttTimeline({
    events,
    onSelectEvent,
    selectedEventId,
}: GanttTimelineProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const nowLineRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (nowLineRef.current && scrollRef.current) {
            const offset = nowLineRef.current.offsetLeft - 200;
            scrollRef.current.scrollLeft = Math.max(0, offset);
        }
    }, []);

    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const nowOffset = ((nowMins - START_HOUR * 60) / 30) * HALF_HOUR_W;
    const showNow = nowOffset > 0 && nowOffset < TIMELINE_W;

    const laneEvents = useMemo(() => {
        const buckets: CalendarEvent[][] = LANE_CATEGORIES.map(() => []);
        const sorted = [...events].sort(
            (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
        );
        sorted.forEach(evt => {
            const idx = getLaneIndex(evt);
            buckets[idx].push(evt);
        });
        return buckets;
    }, [events]);

    const totalHeight = TIME_HEADER_H + LANE_CATEGORIES.length * LANE_H;

    return (
        <div className="dash-card rounded-2xl overflow-hidden">
            <div
                ref={scrollRef}
                className="overflow-x-auto overflow-y-auto"
                style={{ maxHeight: totalHeight + 20 }}
            >
                <div className="relative" style={{ minWidth: LANE_LABEL_W + TIMELINE_W }}>

                    {/* ── Time Axis Header ── */}
                    <div
                        className="sticky top-0 z-20 flex border-b dash-border"
                        style={{ height: TIME_HEADER_H }}
                    >
                        <div
                            className="sticky left-0 z-30 dash-surface border-r dash-border"
                            style={{ width: LANE_LABEL_W, minWidth: LANE_LABEL_W }}
                        />

                        <div className="flex relative dash-surface">
                            {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-center border-r dash-text-tertiary shrink-0 text-[10px] font-medium"
                                    style={{ width: HALF_HOUR_W, minWidth: HALF_HOUR_W, borderColor: 'var(--color-border)' }}
                                >
                                    {i % 2 === 0 ? formatTimeSlot(i) : ''}
                                </div>
                            ))}

                            {showNow && (
                                <div
                                    className="absolute bottom-0 z-40 text-[9px] font-bold cal-text-marketing -translate-x-1/2"
                                    style={{ left: nowOffset }}
                                >
                                    {formatTimeSlot(Math.floor((nowMins - START_HOUR * 60) / 30))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Swim Lanes ── */}
                    {LANE_CATEGORIES.map((lane, laneIdx) => (
                        <div
                            key={lane.key}
                            className="flex border-b relative"
                            style={{ height: LANE_H, borderColor: 'var(--color-border)' }}
                        >
                            <div
                                className="sticky left-0 z-10 dash-surface border-r dash-border flex items-center justify-center"
                                style={{ width: LANE_LABEL_W, minWidth: LANE_LABEL_W }}
                            >
                                <span
                                    className="text-[11px] font-semibold tracking-wider dash-text-tertiary uppercase"
                                    style={{
                                        writingMode: 'vertical-lr',
                                        transform: 'rotate(180deg)',
                                    }}
                                >
                                    {lane.label}
                                </span>
                            </div>

                            <div className="relative flex-1" style={{ width: TIMELINE_W }}>
                                {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="absolute top-0 bottom-0"
                                        style={{ left: i * HALF_HOUR_W, width: HALF_HOUR_W, borderRight: '1px solid var(--color-border)' }}
                                    />
                                ))}

                                {laneEvents[laneIdx].map((evt) => {
                                    const left = getEventLeft(evt);
                                    const width = getEventWidth(evt);
                                    const isSelected = selectedEventId === evt.id;
                                    const profile = evt.creator_profile;
                                    const tags = getTagsForEvent(evt);
                                    const durationMins = evt.event_type === 'legal_review' ? 120 : 90;

                                    return (
                                        <button
                                            key={evt.id}
                                            onClick={() => onSelectEvent(evt)}
                                            className={`absolute top-3 flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all duration-200 cursor-pointer group z-10 ${isSelected
                                                ? 'cal-selected-event shadow-lg ring-2 cal-ring-selected'
                                                : evt.submission_status === 'rejected' ? 'bg-red-50 text-red-900 border border-red-200'
                                                    : evt.submission_status === 'published' ? 'bg-yellow-50 text-yellow-900 border border-yellow-200'
                                                        : evt.submission_status === 'signed_off' ? 'bg-green-50 text-green-900 border border-green-200'
                                                            : evt.submission_status === 'amend_requested' ? 'bg-orange-50 text-orange-900 border border-orange-200'
                                                                : 'dash-card hover:shadow-md'
                                                }`}
                                            style={{
                                                left,
                                                width: Math.max(width, 180),
                                                height: LANE_H - 24,
                                            }}
                                            title={evt.title}
                                        >
                                            {profile?.avatar_url ? (
                                                <img
                                                    src={profile.avatar_url}
                                                    alt={profile.full_name}
                                                    className={`w-8 h-8 rounded-full object-cover shrink-0 ${isSelected ? 'ring-2 ring-white' : 'ring-1 ring-[var(--color-border)]'}`}
                                                />
                                            ) : (
                                                <div
                                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${isSelected
                                                        ? 'bg-white/20 text-white ring-2 ring-white'
                                                        : 'text-white'
                                                        }`}
                                                    style={!isSelected ? {
                                                        background: evt.submission_status === 'rejected' ? '#ef4444' :
                                                            evt.submission_status === 'published' ? '#eab308' :
                                                                evt.submission_status === 'signed_off' ? '#22c55e' :
                                                                    lane.color
                                                    } : undefined}
                                                >
                                                    {evt.submission_status === 'rejected' ? '🚫' : profile ? getInitials(profile.full_name) : '?'}
                                                </div>
                                            )}

                                            <div className="min-w-0 flex-1">
                                                <p className={`text-xs font-semibold truncate ${isSelected ? 'text-white' : 'dash-text'}`}>
                                                    {evt.title}
                                                </p>
                                                <p className={`text-[10px] truncate ${isSelected ? 'text-white/70' : 'dash-text-tertiary'}`}>
                                                    {formatTimeRange(evt.scheduled_at, durationMins)}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                                {tags.map(tag => {
                                                    let tagClass = '';
                                                    if (isSelected) tagClass = 'bg-white/20 text-white';
                                                    else if (tag === 'Approved') tagClass = 'bg-green-100 text-green-700';
                                                    else if (tag === 'Published') tagClass = 'bg-yellow-100 text-yellow-700';
                                                    else if (tag === 'Rejected') tagClass = 'bg-red-100 text-red-700';
                                                    else if (tag === 'Amend Required') tagClass = 'bg-orange-100 text-orange-700';
                                                    else tagClass = 'dash-accent';

                                                    return (
                                                        <span
                                                            key={tag}
                                                            className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${tagClass}`}
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
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* ── Now Indicator Line ── */}
                    {showNow && (
                        <div
                            ref={nowLineRef}
                            className="absolute z-30 pointer-events-none"
                            style={{
                                left: LANE_LABEL_W + nowOffset,
                                top: 0,
                                bottom: 0,
                                width: 2,
                            }}
                        >
                            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full cal-bg-marketing ring-2 shadow-sm z-40 ring-[var(--color-surface)]" />
                            <div className="w-[2px] h-full cal-bg-marketing mx-auto" />
                        </div>
                    )}
                </div>
            </div>

            {events.length === 0 && (
                <div className="flex items-center justify-center py-16 dash-text-tertiary">
                    <div className="text-center">
                        <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
                        <p className="text-sm font-medium">No events in this range</p>
                        <p className="text-xs mt-1 opacity-60">Try expanding your timeline window</p>
                    </div>
                </div>
            )}
        </div>
    );
}
