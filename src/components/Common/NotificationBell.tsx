import { useMemo, useState } from "react";
import { Bell, CheckCheck, Loader2, AlertTriangle } from "lucide-react";
import { useNotifications } from "../../hooks/useNotifications";
import { useAuth } from "../../contexts/AuthContext";
import { getPermissions } from "../../lib/permissions";
import type { PageId } from "../Layout/MainLayout";
import { logger } from '../../lib/logger';

function timeAgo(dateIso: string) {
  const d = new Date(dateIso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ✅ One clean label map (no duplicate keys)
const TYPE_LABEL: Record<string, string> = {
  awaiting_legal: "Awaiting Legal Review",
  submitted_for_legal: "Submitted for Legal Review",
  legal_approved: "Legal Approved",
  legal_rejected: "Legal Rejected",
  legal_amend: "Legal Requested Amendments",
  published: "Content Published",
  new_comment: "New Comment",
  reverification_required: "⚠️ Re-verification Required",
  calendar_legal_date_set: "⚖️ Legal Review Scheduled",
  calendar_24h: "⏰ 24h Reminder",
  calendar_5h: "🚨 5h Urgent Reminder",
};

export default function NotificationBell() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);

  const userId = user?.id ?? null;
  const companyId = (profile as any)?.company_id ?? null;

  const perms = getPermissions({ profileRole: profile?.role, customPermissions: (profile as any)?.customPermissions });

  const { items, loading, unreadCount, markRead, markAllRead } =
    useNotifications({ userId, companyId });

  const topItems = useMemo(() => items.slice(0, 12), [items]);

  if (!user) return null;

  const openNotification = async (n: any) => {
    // Decide destination page based on permissions
    const targetPage: PageId = perms.canViewLegalReview ? "legal-review" : "archive";

    // Persist doc id so destination page can auto-open it
    if (n?.content_id) {
      localStorage.setItem("cc_open_content_id", n.content_id);
    }

    // Navigate first (don’t let markRead failures block UX)
    window.dispatchEvent(new CustomEvent("navigate", { detail: { page: targetPage } }));

    // Ask destination page to open the doc
    if (n?.content_id) {
      window.dispatchEvent(new CustomEvent("open-document", { detail: { id: n.content_id } }));
    }

    // Mark read (best-effort)
    try {
      await markRead(n.id);
    } catch (e) {
      logger.error("markRead failed:", e);
    }

    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:dash-surface-alt transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 dash-text-secondary" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-danger)] text-white text-[11px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="!absolute !right-0 top-full mt-2 w-96 max-w-[90vw] dash-card border dash-border rounded-xl shadow-lg !z-[60]">
            <div className="flex items-center justify-between px-4 py-3 border-b dash-border">
              <div>
                <p className="text-sm font-semibold dash-text">Notifications</p>
                <p className="text-xs dash-text-secondary">Updates from your compliance workflow</p>
              </div>

              <button
                onClick={markAllRead}
                className="text-xs font-medium text-[var(--color-behance-blue)] hover:underline flex items-center gap-1"
              >
                <CheckCheck className="w-4 h-4" />
                Mark all read
              </button>
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {loading ? (
                <div className="p-6 flex items-center justify-center dash-text-secondary text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading…
                </div>
              ) : topItems.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm dash-text-secondary">No notifications yet</p>
                  <p className="text-xs dash-text-tertiary mt-1">
                    Legal / marketing actions will show up here.
                  </p>
                </div>
              ) : (
                <div className="divide-y dash-divide">
                  {topItems.map((n) => {
                    const unread = !n.read_at;
                    const niceType = n.type ? TYPE_LABEL[n.type] ?? n.type : null;
                    const isWatchdog = n.type === 'reverification_required';

                    return (
                      <button
                        key={n.id}
                        onClick={() => openNotification(n)}
                        className={`w-full text-left px-4 py-3 hover:dash-surface-alt transition-colors ${isWatchdog && unread
                          ? "bg-[var(--color-warning-soft)]"
                          : unread
                            ? "bg-[var(--color-info-soft)]"
                            : "dash-card"
                          }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          {/* Watchdog icon */}
                          {isWatchdog && (
                            <div className="mt-0.5 p-1 rounded-md bg-amber-100 shrink-0">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-sm ${isWatchdog && unread
                                ? "font-semibold text-amber-900"
                                : unread
                                  ? "font-semibold dash-text"
                                  : "dash-text"
                                }`}
                            >
                              {n.message || "Notification"}
                            </p>
                            <p className="text-xs dash-text-secondary mt-1">
                              {timeAgo(n.created_at)}
                              {niceType ? ` • ${niceType}` : ""}
                            </p>
                          </div>

                          {unread && (
                            <span
                              className={`mt-1 w-2 h-2 rounded-full ${isWatchdog ? "bg-amber-500" : "bg-[var(--color-behance-blue)]"
                                }`}
                            />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-4 py-2 border-t dash-border dash-surface-alt flex items-center justify-between gap-2">
              <p className="text-[11px] dash-text-secondary">
                Tip: approvals, amendments, rejections, and comments notify the right team.
              </p>
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'notifications' } }));
                  setOpen(false);
                }}
                className="text-[11px] font-semibold text-[var(--color-accent)] hover:underline whitespace-nowrap"
              >
                View all
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

