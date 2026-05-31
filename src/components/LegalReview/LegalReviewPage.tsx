// src/components/LegalReview/LegalReviewPage.tsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Scale, FileText, Clock, User, AlertCircle, CheckCircle, Edit3, Eye, Search, BarChart3, CalendarClock, PartyPopper } from 'lucide-react';
import { SkeletonLine, SkeletonCard } from '../Dashboard/ui/Skeleton';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Database } from '../../lib/database.types';
import SignoffBadge from '../Archive/SignoffBadge';
import LegalReviewDetailPanel, { type LegalReviewItem } from './LegalReviewDetailPanel.tsx';
import { applyLegalDecision, markContentInReview } from '../../lib/legalActions';
import {
  getLegalEventForSubmission,
  acknowledgeForLegal,
  updateMarketingCalendarWithLegalDate,
} from '../../lib/calendarService';

// Expanded analytics (same data + widgets as dashboard, but full-size)
import LegalSlaWidget from '../Dashboard/widgets/LegalSlaWidget';
import ReviewerWorkloadWidget from '../Dashboard/widgets/ReviewerWorkloadWidget';
import TopRiskCausesWidget from '../Dashboard/widgets/TopRiskCausesWidget';
import HistoricalDecisionsWidget from '../Dashboard/widgets/HistoricalDecisionsWidget';
import RiskDistributionWidget from '../Dashboard/widgets/RiskDistributionWidget';
import { logger } from '../../lib/logger';
import { sendUserNotification } from '../../lib/emailNotify';

type ContentSubmission = Database['public']['Tables']['content_submissions']['Row'];
type ComplianceReport = Database['public']['Tables']['compliance_reports']['Row'];
type LegalReview = Database['public']['Tables']['legal_reviews']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

interface ReviewItem extends LegalReviewItem { }

const OPEN_KEY = 'cc_open_content_id';

