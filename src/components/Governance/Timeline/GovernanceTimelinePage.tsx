import React, { useState, useEffect } from 'react';
import { Clock, History, FileText, CheckCircle, ShieldAlert, Zap, Calendar, User, ChevronRight, Lock } from 'lucide-react';
import { governanceTimelineService, GovernanceTimelineEvent } from '../../../lib/governance/governanceTimelineService';
import { useAuth } from '../../../contexts/AuthContext';
import { logger } from '../../../lib/logger';

export default function GovernanceTimelinePage() {
    const { profile } = useAuth();
    const [events, setEvents] = useState<GovernanceTimelineEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState<string>('all');

    useEffect(() => {
        loadTimeline();
    }, []);

    async function loadTimeline() {
        try {
            setLoading(true);
            const data = await governanceTimelineService.getUnifiedTimeline(profile?.company_id || '');
            setEvents(data);
        } catch (err) {
            logger.error('Failed to load timeline:', err);
        } finally {
            setLoading(false);
        }
    }

    const filteredEvents = events.filter(e => filterType === 'all' || e.type === filterType);

    const getEventIcon = (type: string) => {
        switch (type) {
            case 'audit_log': return <History className="w-5 h-5 text-blue-500" />;
            case 'policy_acknowledgement': return <CheckCircle className="w-5 h-5 text-green-500" />;
            case 'automation_run': return <Zap className="w-5 h-5 text-purple-500" />;
            case 'legal_hold': return <Lock className="w-5 h-5 text-red-500" />;
            default: return <FileText className="w-5 h-5 text-gray-500" />;
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">Governance Timeline</h1>
                    <p className="text-[var(--color-text-secondary)] mt-1 max-w-2xl">
                        A unified chronological record of all compliance, security, and governance events across the enterprise.
                    </p>
                </div>
                <button
                    onClick={loadTimeline}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-surface)] border dash-border hover:dash-surface-alt transition-all text-sm font-medium"
                >
                    <Clock className="w-4 h-4" />
                    Refresh Feed
                </button>
            </div>

            {/* Filter Row */}
            <div className="flex flex-wrap gap-2">
                {['all', 'audit_log', 'policy_acknowledgement', 'automation_run', 'legal_hold'].map(type => (
                    <button
                        key={type}
                        onClick={() => setFilterType(type)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${filterType === type
                            ? 'bg-[var(--color-accent)] text-white shadow-lg'
                            : 'bg-[var(--color-surface)] border dash-border text-[var(--color-text-secondary)] hover:dash-surface-alt'
                            }`}
                    >
                        {type.replace(/_/g, ' ')}
                    </button>
                ))}
            </div>

            {/* Timeline Feed */}
            <div className="relative">
                {/* Central vertical line */}
                <div className="absolute left-6 top-8 bottom-0 w-0.5 bg-[var(--color-border)] opacity-50 hidden md:block" />

                <div className="space-y-6">
                    {loading ? (
                        [1, 2, 3, 4].map(i => (
                            <div key={i} className="flex gap-6 animate-pulse">
                                <div className="w-12 h-12 rounded-full bg-gray-100 shrink-0" />
                                <div className="flex-1 dash-card h-24 rounded-2xl" />
                            </div>
                        ))
                    ) : filteredEvents.length === 0 ? (
                        <div className="py-20 text-center text-[var(--color-text-secondary)] dash-card border-dashed border-2 rounded-3xl">
                            No events found for the selected criteria.
                        </div>
                    ) : (
                        filteredEvents.map((event, idx) => (
                            <div key={event.id || idx} className="flex flex-col md:flex-row gap-6 group relative">
                                {/* Icon Circle */}
                                <div className="w-12 h-12 rounded-full bg-[var(--color-surface)] border-4 border-[var(--color-bg)] dash-border flex items-center justify-center shrink-0 z-10 shadow-sm group-hover:scale-110 transition-transform">
                                    {getEventIcon(event.type)}
                                </div>

                                {/* Event Card */}
                                <div className="flex-1 dash-card border dash-border rounded-2xl p-6 hover:shadow-xl transition-all hover:translate-x-1">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-accent)]">{event.type.replace(/_/g, ' ')}</span>
                                                <span className="text-[var(--color-text-tertiary)] text-[10px]">•</span>
                                                <span className="text-[var(--color-text-tertiary)] text-xs font-medium flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(event.timestamp).toLocaleString()}
                                                </span>
                                            </div>
                                            <h3 className="text-lg font-bold text-[var(--color-text-primary)]">{event.description}</h3>
                                        </div>
                                        {event.originalRecord && (
                                            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-surface-alt)] hover:dash-surface text-[10px] font-bold uppercase tracking-wider transition-all border dash-border">
                                                View details
                                                <ChevronRight className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Metadata Chips if available */}
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        <div className="px-3 py-1 rounded-lg bg-[var(--color-surface-alt)] border dash-border text-[10px] font-medium text-[var(--color-text-secondary)] flex items-center gap-1.5">
                                            <User className="w-3 h-3" />
                                            {/* Assuming events have actor info, though not in simplified return structure yet */}
                                            Enterprise System
                                        </div>
                                        {event.type === 'legal_hold' && (
                                            <div className="px-3 py-1 rounded-lg bg-red-50 border border-red-100 text-[10px] font-bold text-red-600 flex items-center gap-1.5 uppercase">
                                                <Lock className="w-3 h-3" />
                                                Immutability Enforced
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
