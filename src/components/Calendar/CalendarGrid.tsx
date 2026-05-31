// src/components/Calendar/CalendarGrid.tsx
// Behance-style calendar grid — theme-aware
import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarEvent } from '../../lib/calendarService';

interface CalendarGridProps {
    events: CalendarEvent[];
    onSelectDay: (date: Date, dayEvents: CalendarEvent[]) => void;
    onSelectEvent?: (event: CalendarEvent) => void;
    selectedDate?: Date | null;
    viewMonth: Date;
    onMonthChange: (date: Date) => void;
    onAdd?: () => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_ABBREV = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

function sameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

export default function CalendarGrid({
    events, onSelectDay, onSelectEvent, selectedDate, viewMonth, onMonthChange, onAdd
}: CalendarGridProps) {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();

    const prevMonth = () => onMonthChange(new Date(year, month - 1, 1));
    const nextMonth = () => onMonthChange(new Date(year, month + 1, 1));
    const goToday = () => onMonthChange(new Date());

    const grid = useMemo(() => {
        const firstDay = new Date(year, month, 1);
        const startDow = firstDay.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const cells: (Date | null)[] = [];
        for (let i = 0; i < startDow; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
        while (cells.length % 7 !== 0) cells.push(null);
        return cells;
    }, [year, month]);

    const weekDates = useMemo(() => {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const dates: Date[] = [];
        for (let d = 1; d <= daysInMonth; d++) dates.push(new Date(year, month, d));
        return dates;
    }, [year, month]);

    const eventsByDay = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        for (const evt of events) {
            const d = new Date(evt.scheduled_at);
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(evt);
        }
        return map;
    }, [events]);

    const today = new Date();