export default function LegalReviewPage() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [view, setView] = useState<'workspace' | 'analytics'>('workspace');
  const [query, setQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  // Compulsory review-date prompt
  const [schedulePromptItem, setSchedulePromptItem] = useState<ReviewItem | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const companyId = (profile as any)?.company_id as string | undefined;

  const getQueueStatuses = useCallback(() => {
    if (filter === 'pending') return ['awaiting_legal', 'in_review'] as const;
    return ['awaiting_legal', 'in_review', 'amend_requested', 'rejected', 'signed_off'] as const;
  }, [filter]);

  const tryOpenFromStorageOrEvent = useCallback((list: ReviewItem[], contentId?: string | null) => {
    const id = contentId ?? localStorage.getItem(OPEN_KEY);
    if (!id) return false;

    const found = list.find((x) => x.submission.id === id);
    if (found) {
      // Route through handleItemClick so the compulsory schedule prompt triggers
      // for awaiting_legal items (from notifications or localStorage)
      if (found.submission.signoff_status === 'awaiting_legal') {
        setSchedulePromptItem(found);
      } else {
        setSelectedItem(found);
      }
      localStorage.removeItem(OPEN_KEY);
      return true;
    }
    return false;
  }, []);

  const loadReviewQueue = useCallback(async () => {
    if (!user) return;

    if (!companyId) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const statuses = getQueueStatuses();

    const { data: submissions, error: subError } = await supabase
      .from('content_submissions')
      .select('*')
      .eq('company_id', companyId)
      .in('signoff_status', statuses as unknown as string[])
      .order('updated_at', { ascending: false });

    if (subError) {
      logger.error('Failed to load submissions:', subError);
      setItems([]);
      setLoading(false);
      return;
    }

    const subs = submissions || [];
    if (subs.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const contentIds = subs.map((s) => s.id);
    const userIds = [...new Set(subs.map((s) => s.user_id))];

    const [{ data: profiles, error: profError }, { data: reportData, error: repError }, { data: reviews, error: revError }] =
      await Promise.all([
        supabase.from('profiles').select('*').eq('company_id', companyId).in('id', userIds),
        supabase.from('compliance_reports').select('*').in('content_id', contentIds),
        supabase.from('legal_reviews').select('*').in('content_id', contentIds).order('created_at', { ascending: false }),
      ]);

    if (profError) logger.error('Failed to load profiles:', profError);
    if (repError) logger.error('Failed to load reports:', repError);
    if (revError) logger.error('Failed to load legal reviews:', revError);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    const reportMap = new Map((reportData || []).map((r) => [r.content_id, r]));

    const latestReviewMap = new Map<string, LegalReview>();
    const allReviewsMap = new Map<string, LegalReview[]>();
    (reviews || []).forEach((r) => {
      if (!latestReviewMap.has(r.content_id)) latestReviewMap.set(r.content_id, r);
      if (!allReviewsMap.has(r.content_id)) allReviewsMap.set(r.content_id, []);
      allReviewsMap.get(r.content_id)!.push(r);
    });

    const reviewItems: ReviewItem[] = subs.map((submission) => ({
      submission,
      report: reportMap.get(submission.id) || null,
      latestReview: latestReviewMap.get(submission.id) || null,
      allReviews: allReviewsMap.get(submission.id) || [],
      submitter: profileMap.get(submission.user_id) || null,
    }));

    setItems(reviewItems);
    setLoading(false);

    tryOpenFromStorageOrEvent(reviewItems);
  }, [user, companyId, getQueueStatuses, tryOpenFromStorageOrEvent]);

  // Auto-select first queue item (gives Legal page a "full" feel immediately)
  useEffect(() => {
    if (view !== 'workspace') return;
    if (selectedItem) return;
    if (items.length === 0) return;
    setSelectedItem(items[0]);
  }, [items, selectedItem, view]);

  useEffect(() => {
    loadReviewQueue();
  }, [loadReviewQueue]);

  useEffect(() => {
    const handler = (e: any) => {
      const id = e?.detail?.id as string | undefined;
      if (!id) return;

      const opened = tryOpenFromStorageOrEvent(items, id);
      if (!opened) {
        localStorage.setItem(OPEN_KEY, id);
        loadReviewQueue();
      }
    };

    window.addEventListener('open-document', handler as any);
    return () => window.removeEventListener('open-document', handler as any);
  }, [items, loadReviewQueue, tryOpenFromStorageOrEvent]);

  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`legal-review-queue:${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'content_submissions', filter: `company_id=eq.${companyId}` },
        () => loadReviewQueue()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'legal_reviews' }, () => loadReviewQueue())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, loadReviewQueue]);

  // ✅ Mark "in_review" via shared legal workflow
  const markInReviewIfNeeded = useCallback(
    async (item: ReviewItem) => {
      if (!user || !companyId) return;
      if (item.submission.signoff_status !== 'awaiting_legal') return;

      await markContentInReview(item.submission.id, companyId, user.id);
    },
    [user, companyId]
  );

  // ✅ Handle compulsory review-date selection
  const handleScheduleReview = useCallback(async (mode: 'now' | 'later') => {
    if (!schedulePromptItem || !user || !companyId) return;
    setScheduleSaving(true);
    try {
      const subId = schedulePromptItem.submission.id;

      // Build the planned-at timestamp
      let plannedAt: string;
      if (mode === 'now') {
        plannedAt = new Date().toISOString();
      } else {
        if (!scheduleDate) { alert('Please select a date.'); setScheduleSaving(false); return; }
        const timePart = scheduleTime || '09:00';
        plannedAt = new Date(`${scheduleDate}T${timePart}`).toISOString();
      }

      // Get the legal calendar event and acknowledge it
      const legalEvt = await getLegalEventForSubmission(companyId, subId);
      if (legalEvt) {
        await acknowledgeForLegal(legalEvt.id, mode === 'now' ? 'now' : plannedAt, companyId);
      }

      // Update marketing calendar with legal's planned date
      await updateMarketingCalendarWithLegalDate(companyId, subId, plannedAt);

      // Mark as in-review and proceed to open the item
      await markInReviewIfNeeded(schedulePromptItem);
      setSelectedItem(schedulePromptItem);
      setSchedulePromptItem(null);
      setScheduleDate('');
      setScheduleTime('');
      await loadReviewQueue();
    } catch (err: any) {
      logger.error('Schedule review failed:', err);
      alert(err?.message || 'Failed to schedule review.');
    } finally {
      setScheduleSaving(false);
    }
  }, [schedulePromptItem, user, companyId, scheduleDate, scheduleTime, markInReviewIfNeeded, loadReviewQueue]);

  // ✅ Intercept item click — show schedule prompt for awaiting_legal
  const handleItemClick = useCallback(async (item: ReviewItem) => {
    if (item.submission.signoff_status === 'awaiting_legal') {
      // Check if legal has already acknowledged (picked a date) — if so skip prompt
      try {
        const legalEvt = companyId ? await getLegalEventForSubmission(companyId, item.submission.id) : null;
        if (legalEvt && legalEvt.legal_acknowledged) {
          // Already scheduled — go straight to review
          const optimistic: ReviewItem = {
            ...item,
            submission: { ...item.submission, signoff_status: 'in_review' as any },
          };
          setSelectedItem(optimistic);
          await markInReviewIfNeeded(item);
          await loadReviewQueue();
          return;
        }
      } catch { /* proceed to show prompt */ }

      // Show compulsory schedule prompt
      setSchedulePromptItem(item);
      return;
    }

    // Non-awaiting items — open directly
    setSelectedItem(item);
  }, [companyId, markInReviewIfNeeded, loadReviewQueue]);

  const toast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    window.dispatchEvent(new CustomEvent('global-toast', { detail: { message, type } }));
  };

  const handleApprove = async (contentId: string, comments: string) => {
    if (!user) return;
    if (!companyId) throw new Error('Missing companyId in session.');
    await applyLegalDecision({
      contentId,
      companyId,
      userId: user.id,
      action: 'approve',
      comments,
    });
    // Notify submitter by email + in-app
    const submitterUserId = selectedItem?.submission.user_id;
    if (submitterUserId) {
      sendUserNotification({
        recipient_id: submitterUserId,
        type: 'content_approved',
        content_id: contentId,
        content_title: selectedItem?.submission.title ?? undefined,
        actor_name: profile?.full_name ?? undefined,
        note: comments || undefined,
      });
    }
    toast('Content approved and signed off. Marketing has been notified.', 'success');
    setSelectedItem(null);
    await loadReviewQueue();
  };

  const handleAmend = async (contentId: string, comments: string) => {
    if (!user) return;
    if (!companyId) throw new Error('Missing companyId in session.');
    await applyLegalDecision({
      contentId,
      companyId,
      userId: user.id,
      action: 'request_changes',
      comments,
    });
    // Notify submitter by email + in-app
    const submitterUserId = selectedItem?.submission.user_id;
    if (submitterUserId) {
      sendUserNotification({
        recipient_id: submitterUserId,
        type: 'changes_requested',
        content_id: contentId,
        content_title: selectedItem?.submission.title ?? undefined,
        actor_name: profile?.full_name ?? undefined,
        note: comments || undefined,
      });
    }
    toast('Amend requested. Submitter has been notified to revise.', 'info');
    setSelectedItem(null);
    await loadReviewQueue();
  };

  const handleReject = async (contentId: string, comments: string) => {
    if (!user) return;
    if (!companyId) throw new Error('Missing companyId in session.');
    await applyLegalDecision({
      contentId,
      companyId,
      userId: user.id,
      action: 'reject',
      comments,
    });
    // Notify submitter by email + in-app
    const submitterUserId = selectedItem?.submission.user_id;
    if (submitterUserId) {
      sendUserNotification({
        recipient_id: submitterUserId,
        type: 'content_rejected',
        content_id: contentId,
        content_title: selectedItem?.submission.title ?? undefined,
        actor_name: profile?.full_name ?? undefined,
        note: comments || undefined,
      });
    }
    toast('Content rejected. Submitter has been notified.', 'error');
    setSelectedItem(null);
    await loadReviewQueue();
  };

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((it) => {
        if (riskFilter === 'all') return true;
        return (it.report?.overall_risk || '').toLowerCase() === riskFilter;
      })
      .filter((it) => {
        if (!q) return true;
        const title = (it.submission.title || '').toLowerCase();
        const platform = (it.submission.platform || '').toLowerCase();
        const submitter = (it.submitter?.full_name || it.submitter?.email || '').toLowerCase();
        return title.includes(q) || platform.includes(q) || submitter.includes(q);
      });
  }, [items, query, riskFilter]);

  const stats = useMemo(() => {
    const pending = items.filter((i) => i.submission.signoff_status === 'awaiting_legal' || i.submission.signoff_status === 'in_review');
    const high = items.filter((i) => (i.report?.overall_risk || '').toLowerCase() === 'high');
    const amend = items.filter((i) => i.submission.signoff_status === 'amend_requested');
    return {
      total: items.length,
      pending: pending.length,
      high: high.length,
      amend: amend.length,
    };
  }, [items]);

  const getCardIcon = (signoff: string) => {
    if (signoff === 'awaiting_legal') return <Clock className="w-5 h-5 text-behance-amber-600" />;
    if (signoff === 'in_review') return <Eye className="w-5 h-5 text-[var(--color-info)]" />;
    if (signoff === 'amend_requested') return <Edit3 className="w-5 h-5 text-[var(--color-warning)]" />;
    if (signoff === 'signed_off') return <CheckCircle className="w-5 h-5 text-[var(--color-success)]" />;
    if (signoff === 'rejected') return <AlertCircle className="w-5 h-5 text-[var(--color-danger)]" />;
    return <Clock className="w-5 h-5 dash-text-secondary" />;
  };

  const getCardBg = (signoff: string) => {
    if (signoff === 'awaiting_legal') return 'bg-behance-amber-50';
    if (signoff === 'in_review') return 'bg-[var(--color-info-soft)]';
    if (signoff === 'amend_requested') return 'bg-[var(--color-warning-soft)]';
    if (signoff === 'signed_off') return 'bg-[var(--color-success-soft)]';
    if (signoff === 'rejected') return 'bg-[var(--color-danger-soft)]';
    return 'dash-surface-alt';
  };

  if (loading) {
    return (
      <div className="space-y-5">
        {/* Header skeleton */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <SkeletonLine className="h-7 w-40" />
            <SkeletonLine className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <SkeletonLine className="h-9 w-28 rounded-lg" />
            <SkeletonLine className="h-9 w-28 rounded-lg" />
          </div>
        </div>
        {/* KPI chips skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="dash-card rounded-xl border dash-border/60 p-4 space-y-2">
              <SkeletonLine className="h-3 w-3/4" />
              <SkeletonLine className="h-7 w-1/3" />
            </div>
          ))}
        </div>
        {/* Queue + panel skeleton */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="dash-card rounded-2xl border dash-border/60 overflow-hidden">
            <div className="p-4 border-b dash-border space-y-3">
              <SkeletonLine className="h-9 rounded-xl" />
              <SkeletonLine className="h-7 w-48 rounded-lg" />
            </div>
            <div className="divide-y dash-divide">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="px-4 py-4 flex items-start gap-3">
                  <SkeletonCard className="w-10 h-10 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <SkeletonLine className="h-4 w-3/4" />
                    <SkeletonLine className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="xl:col-span-2">
            <SkeletonCard className="h-96 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="dash-card rounded-xl border dash-border/60 shadow-sm text-center py-16">
        <Scale className="w-10 h-10 dash-text-tertiary mx-auto mb-3" />
        <p className="text-sm dash-text font-medium">Company not set</p>
        <p className="text-xs dash-text-secondary mt-1">
          Your account has no company linked yet. Please complete onboarding or re-login.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold dash-text">Legal Review</h2>
            <p className="text-sm dash-text-secondary mt-1">Full review workspace: queue + evidence + audit trail + analytics</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center dash-surface-alt rounded-lg p-0.5">
              <button
                onClick={() => setView('workspace')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'workspace' ? 'dash-card shadow-sm text-[var(--color-behance-blue)]' : 'dash-text-secondary hover:dash-text'
                  }`}
              >
                Workspace
              </button>
              <button
                onClick={() => setView('analytics')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'analytics' ? 'dash-card shadow-sm text-[var(--color-behance-blue)]' : 'dash-text-secondary hover:dash-text'
                  }`}
              >
                Analytics
              </button>
            </div>

            <div className="flex items-center dash-surface-alt rounded-lg p-0.5">
              <button
                onClick={() => setFilter('pending')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === 'pending' ? 'dash-card shadow-sm text-[var(--color-behance-blue)]' : 'dash-text-secondary hover:dash-text'
                  }`}
              >
                Pending
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === 'all' ? 'dash-card shadow-sm text-[var(--color-behance-blue)]' : 'dash-text-secondary hover:dash-text'
                  }`}
              >
                All Items
              </button>
            </div>
          </div>
        </div>

        {/* KPI chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="dash-card rounded-xl border dash-border/60 shadow-sm p-4">
            <p className="text-[11px] dash-text-secondary">Total in view</p>
            <p className="text-xl font-bold dash-text mt-1">{stats.total}</p>
          </div>
          <div className="dash-card rounded-xl border dash-border/60 shadow-sm p-4">
            <p className="text-[11px] dash-text-secondary">Pending decisions</p>
            <p className="text-xl font-bold dash-text mt-1">{stats.pending}</p>
          </div>
          <div className="dash-card rounded-xl border dash-border/60 shadow-sm p-4">
            <p className="text-[11px] dash-text-secondary">High risk items</p>
            <p className="text-xl font-bold dash-text mt-1">{stats.high}</p>
          </div>
          <div className="dash-card rounded-xl border dash-border/60 shadow-sm p-4">
            <p className="text-[11px] dash-text-secondary">Changes requested</p>
            <p className="text-xl font-bold dash-text mt-1">{stats.amend}</p>
          </div>
        </div>

        {/* Workspace */}
        {view === 'workspace' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/* Queue */}
            <div className="dash-card rounded-2xl border dash-border/60 shadow-sm overflow-hidden">
              <div className="p-4 border-b dash-border space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 flex-1 dash-surface-alt border dash-border rounded-xl px-3 py-2">
                    <Search className="w-4 h-4 dash-text-tertiary" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search title, platform, submitter…"
                      className="bg-transparent outline-none text-sm w-full"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] dash-text-secondary">Risk:</span>
                  {(['all', 'high', 'medium', 'low'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRiskFilter(r)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${riskFilter === r
                        ? 'bg-[var(--color-behance-blue)] text-white border-[var(--color-behance-blue)]'
                        : 'dash-card dash-text-secondary dash-border hover:dash-surface-alt'
                        }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="max-h-[70vh] overflow-y-auto divide-y dash-divide">
                {filteredItems.length === 0 ? (
                  (query || riskFilter !== 'all') ? (
                    <div className="text-center py-14 px-4">
                      <Scale className="w-10 h-10 dash-text-tertiary mx-auto mb-3" />
                      <p className="text-sm dash-text-secondary">No documents match your filters</p>
                      <p className="text-xs dash-text-tertiary mt-1">Try changing risk or search terms</p>
                    </div>
                  ) : filter === 'pending' ? (
                    <div className="text-center py-14 px-4">
                      <div className="w-12 h-12 rounded-full bg-[var(--color-success-soft)] flex items-center justify-center mx-auto mb-3">
                        <PartyPopper className="w-6 h-6 text-[var(--color-success)]" />
                      </div>
                      <p className="text-sm font-semibold dash-text">Queue is clear!</p>
                      <p className="text-xs dash-text-secondary mt-1">No documents are awaiting legal review right now.</p>
                    </div>
                  ) : (
                    <div className="text-center py-14 px-4">
                      <Scale className="w-10 h-10 dash-text-tertiary mx-auto mb-3" />
                      <p className="text-sm dash-text-secondary">No review items yet</p>
                      <p className="text-xs dash-text-tertiary mt-1">Items will appear once content is submitted for review.</p>
                    </div>
                  )
                ) : (
                  filteredItems.map((item) => {
                    const active = selectedItem?.submission.id === item.submission.id;
                    return (
                      <button
                        key={item.submission.id}
                        onClick={async () => {
                          try {
                            await handleItemClick(item);
                          } catch (e: any) {
                            alert(e?.message ?? 'Failed to open item.');
                            logger.error(e);
                            setSelectedItem(item);
                          }
                        }}
                        className={`w-full text-left px-4 py-4 hover:dash-surface-alt transition-colors ${active ? 'bg-[var(--color-info-soft)]/50' : 'dash-card'
                          }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg shrink-0 ${getCardBg(item.submission.signoff_status || '')}`}>
                            {getCardIcon(item.submission.signoff_status || '')}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold dash-text truncate">{item.submission.title}</p>
                              <SignoffBadge status={item.submission.signoff_status || ''} />
                            </div>
                            <div className="flex items-center gap-3 text-xs dash-text-secondary mt-1">
                              <span className="flex items-center gap-1"><User className="w-3 h-3" />{item.submitter?.full_name || 'Unknown'}</span>
                              <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{item.submission.platform}</span>
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(item.submission.updated_at || item.submission.created_at || '').toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              {item.report?.overall_risk ? (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${item.report.overall_risk === 'low'
                                    ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
                                    : item.report.overall_risk === 'medium'
                                      ? 'bg-behance-amber-50 text-behance-amber-700'
                                      : item.report.overall_risk === 'high'
                                        ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'
                                        : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                                    }`}
                                >
                                  {item.report.overall_risk} risk
                                </span>
                              ) : null}
                              {item.latestReview?.comments ? (
                                <span className="text-[11px] dash-text-secondary truncate">{item.latestReview.comments}</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Detail */}
            <div className="xl:col-span-2">
              {selectedItem ? (
                <LegalReviewDetailPanel
                  item={selectedItem}
                  companyId={companyId}
                  currentUserId={user?.id || ''}
                  canAssignReviewers={profile?.role === 'admin' || profile?.role === 'compliance_officer'}
                  onApprove={handleApprove}
                  onAmend={handleAmend}
                  onReject={handleReject}
                />
              ) : (
                <div className="dash-card rounded-2xl border dash-border/60 shadow-sm p-10 text-center">
                  <Scale className="w-10 h-10 dash-text-tertiary mx-auto mb-3" />
                  <p className="text-sm dash-text-secondary font-medium">Select an item to review</p>
                  <p className="text-xs dash-text-secondary mt-1">Choose a document from the left to open the full review workspace.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Analytics */}
        {view === 'analytics' && (
          <div className="space-y-5">
            <div className="dash-card rounded-2xl border dash-border/60 shadow-sm p-5">
              <div className="flex items-center gap-2 dash-text font-semibold">
                <BarChart3 className="w-5 h-5 text-[var(--color-behance-blue)]" />
                Legal analytics (live)
              </div>
              <p className="text-sm dash-text-secondary mt-1">
                These charts match the Legal dashboard, but are expanded here for deeper investigation.
              </p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              <div className="xl:col-span-2">
                <LegalSlaWidget companyId={companyId} />
              </div>
              <ReviewerWorkloadWidget companyId={companyId} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <RiskDistributionWidget companyId={companyId} jurisdiction={null} />
              <TopRiskCausesWidget companyId={companyId} jurisdiction={null} />
            </div>

            {user?.id && (
              <HistoricalDecisionsWidget companyId={companyId} reviewerId={user.id} />
            )}
          </div>
        )}
      </div>

      {/* ── Compulsory review-date prompt modal ─────────────── */}
      {
        schedulePromptItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="dash-card rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-[var(--color-behance-blue)] to-[#0066cc] px-6 py-5 text-white">
                <div className="flex items-center gap-3">
                  <CalendarClock className="w-6 h-6" />
                  <div>
                    <h3 className="font-bold text-lg">Schedule Your Review</h3>
                    <p className="text-sm text-white/80 mt-0.5">
                      When will you attend to this request?
                    </p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                <div className="bg-[var(--color-info-soft)] border border-[var(--color-info)]/20 rounded-xl p-3">
                  <p className="text-sm font-semibold dash-text truncate">
                    {schedulePromptItem.submission.title}
                  </p>
                  <p className="text-xs dash-text-secondary mt-1">
                    Submitted by {schedulePromptItem.submitter?.full_name || 'Unknown'}
                  </p>
                </div>

                {/* Review Now button */}
                <button
                  disabled={scheduleSaving}
                  onClick={() => handleScheduleReview('now')}
                  className="w-full py-3 rounded-xl font-semibold text-white bg-[var(--color-success)] hover:bg-[var(--color-success)] transition-colors disabled:opacity-50"
                >
                  {scheduleSaving ? 'Saving…' : '⚡ Review Now'}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[var(--color-surface-alt)]" />
                  <span className="text-xs dash-text-tertiary font-medium">OR SCHEDULE FOR LATER</span>
                  <div className="flex-1 h-px bg-[var(--color-surface-alt)]" />
                </div>

                {/* Date + Time inputs */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs dash-text-secondary font-medium block mb-1">Date</label>
                    <input
                      type="date"
                      value={scheduleDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="w-full border dash-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs dash-text-secondary font-medium block mb-1">Time</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-full border dash-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)] outline-none"
                    />
                  </div>
                </div>

                <button
                  disabled={scheduleSaving || !scheduleDate}
                  onClick={() => handleScheduleReview('later')}
                  className="w-full py-3 rounded-xl font-semibold text-white bg-[var(--color-behance-blue)] hover:bg-[#003a7a] transition-colors disabled:opacity-50"
                >
                  {scheduleSaving ? 'Saving…' : '📅 Schedule Review'}
                </button>

                {/* Cancel */}
                <button
                  disabled={scheduleSaving}
                  onClick={() => { setSchedulePromptItem(null); setScheduleDate(''); setScheduleTime(''); }}
                  className="w-full py-2 text-sm dash-text-secondary hover:dash-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )
      }
    </>
  );
}

