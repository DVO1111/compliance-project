import { useMemo, useState } from 'react';
import { Bell, CheckCheck, AlertTriangle, Filter, Loader2 } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../contexts/AuthContext';
import { getPermissions } from '../../lib/permissions';
import { logger } from '../../lib/logger';

const TYPE_LABEL: Record<string, string> = {
    awaiting_legal: 'Awaiting Legal Review',
    submitted_for_legal: 'Submitted for Legal Review',
    legal_approved: 'Legal Approved',
    legal_rejected: 'Legal Rejected',
    legal_amend: 'Legal Requested Amendments',
    published: 'Content Published',
    new_comment: 'New Comment',
    reverification_required: 'Re-verification Required',
    calendar_legal_date_set: 'Legal Review Scheduled',
    calendar_24h: '24h Reminder',
    calendar_5h: '5h Urgent Reminder',
};

const TYPE_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'unread', label: 'Unread' },
    { value: 'legal', label: 'Legal' },
    { value: 'calendar', label: 'Reminders' },
    { value: 'published', label: 'Published' },
];

function timeAgo(dateIso: string) {
    const d = new Date(dateIso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString();
}

function typeMatchesFilter(type: string, filter: string): boolean {
    if (filter === 'all') return true;
    if (filter === 'unread') return false; // handled separately
    if (filter === 'legal') return type.startsWith('legal') || type === 'awaiting_legal' || type === 'submitted_for_legal';
    if (filter === 'calendar') return type.startsWith('calendar') || type === 'reverification_required';
    if (filter === 'published') return type === 'published';
    return true;
}

export default function NotificationsPage() {
    const { user, profile } = useAuth();
    const [typeFilter, setTypeFilter] = useState('all');
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 20;

    const userId = user?.id ?? null;
    const companyId = (profile as any)?.company_id ?? null;
    const perms = getPermissions({ profileRole: profile?.role, customPermissions: (profile as any)?.customPermissions });

    const { items, loading, unreadCount, markRead, markAllRead } = useNotifications({ userId, companyId });

    const filtered = useMemo(() => {
        return items.filter(n => {
            if (typeFilter === 'unread') return !n.read_at;
            return typeMatchesFilter(n.type ?? '', typeFilter);
        });
    }, [items, typeFilter]);

    const paginated = useMemo(() => filtered.slice(0, (page + 1) * PAGE_SIZE), [filtered, page]);
    const hasMore = paginated.length < filtered.length;

    const openNotification = async (n: any) => {
        const targetPage = perms.canViewLegalReview ? 'legal-review' : 'archive';
        if (n?.content_id) localStorage.setItem('cc_open_content_id', n.content_id);
        window.dispatchEvent(new CustomEvent('navigate', { detail: { page: targetPage } }));
        if (n?.content_id) window.dispatchEvent(new CustomEvent('open-document', { detail: { id: n.content_id } }));
        try { await markRead(n.id); } catch (e) { logger.error('markRead failed:', e); }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold dash-text">Notifications</h1>
                    <p className="text-sm dash-text-tertiary">
                        {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                    </p>
                </div>
                {unreadCount > 0 && (
                    <button
                        onClick={markAllRead}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border dash-border hover:bg-[var(--color-surface-alt)] transition-colors dash-text"
                    >
                        <CheckCheck size={16} />
                        Mark all read
                    </button>
                )}
            </div>

            {/* Type filter tabs */}
            <div className="flex items-center gap-1 flex-wrap">
                <Filter size={14} className="dash-text-tertiary mr-1" />
                {TYPE_FILTERS.map(f => (
                    <button
                        key={f.value}
                        onClick={() => { setTypeFilter(f.value); setPage(0); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            typeFilter === f.value
                                ? 'bg-[var(--color-accent)] text-white'
                                : 'dash-surface-alt dash-text-secondary hover:bg-[var(--color-surface-alt)]'
                        }`}
                    >
                        {f.label}
                        {f.value === 'unread' && unreadCount > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">{unreadCount}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* List */}
            <div className="dash-card border dash-border rounded-2xl overflow-hidden shadow-sm">
                {loading ? (
                    <div className="flex items-center justify-center py-16 gap-3 dash-text-secondary">
                        <Loader2 size={20} className="animate-spin" />
                        <span className="text-sm">Loading notifications…</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <div className="w-12 h-12 rounded-full bg-[var(--color-surface-alt)] flex items-center justify-center">
                            <Bell size={22} className="dash-text-tertiary" />
                        </div>
                        <p className="font-semibold dash-text">
                            {typeFilter === 'unread' ? 'All caught up!' : 'No notifications yet'}
                        </p>
                        <p className="text-sm dash-text-tertiary text-center max-w-xs">
                            {typeFilter === 'unread'
                                ? 'You have no unread notifications.'
                                : 'Legal reviews, approvals, and reminders will appear here.'}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y dash-divide">
                        {paginated.map(n => {
                            const unread = !n.read_at;
                            const niceType = n.type ? TYPE_LABEL[n.type] ?? n.type : null;
                            const isWatchdog = n.type === 'reverification_required';
                            const isUrgent = n.type === 'calendar_5h';

                            return (
                                <button
                                    key={n.id}
                                    onClick={() => openNotification(n)}
                                    className={`w-full text-left px-6 py-4 hover:bg-[var(--color-surface-alt)] transition-colors flex items-start gap-4 ${
                                        isWatchdog && unread ? 'bg-[var(--color-warning-soft)]'
                                        : isUrgent && unread ? 'bg-[var(--color-danger-soft)]'
                                        : unread ? 'bg-[var(--color-info-soft)]'
                                        : ''
                                    }`}
                                >
                                    {/* Icon dot */}
                                    <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                                        unread
                                            ? isWatchdog ? 'bg-amber-500' : isUrgent ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-accent)]'
                                            : 'bg-transparent'
                                    }`} />

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-3">
                                            <p className={`text-sm leading-snug ${unread ? 'font-semibold dash-text' : 'dash-text-secondary'}`}>
                                                {n.message || 'Notification'}
                                            </p>
                                            {isWatchdog && (
                                                <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            {niceType && (
                                                <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[var(--color-surface-alt)] dash-text-tertiary">
                                                    {niceType}
                                                </span>
                                            )}
                                            <span className="text-xs dash-text-tertiary">{timeAgo(n.created_at)}</span>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}

                        {hasMore && (
                            <div className="px-6 py-4 text-center">
                                <button
                                    onClick={() => setPage(p => p + 1)}
                                    className="text-sm font-medium text-[var(--color-accent)] hover:underline"
                                >
                                    Load more ({filtered.length - paginated.length} remaining)
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