    return (
        <div className="dash-card rounded-2xl overflow-hidden">
            {/* ── Header with month navigation ── */}
            <div className="flex items-center justify-between px-5 py-4 border-b dash-border">
                <div>
                    <h2 className="text-xl font-bold dash-text">Calendar</h2>
                    <p className="text-xs dash-text-tertiary mt-0.5">Complete overview of your schedule</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border dash-border hover:dash-surface-alt transition-colors">
                            <ChevronLeft className="w-4 h-4 dash-text-secondary" />
                        </button>
                        <span className="text-sm font-semibold dash-text min-w-[130px] text-center">
                            {MONTHS[month]} {year}
                        </span>
                        <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border dash-border hover:dash-surface-alt transition-colors">
                            <ChevronRight className="w-4 h-4 dash-text-secondary" />
                        </button>
                    </div>

                    <div className="flex -space-x-2">
                        <div className="w-7 h-7 rounded-full cal-bg-marketing ring-2 ring-[var(--color-surface)] flex items-center justify-center text-[9px] font-bold text-white">JM</div>
                        <div className="w-7 h-7 rounded-full cal-bg-legal ring-2 ring-[var(--color-surface)] flex items-center justify-center text-[9px] font-bold text-white">SA</div>
                    </div>

                    <button
                        onClick={goToday}
                        className="flex items-center gap-1.5 px-3 py-1.5 border dash-border text-[var(--color-text-secondary)] text-[10px] font-bold rounded-full hover:dash-surface-alt transition-colors shadow-sm"
                    >
                        Today
                    </button>

                    <button
                        onClick={onAdd || (() => { })}
                        className="flex items-center gap-1.5 px-3 py-1.5 cal-bg-marketing text-white text-[10px] font-bold rounded-full hover:opacity-90 transition-opacity shadow-sm whitespace-nowrap"
                    >
                        + Add
                    </button>
                </div>
            </div>

            {/* ── Horizontal Week-Day Strip ── */}
            <div className="px-5 py-3 border-b dash-border overflow-x-auto">
                <div className="flex items-center gap-1 min-w-max">
                    {weekDates.map((date, i) => {
                        const isToday = sameDay(date, today);
                        const isSelected = selectedDate ? sameDay(date, selectedDate) : false;
                        const dow = DAY_ABBREV[date.getDay()];
                        const dayNum = date.getDate();
                        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
                        const dayEvents = eventsByDay.get(key) || [];
                        const showSep = i > 0 && date.getDay() === 1;

                        return (
                            <div key={key} className="flex items-center">
                                {showSep && <div className="w-4 h-6 mx-1 border-l dash-border" />}
                                <button
                                    onClick={() => onSelectDay(date, dayEvents)}
                                    className={`flex flex-col items-center px-2.5 py-1.5 rounded-xl transition-all min-w-[36px] ${isToday
                                        ? 'cal-bg-marketing text-white shadow-sm'
                                        : isSelected
                                            ? 'dash-surface-alt dash-accent'
                                            : 'dash-text-tertiary hover:dash-surface-alt'
                                        }`}
                                >
                                    <span className="text-[10px] font-semibold uppercase">{dow}</span>
                                    <span className="text-sm font-bold">{dayNum}</span>
                                    {dayEvents.length > 0 && !isToday && (
                                        <div className="w-1 h-1 rounded-full cal-bg-marketing mt-0.5" />
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Day headers ── */}
            <div className="grid grid-cols-7 border-b dash-border">
                {DAYS.map((d) => (
                    <div key={d} className="text-center text-[10px] font-semibold dash-text-tertiary uppercase tracking-wider py-2">
                        {d}
                    </div>
                ))}
            </div>

            {/* ── Month Grid ── */}
            <div className="grid grid-cols-7">
                {grid.map((date, i) => {
                    if (!date) {
                        return <div key={`empty-${i}`} className="min-h-[72px] border-b border-r dash-surface-alt" style={{ borderColor: 'var(--color-border)' }} />;
                    }

                    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
                    const dayEvents = eventsByDay.get(key) || [];
                    const isToday = sameDay(date, today);
                    const isSelected = selectedDate ? sameDay(date, selectedDate) : false;

                    return (
                        <button
                            key={key}
                            onClick={() => onSelectDay(date, dayEvents)}
                            className={`min-h-[72px] border-b border-r p-2 text-left transition-all hover:dash-surface-alt ${isSelected ? 'ring-2 ring-[var(--color-cal-selected)] ring-inset' : ''
                                }`}
                            style={{
                                borderColor: 'var(--color-border)',
                                background: isToday ? 'var(--color-accent-soft)' : isSelected ? 'var(--color-surface-alt)' : undefined,
                            }}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className={`text-xs font-medium ${isToday
                                    ? 'cal-bg-marketing text-white w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold'
                                    : 'dash-text-secondary'
                                    }`}>
                                    {date.getDate()}
                                </span>
                            </div>

                            <div className="space-y-0.5">
                                {dayEvents.slice(0, 2).map((evt) => (
                                    <button
                                        key={evt.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSelectEvent && onSelectEvent(evt);
                                        }}
                                        className={`w-full text-left text-[9px] px-1.5 py-0.5 rounded truncate font-medium transition-all ${evt.submission_status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                evt.submission_status === 'published' ? 'bg-yellow-100 text-yellow-700' :
                                                    evt.submission_status === 'signed_off' ? 'bg-green-100 text-green-700' :
                                                        evt.submission_status === 'amend_requested' ? 'bg-orange-100 text-orange-700' :
                                                            evt.event_type === 'legal_review'
                                                                ? 'cal-bg-legal-soft cal-text-legal'
                                                                : evt.event_type === 'meeting'
                                                                    ? 'bg-cyan-100/50 text-cyan-700'
                                                                    : evt.needs_schedule_confirmation
                                                                        ? 'cal-bg-warning-soft cal-text-warning'
                                                                        : evt.status === 'completed'
                                                                            ? 'cal-bg-success-soft cal-text-success'
                                                                            : 'cal-bg-marketing-soft cal-text-marketing'
                                            }`}
                                    >
                                        {evt.submission_status === 'rejected' ? '🚫 ' : evt.submission_status === 'amend_requested' ? '✍️ ' : ''}{evt.title}
                                    </button>
                                ))}
                                {dayEvents.length > 2 && (
                                    <span className="text-[9px] dash-text-tertiary">+{dayEvents.length - 2} more</span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export function getMonthRange(d: Date): { start: string; end: string } {
    const y = d.getFullYear();
    const m = d.getMonth();
    return {
        start: new Date(y, m, 1).toISOString(),
        end: new Date(y, m + 1, 0, 23, 59, 59).toISOString(),
    };
}
