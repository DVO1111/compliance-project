import { useEffect, useState, useMemo } from 'react';
import { Calendar, Clock, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardCard from '../ui/DashboardCard';
import { SkeletonChart } from '../ui/Skeleton';
import { ErrorState } from '../ui/EmptyState';
import { getAllEvents, type CalendarEvent } from '../../../lib/calendarService';
import { logger } from '../../../lib/logger';

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 6 AM to 8 PM

export default function UpcomingDeadlinesWidget({
    companyId,
}: {
    companyId: string;
}) {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date>(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    });

    useEffect(() => {
        async function fetchUpcomingEvents() {
            if (!companyId) return;
            setLoading(true);
            setError(null);

            const start = new Date();
            start.setHours(0, 0, 0, 0);
            const end = new Date();
            end.setDate(start.getDate() + 7);
            end.setHours(23, 59, 59, 999);

            try {
                const data = await getAllEvents(companyId, {
                    start: start.toISOString(),
                    end: end.toISOString()
                });
                setEvents(data);
            } catch (err: any) {
                logger.error('Error fetching upcoming deadlines:', err);
                setError(err.message || 'Failed to load upcoming deadlines');
            } finally {
                setLoading(false);
            }
        }

        fetchUpcomingEvents();
    }, [companyId]);

    const days = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() + i);
            d.setHours(0, 0, 0, 0);
            return d;
        });
    }, []);

    const filteredEvents = useMemo(() => {
        return events.filter(e => {
            const d = new Date(e.scheduled_at);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === selectedDate.getTime();
        }).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    }, [events, selectedDate]);

    const getEventStyle = (status: string | null | undefined) => {
        if (!status) return 'bg-indigo-500/10 border-indigo-500/20 text-indigo-500';
        switch (status) {
            case 'rejected': return 'bg-red-500/10 border-red-500/20 text-red-500';
            case 'published': return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500';
            case 'signed_off': return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500';
            case 'amend_requested': return 'bg-orange-500/10 border-orange-500/20 text-orange-500';
            default: return 'bg-indigo-500/10 border-indigo-500/20 text-indigo-500';
        }
    };

    if (loading) return <DashboardCard className="min-h-[400px] max-h-[400px]"><SkeletonChart /></DashboardCard>;
    if (error) return <DashboardCard className="min-h-[400px] max-h-[400px]"><ErrorState message={error} /></DashboardCard>;

    return (
        <DashboardCard className="h-full flex flex-col min-h-[400px] max-h-[400px] overflow-hidden p-0 relative">
            {/* Header with Title and Day Picker */}
            <div className="pt-4 px-4 shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-indigo-500/10">
                            <Calendar className="w-4 h-4 text-indigo-500" />
                        </div>
                        <h3 className="text-sm font-bold dash-text">Upcoming Deadlines</h3>
                    </div>
                </div>

                {/* Horizontal Day Picker */}
                <div className="flex items-center justify-between gap-1 p-1 mb-2 bg-[var(--color-surface-alt)] rounded-xl border dash-border">
                    {days.map((d, idx) => {
                        const isSelected = d.getTime() === selectedDate.getTime();
                        return (
                            <button
                                key={idx}
                                onClick={() => setSelectedDate(d)}
                                className={`flex-1 flex flex-col items-center py-1.5 rounded-lg transition-all duration-200 ${isSelected
                                    ? 'bg-[var(--color-surface)] shadow-sm scale-[1.02] border dash-border text-indigo-500'
                                    : 'hover:bg-white/5 dash-text-tertiary'
                                    }`}
                            >
                                <span className="text-[9px] uppercase font-black tracking-tighter">
                                    {d.toLocaleDateString('en-US', { weekday: 'short' })}
                                </span>
                                <span className={`text-xs font-black mt-0.5 ${isSelected ? 'text-[var(--color-text-primary)]' : ''}`}>
                                    {d.getDate()}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Vertical Timeline Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4">
                <div className="relative mt-2">
                    {/* Hourly Markers */}
                    {HOURS.map(h => (
                        <div key={h} className="group relative flex items-start gap-4 h-14 last:h-8">
                            <span className="w-10 text-[10px] font-bold dash-text-tertiary pt-1 sticky left-0 shrink-0">
                                {h % 12 === 0 ? 12 : h % 12}:00 {h >= 12 ? 'PM' : 'AM'}
                            </span>
                            <div className="flex-1 border-t dash-border/40 mt-2.5 relative group-hover:border-dash-border transition-colors">
                                {/* Current Time Indicator (if selectedDate is Today) */}
                                {selectedDate.toDateString() === new Date().toDateString() && new Date().getHours() === h && (
                                    <div className="absolute -top-[1px] left-0 w-full flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 ring-2 ring-indigo-500/20" />
                                        <div className="flex-1 h-[1px] bg-indigo-500" />
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Events Layer */}
                    <div className="absolute top-[10px] left-[56px] right-0 bottom-0 pointer-events-none">
                        <AnimatePresence mode="popLayout">
                            {filteredEvents.map(evt => {
                                const startDate = new Date(evt.scheduled_at);
                                const h = startDate.getHours();
                                const m = startDate.getMinutes();
                                const relativeTop = ((h - 6) * 56) + (m / 60 * 56);
                                const profile = (evt as any).creator_profile;

                                return (
                                    <motion.div
                                        key={evt.id}
                                        initial={{ opacity: 0, x: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, x: 0, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        className={`absolute w-full pointer-events-auto flex items-center gap-2.5 p-2.5 rounded-xl border shadow-sm backdrop-blur-md cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all group/evt ${getEventStyle(evt.submission_status)}`}
                                        style={{ top: relativeTop }}
                                    >
                                        <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center bg-white/10 ring-1 ring-white/10">
                                            {profile?.avatar_url ? (
                                                <img src={profile.avatar_url} className="w-full h-full rounded-lg object-cover" alt="" />
                                            ) : (
                                                <div className="w-full h-full rounded-lg bg-indigo-500 flex items-center justify-center text-[10px] text-white">
                                                    {profile?.full_name?.charAt(0) || '?'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                <span className="text-[9px] font-black uppercase tracking-wider opacity-60">
                                                    {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <span className="w-1 h-1 rounded-full bg-current opacity-30" />
                                                <span className="text-[9px] font-bold opacity-80 truncate">
                                                    {evt.event_type === 'legal_review' ? 'Legal Review' : 'Marketing upload'}
                                                </span>
                                            </div>
                                            <h4 className="text-[11px] font-black leading-tight truncate">
                                                {evt.title}
                                            </h4>
                                        </div>
                                        <div className="shrink-0 opacity-0 group-hover/evt:opacity-100 transition-opacity">
                                            <ChevronRight className="w-3.5 h-3.5" />
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>

                        {filteredEvents.length === 0 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40">
                                <Clock className="w-8 h-8 mb-2 stroke-[1.5]" />
                                <p className="text-[10px] font-bold">No events for this day</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Subtle Gradient Fade at Bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[var(--color-surface)] to-transparent pointer-events-none z-20" />
        </DashboardCard>
    );
}
