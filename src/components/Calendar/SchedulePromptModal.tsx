// src/components/Calendar/SchedulePromptModal.tsx
// Modal for schedule confirmation — theme-aware
import { useState } from 'react';
import { X, Calendar, Clock, Zap } from 'lucide-react';
import { confirmSchedule, confirmSameDay, acknowledgeForLegal, type CalendarEvent } from '../../lib/calendarService';

interface Props {
    event: CalendarEvent;
    mode: 'marketing' | 'legal';
    companyId: string;
    onClose: () => void;
    onUpdated: () => void;
}

type MarketingChoice = 'later' | 'today' | null;

export default function SchedulePromptModal({ event, mode, companyId, onClose, onUpdated }: Props) {
    const [choice, setChoice] = useState<MarketingChoice>(null);
    const [dateValue, setDateValue] = useState('');
    const [timeValue, setTimeValue] = useState('09:00');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleMarketingSave = async () => {
        setSaving(true);
        setError('');
        try {
            if (choice === 'later') {
                if (!dateValue) { setError('Please select a date.'); setSaving(false); return; }
                const dt = `${dateValue}T${timeValue}:00.000Z`;
                await confirmSchedule(event.id, dt);
            } else if (choice === 'today') {
                if (!timeValue) { setError('Please select a time.'); setSaving(false); return; }
                await confirmSameDay(event.id, timeValue);
            }
            onUpdated();
            onClose();
        } catch (e: any) {
            setError(e.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleLegalSave = async () => {
        setSaving(true);
        setError('');
        try {
            if (choice === 'today') {
                await acknowledgeForLegal(event.id, 'now', companyId);
            } else {
                if (!dateValue) { setError('Please select a date.'); setSaving(false); return; }
                const dt = `${dateValue}T${timeValue}:00.000Z`;
                await acknowledgeForLegal(event.id, dt, companyId);
            }
            onUpdated();
            onClose();
        } catch (e: any) {
            setError(e.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const isLegalMode = mode === 'legal';
    const accentBorder = isLegalMode ? 'border-[var(--color-cal-legal)]' : 'border-[var(--color-cal-marketing)]';
    const accentBg = isLegalMode ? 'cal-bg-legal-soft' : 'cal-bg-marketing-soft';
    const accentText = isLegalMode ? 'cal-text-legal' : 'cal-text-marketing';
    const accentBtn = isLegalMode ? 'cal-bg-legal hover:opacity-90' : 'cal-bg-marketing hover:opacity-90';
    const focusRing = isLegalMode ? 'focus:ring-[var(--color-cal-legal-soft)] focus:border-[var(--color-cal-legal)]' : 'focus:ring-[var(--color-cal-marketing-soft)] focus:border-[var(--color-cal-marketing)]';

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="dash-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b dash-border">
                    <div>
                        <h3 className="font-bold dash-text">
                            {isLegalMode ? 'Plan Your Review' : 'Schedule Content'}
                        </h3>
                        <p className="text-xs dash-text-tertiary mt-0.5 truncate max-w-[280px]">{event.title}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:dash-surface-alt rounded-lg transition-colors">
                        <X className="w-5 h-5 dash-text-tertiary" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {mode === 'marketing' ? (
                        <>
                            <p className="text-sm dash-text-secondary">
                                This content was uploaded without a scheduled date. When would you like to publish it?
                            </p>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setChoice('later')}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${choice === 'later'
                                        ? `${accentBorder} ${accentBg}`
                                        : 'dash-border hover:border-[var(--color-border-hover)]'
                                        }`}
                                >
                                    <Calendar className={`w-6 h-6 ${choice === 'later' ? accentText : 'dash-text-tertiary'}`} />
                                    <span className="text-sm font-semibold dash-text">Schedule Later</span>
                                    <span className="text-[10px] dash-text-tertiary">Pick a future date</span>
                                </button>
                                <button
                                    onClick={() => setChoice('today')}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${choice === 'today'
                                        ? `${accentBorder} ${accentBg}`
                                        : 'dash-border hover:border-[var(--color-border-hover)]'
                                        }`}
                                >
                                    <Clock className={`w-6 h-6 ${choice === 'today' ? accentText : 'dash-text-tertiary'}`} />
                                    <span className="text-sm font-semibold dash-text">Publish Today</span>
                                    <span className="text-[10px] dash-text-tertiary">Set a time today</span>
                                </button>
                            </div>

                            {choice === 'later' && (
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[11px] font-semibold dash-text-tertiary uppercase tracking-wider block mb-1">Date</label>
                                        <input
                                            type="date"
                                            value={dateValue}
                                            onChange={(e) => setDateValue(e.target.value)}
                                            min={new Date().toISOString().split('T')[0]}
                                            className={`w-full border dash-border rounded-xl px-3 py-2.5 text-sm dash-text dash-surface focus:ring-2 ${focusRing} outline-none`}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-semibold dash-text-tertiary uppercase tracking-wider block mb-1">Time</label>
                                        <input
                                            type="time"
                                            value={timeValue}
                                            onChange={(e) => setTimeValue(e.target.value)}
                                            className={`w-full border dash-border rounded-xl px-3 py-2.5 text-sm dash-text dash-surface focus:ring-2 ${focusRing} outline-none`}
                                        />
                                    </div>
                                </div>
                            )}

                            {choice === 'today' && (
                                <div>
                                    <label className="text-[11px] font-semibold dash-text-tertiary uppercase tracking-wider block mb-1">Publish Time</label>
                                    <input
                                        type="time"
                                        value={timeValue}
                                        onChange={(e) => setTimeValue(e.target.value)}
                                        className={`w-full border dash-border rounded-xl px-3 py-2.5 text-sm dash-text dash-surface focus:ring-2 ${focusRing} outline-none`}
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <p className="text-sm dash-text-secondary">
                                Content deadline: <strong className="dash-text">{new Date(event.scheduled_at).toLocaleString()}</strong>.
                                When do you plan to review this content?
                            </p>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setChoice('later')}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${choice === 'later'
                                        ? `${accentBorder} ${accentBg}`
                                        : 'dash-border hover:border-[var(--color-border-hover)]'
                                        }`}
                                >
                                    <Calendar className={`w-6 h-6 ${choice === 'later' ? accentText : 'dash-text-tertiary'}`} />
                                    <span className="text-sm font-semibold dash-text">Pick a Date</span>
                                    <span className="text-[10px] dash-text-tertiary">Schedule your review</span>
                                </button>
                                <button
                                    onClick={() => setChoice('today')}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${choice === 'today'
                                        ? `${accentBorder} ${accentBg}`
                                        : 'dash-border hover:border-[var(--color-border-hover)]'
                                        }`}
                                >
                                    <Zap className={`w-6 h-6 ${choice === 'today' ? accentText : 'dash-text-tertiary'}`} />
                                    <span className="text-sm font-semibold dash-text">Review Now</span>
                                    <span className="text-[10px] dash-text-tertiary">Start immediately</span>
                                </button>
                            </div>

                            {choice === 'later' && (
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[11px] font-semibold dash-text-tertiary uppercase tracking-wider block mb-1">Review Date</label>
                                        <input
                                            type="date"
                                            value={dateValue}
                                            onChange={(e) => setDateValue(e.target.value)}
                                            min={new Date().toISOString().split('T')[0]}
                                            className={`w-full border dash-border rounded-xl px-3 py-2.5 text-sm dash-text dash-surface focus:ring-2 ${focusRing} outline-none`}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-semibold dash-text-tertiary uppercase tracking-wider block mb-1">Review Time</label>
                                        <input
                                            type="time"
                                            value={timeValue}
                                            onChange={(e) => setTimeValue(e.target.value)}
                                            className={`w-full border dash-border rounded-xl px-3 py-2.5 text-sm dash-text dash-surface focus:ring-2 ${focusRing} outline-none`}
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {error && <p className="text-sm text-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 rounded-xl">{error}</p>}
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t dash-border dash-surface-alt">
                    <button onClick={onClose} className="px-4 py-2 text-sm dash-text-secondary hover:dash-text transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={mode === 'marketing' ? handleMarketingSave : handleLegalSave}
                        disabled={!choice || saving}
                        className={`px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 shadow-sm ${accentBtn}`}
                    >
                        {saving ? 'Saving...' : 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
}
