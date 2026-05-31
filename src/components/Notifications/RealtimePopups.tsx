import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { AlertTriangle, Check, Clock, Loader2 } from 'lucide-react';
import { logger } from '../../lib/logger';

interface NotificationPayload {
    id: string;
    type: string | null;
    message: string | null;
    content_id: string | null;
    is_read?: boolean;
}

export default function RealtimePopups() {
    const { user } = useAuth();
    const [popup, setPopup] = useState<NotificationPayload | null>(null);
    const [parsedMsg, setParsedMsg] = useState<{ text?: string, proposed_date?: string, event_title?: string, deadline?: string } | null>(null);
    const [processing, setProcessing] = useState(false);

    const showNotification = useCallback((notif: NotificationPayload) => {
        if (notif.type !== 'expedited_review_request' && notif.type !== 'deadline_alert') return;
        setPopup(notif);
        try {
            if (notif.message) {
                setParsedMsg(JSON.parse(notif.message));
            }
        } catch (e) { logger.error('Failed to parse ntf msg', e); }

        // Play notification sound
        try {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.volume = 0.5;
            audio.play().catch(() => { });
        } catch (e) { }
    }, []);

    useEffect(() => {
        if (!user) return;

        // ── 1) Realtime subscription (instant, but requires Realtime enabled on the table) ──
        let channel: ReturnType<typeof supabase.channel> | null = null;
        try {
            channel = supabase.channel(`notifications:recipient_id=eq.${user.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notifications',
                        filter: `recipient_id=eq.${user.id}`,
                    },
                    (payload) => {
                        const newNotif = payload.new as NotificationPayload;
                        showNotification(newNotif);
                    }
                )
                .subscribe((status, err) => {
                    if (err) logger.error('Realtime subscription error:', err);
                });
        } catch (err) {
            logger.error('Realtime channel unavailable, falling back to polling:', err);
        }

        // ── 2) Polling fallback (checks every 10s for unread expedited_review_request) ──
        const poll = async () => {
            try {
                const { data } = await supabase
                    .from('notifications')
                    .select('id, type, message, content_id, read_at')
                    .eq('recipient_id', user.id)
                    .in('type', ['expedited_review_request', 'deadline_alert'])
                    .is('read_at', null)
                    .order('created_at', { ascending: false })
                    .limit(1) as any;

                if (data && data.length > 0 && !popup) {
                    showNotification(data[0]);
                }
            } catch (err) {
                // Silently fail — polling is a fallback
            }
        };

        // Poll immediately on mount, then every 10 seconds
        poll();
        const pollInterval = setInterval(poll, 10000);

        return () => {
            if (channel) supabase.removeChannel(channel);
            clearInterval(pollInterval);
        };
    }, [user, popup, showNotification]);

    const markAsRead = async (id: string) => {
        try {
            await (supabase.from('notifications') as any)
                .update({ read_at: new Date().toISOString() })
                .eq('id', id);
        } catch (e) { }
    };

    const handleAccept = async () => {
        if (!popup || !parsedMsg?.proposed_date) return;
        setProcessing(true);
        try {
            const proposedIso = new Date(parsedMsg.proposed_date).toISOString();

            // Find the calendar event linked to this content submission
            const { data: events } = await supabase
                .from('calendar_events')
                .select('id')
                .eq('submission_id', popup.content_id as string)
                .eq('event_type', 'legal_review')
                .limit(1) as any;

            if (events && events.length > 0) {
                await (supabase.from('calendar_events') as any)
                    .update({
                        legal_planned_at: proposedIso,
                        scheduled_at: proposedIso,
                        legal_acknowledged: true
                    })
                    .eq('id', events[0].id);
            }

            // Also update the marketing event's legal_planned_at
            const { data: mktEvents } = await supabase
                .from('calendar_events')
                .select('id')
                .eq('submission_id', popup.content_id as string)
                .eq('event_type', 'marketing_publish')
                .limit(1) as any;

            if (mktEvents && mktEvents.length > 0) {
                await (supabase.from('calendar_events') as any)
                    .update({ legal_planned_at: proposedIso })
                    .eq('id', mktEvents[0].id);
            }

            await markAsRead(popup.id);
            setPopup(null);
            setParsedMsg(null);
        } catch (err) {
            logger.error('Failed to accept expedited review:', err);
        } finally {
            setProcessing(false);
        }
    };

    const handleDecline = async () => {
        if (popup) await markAsRead(popup.id);
        setPopup(null);
        setParsedMsg(null);
    };

    if (!popup) return null;

    if (popup.type === 'deadline_alert') {
        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--color-overlay)] backdrop-blur-sm p-4 animate-in fade-in duration-200">
                <div className="dash-card rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="bg-gradient-to-r from-[var(--color-danger)] to-rose-600 px-5 py-4 flex items-start gap-3">
                        <div className="dash-card/20 p-2 rounded-xl shrink-0">
                            <Clock className="w-6 h-6 text-white animate-pulse" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white leading-tight">Deadline Approaching</h2>
                            <p className="text-red-100 text-xs mt-0.5">&lt; 2 Hours Remaining</p>
                        </div>
                    </div>

                    <div className="p-5 space-y-4">
                        <div>
                            <p className="text-xs font-bold dash-text-secondary uppercase tracking-wider mb-1">Event</p>
                            <p className="font-semibold dash-text">{parsedMsg?.event_title || 'Unknown Event'}</p>
                        </div>

                        <div className="bg-[var(--color-danger-soft)] rounded-xl p-3 border border-[var(--color-danger)]/20">
                            <p className="text-sm text-[var(--color-danger)]">{parsedMsg?.text || 'A deadline is approaching rapidly.'}</p>
                        </div>

                        <div className="flex items-center gap-3 dash-surface-alt p-3 rounded-xl border dash-border dash-text">
                            <Clock className="w-5 h-5 dash-text-tertiary shrink-0" />
                            <div>
                                <p className="text-xs font-semibold dash-text-secondary">Scheduled Time</p>
                                <p className="font-bold">
                                    {parsedMsg?.deadline
                                        ? new Date(parsedMsg.deadline).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })
                                        : 'Unknown'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="px-5 py-4 border-t dash-border dash-surface-alt flex gap-3">
                        <button
                            onClick={handleDecline}
                            disabled={processing}
                            className="w-full px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[var(--color-danger)] hover:opacity-90 shadow-md shadow-red-600/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:scale-100"
                        >
                            Acknowledge
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--color-overlay)] backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="dash-card rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-4 flex items-start gap-3">
                    <div className="dash-card/20 p-2 rounded-xl shrink-0">
                        <AlertTriangle className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white leading-tight">Expedited Review Requested</h2>
                        <p className="text-behance-amber-100 text-xs mt-0.5">Marketing needs your review sooner</p>
                    </div>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <p className="text-xs font-bold dash-text-secondary uppercase tracking-wider mb-1">Content Item</p>
                        <p className="font-semibold dash-text">{parsedMsg?.event_title || 'Unknown Event'}</p>
                    </div>

                    <div className="dash-surface-alt rounded-xl p-3 border dash-border">
                        <p className="text-xs font-bold dash-text-secondary uppercase tracking-wider mb-1">Message from Marketing</p>
                        <p className="text-sm dash-text italic">"{parsedMsg?.text || 'No message provided.'}"</p>
                    </div>

                    <div className="flex items-center gap-3 bg-behance-amber-50 p-3 rounded-xl border border-behance-amber-100 text-behance-amber-900">
                        <Clock className="w-5 h-5 text-behance-amber-600 shrink-0" />
                        <div>
                            <p className="text-xs font-semibold text-behance-amber-700">Proposed New Date</p>
                            <p className="font-bold">
                                {parsedMsg?.proposed_date
                                    ? new Date(parsedMsg.proposed_date).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })
                                    : 'ASAP'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="px-5 py-4 border-t dash-border dash-surface-alt flex gap-3">
                    <button
                        onClick={handleDecline}
                        disabled={processing}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold dash-text-secondary dash-card border dash-border hover:dash-surface-alt transition-colors disabled:opacity-50"
                    >
                        Dismiss
                    </button>
                    <button
                        onClick={handleAccept}
                        disabled={processing}
                        className="flex-[2] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-behance-amber-600 hover:bg-behance-amber-700 shadow-md shadow-amber-600/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:scale-100"
                    >
                        {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Accept New Date
                    </button>
                </div>
            </div>
        </div>
    );
}

