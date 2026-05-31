// src/components/Dashboard/widgets/LegalQueueWidget.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Scale } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { applyLegalDecision, markContentInReview } from "../../../lib/legalActions";
import DashboardCard from "../ui/DashboardCard";
import QueueTimer from "../ui/QueueTimer";
import { SkeletonTable } from "../ui/Skeleton";
import { EmptyState, ErrorState } from "../ui/EmptyState";
import { logger } from '../../../lib/logger';

type LegalQueueRow = {
  content_id: string;
  title: string;
  department: string | null;
  platform: string;
  priority: string;
  jurisdiction: string;
  signoff_status: string;
  submitted_for_legal_at: string | null;
  time_in_queue_hours: number | null;
  risk: string | null;
};


function canMarkInReview(status: string) {
  return status === "awaiting_legal";
}

function canApprove(status: string) {
  return status === "awaiting_legal" || status === "in_review";
}

function canRequestChanges(status: string) {
  return status === "awaiting_legal" || status === "in_review";
}

const selectClass =
  "dash-surface dash-text text-xs border dash-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 transition-colors";

export default function LegalQueueWidget({
  companyId,
  jurisdiction,
  limit,
}: {
  companyId: string;
  jurisdiction?: string | null;
  limit?: number;
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LegalQueueRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [commentModalRow, setCommentModalRow] = useState<LegalQueueRow | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  // Replaced statusFilter with currentView
  const [currentView, setCurrentView] = useState("all");

  const views = [
    { id: "all", label: "All Queue" },
    { id: "awaiting_legal", label: "Awaiting" },
    { id: "in_review", label: "In Review" },
  ];

  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("all");

  const loadQueue = async () => {
    if (!companyId) {
      setRows([]);
      setErrorMsg(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const statuses =
      currentView === "all" ? ["awaiting_legal", "in_review"] : [currentView];

    const { data, error } = await (supabase as any).rpc("get_legal_queue", {
      p_company_id: companyId,
      p_statuses: statuses,
      p_priority: priorityFilter === "all" ? null : priorityFilter,
      p_department: departmentFilter === "all" ? null : departmentFilter,
      p_platform: platformFilter === "all" ? null : platformFilter,
      p_jurisdiction:
        jurisdictionFilter === "all" ? jurisdiction ?? null : jurisdictionFilter,
    } as any);

    if (error) {
      logger.error("get_legal_queue failed:", error);
      setRows([]);
      setErrorMsg(error.message || "Failed to load legal queue.");
      setLoading(false);
      return;
    }

    const rowsData = (data ?? []) as LegalQueueRow[];
    setRows(limit ? rowsData.slice(0, limit) : rowsData);
    setLoading(false);
  };

  useEffect(() => {
    loadQueue();
  }, [
    companyId,
    jurisdiction,
    currentView,
    priorityFilter,
    departmentFilter,
    platformFilter,
    jurisdictionFilter,
    limit,
  ]);

  const quickAction = async (
    row: LegalQueueRow,
    action: "open" | "in_review" | "approve" | "changes"
  ) => {
    try {
      setBusyId(row.content_id);

      if (action === "open") {
        localStorage.setItem("cc_open_content_id", row.content_id);
        window.dispatchEvent(
          new CustomEvent("open-document", { detail: { id: row.content_id } })
        );
        window.dispatchEvent(
          new CustomEvent("navigate", { detail: { page: "legal-review" } })
        );
        window.dispatchEvent(
          new CustomEvent("navigate-to", { detail: { page: "legal-review" } })
        );
        return;
      }

      if (action === "in_review") {
        if (!user) throw new Error("You must be signed in.");
        await markContentInReview(row.content_id, companyId, user.id);
      }

      if (action === "approve") {
        if (!user) throw new Error("You must be signed in.");
        await applyLegalDecision({
          contentId: row.content_id,
          companyId,
          userId: user.id,
          action: "approve",
          comments: "Approved from dashboard queue quick action.",
        });
      }

      if (action === "changes") {
        setCommentModalRow(row);
        setCommentText("");
        setBusyId(null);
        return;
      }

      await loadQueue();
    } catch (e: any) {
      logger.error(`Legal action ${action} failed`, e);
      alert(e?.message ?? "Quick action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const departmentOptions = useMemo(() => {
    return (
      Array.from(new Set(rows.map((r) => r.department).filter(Boolean))) as string[]
    ).sort();
  }, [rows]);

  const platformOptions = useMemo(() => {
    return (
      Array.from(new Set(rows.map((r) => r.platform).filter(Boolean))) as string[]
    ).sort();
  }, [rows]);

  const jurisdictionOptions = useMemo(() => {
    return (
      Array.from(new Set(rows.map((r) => r.jurisdiction).filter(Boolean))) as string[]
    ).sort();
  }, [rows]);

  const btnBase =
    "px-2 py-1 rounded-md text-[11px] font-medium transition-colors disabled:opacity-40";

  return (
    <DashboardCard
      className="h-full flex flex-col min-h-0"
      views={views}
      currentView={currentView}
      onViewChange={setCurrentView}
    >
      <div className="flex items-center gap-2 shrink-0">
        <div
          className="p-1.5 rounded-lg"
          style={{ background: "var(--color-accent-soft)" }}
        >
          <Scale className="w-4 h-4 dash-accent" />
        </div>
        <div>
          <h3 className="text-sm font-semibold dash-text">Legal Queue</h3>
          <p className="text-xs dash-text-secondary mt-0.5">
            Awaiting legal and in-review items
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className={selectClass}
        >
          <option value="all">Priority</option>
          <option value="urgent">Urgent</option>
          <option value="scheduled">Scheduled</option>
          <option value="low">Low</option>
        </select>

        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className={selectClass}
        >
          <option value="all">Department</option>
          {departmentOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className={selectClass}
        >
          <option value="all">Platform</option>
          {platformOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          value={jurisdictionFilter}
          onChange={(e) => setJurisdictionFilter(e.target.value)}
          className={selectClass}
        >
          <option value="all">Jurisdiction</option>
          {jurisdictionOptions.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="mt-4 flex-1 flex flex-col min-h-0">
        {loading ? (
          <SkeletonTable rows={5} cols={7} />
        ) : errorMsg ? (
          <ErrorState message={errorMsg} />
        ) : rows.length === 0 ? (
          <EmptyState message="No legal queue items." />
        ) : (
          <div className="flex-1 overflow-y-auto overflow-x-auto border dash-border rounded-lg min-h-0">
            <table className="w-full text-xs min-w-[980px]">
              <thead>
                <tr className="dash-surface-alt">
                  <th className="text-left px-3 py-2.5 dash-text-secondary font-semibold text-[11px] uppercase tracking-wider">Title</th>
                  <th className="text-left px-3 py-2.5 dash-text-secondary font-semibold text-[11px] uppercase tracking-wider">Department</th>
                  <th className="text-left px-3 py-2.5 dash-text-secondary font-semibold text-[11px] uppercase tracking-wider">Platform</th>
                  <th className="text-left px-3 py-2.5 dash-text-secondary font-semibold text-[11px] uppercase tracking-wider">Priority</th>
                  <th className="text-left px-3 py-2.5 dash-text-secondary font-semibold text-[11px] uppercase tracking-wider">Risk</th>
                  <th className="text-left px-3 py-2.5 dash-text-secondary font-semibold text-[11px] uppercase tracking-wider">Status</th>
                  <th className="text-right px-3 py-2.5 dash-text-secondary font-semibold text-[11px] uppercase tracking-wider">Queue Time</th>
                  <th className="text-right px-3 py-2.5 dash-text-secondary font-semibold text-[11px] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const isBusy = busyId === r.content_id;
                  const disableInReview = isBusy || !canMarkInReview(r.signoff_status);
                  const disableApprove = isBusy || !canApprove(r.signoff_status);
                  const disableChanges = isBusy || !canRequestChanges(r.signoff_status);

                  return (
                    <tr
                      key={`${r.content_id}-${idx}`}
                      className="border-t dash-border transition-colors hover:dash-surface-alt"
                    >
                      <td className="px-3 py-2.5 dash-text max-w-[260px] truncate font-medium" title={r.title}>
                        {r.title}
                      </td>
                      <td className="px-3 py-2.5 dash-text-secondary max-w-[120px] truncate" title={r.department || ""}>{r.department || "—"}</td>
                      <td className="px-3 py-2.5 dash-text-secondary max-w-[120px] truncate" title={r.platform}>{r.platform}</td>
                      <td className="px-3 py-2.5 dash-text-secondary max-w-[100px] truncate" title={r.priority}>{r.priority}</td>
                      <td className="px-3 py-2.5">
                        {r.risk ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${r.risk === "critical"
                              ? "bg-behance-pink/20 text-behance-pink border border-behance-pink/30"
                              : r.risk === "high"
                                ? "bg-[var(--color-warning)]/20 text-[var(--color-warning)] border border-orange-500/30"
                                : r.risk === "medium"
                                  ? "bg-[var(--color-warning)]/20 text-[var(--color-warning)] border border-amber-500/30"
                                  : "bg-behance-green/20 text-behance-green border border-behance-green/30"
                              }`}
                          >
                            {r.risk}
                          </span>
                        ) : (
                          <span className="dash-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold dash-surface-alt dash-text-secondary">
                          {r.signoff_status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right flex justify-end">
                        <QueueTimer submittedAt={r.submitted_for_legal_at} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end flex-wrap gap-1">
                          <button
                            disabled={isBusy}
                            onClick={() => quickAction(r, "open")}
                            className={`${btnBase} bg-[var(--color-surface-alt)] hover:bg-[var(--color-border)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:border-[var(--color-text-tertiary)] hover:-translate-y-0.5`}
                          >
                            Open
                          </button>
                          <button
                            disabled={disableInReview}
                            onClick={() => quickAction(r, "in_review")}
                            className={`${btnBase} bg-behance-blue/10 hover:bg-behance-blue/20 text-[var(--color-info)] border border-behance-blue/20 hover:border-behance-blue/50 hover:-translate-y-0.5`}
                          >
                            Review
                          </button>
                          <button
                            disabled={disableApprove}
                            onClick={() => quickAction(r, "approve")}
                            className={`${btnBase} bg-behance-green/10 hover:bg-behance-green/20 text-[var(--color-success)] border border-behance-green/20 hover:border-behance-green/50 hover:-translate-y-0.5`}
                          >
                            Approve
                          </button>
                          <button
                            disabled={disableChanges}
                            onClick={() => quickAction(r, "changes")}
                            className={`${btnBase} bg-[var(--color-warning)]/10 hover:bg-[var(--color-warning)]/20 text-orange-300 border border-orange-500/20 hover:border-orange-500/50 hover:-translate-y-0.5`}
                          >
                            Changes
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Comment modal */}
      {commentModalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="dash-card p-6 w-full max-w-md mx-4">
            <h4 className="text-sm font-semibold dash-text">Request Changes</h4>
            <p className="text-xs dash-text-secondary mt-1">
              For: <span className="font-medium dash-text">{commentModalRow.title}</span>
            </p>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Explain what needs to be fixed…"
              rows={4}
              className="mt-3 w-full dash-surface border dash-border rounded-lg px-3 py-2 text-sm dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setCommentModalRow(null)}
                disabled={commentBusy}
                className="px-3 py-1.5 rounded-lg text-sm border dash-border dash-text-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={commentBusy || !commentText.trim()}
                onClick={async () => {
                  if (!user || !commentModalRow) return;
                  try {
                    setCommentBusy(true);
                    await applyLegalDecision({
                      contentId: commentModalRow.content_id,
                      companyId,
                      userId: user.id,
                      action: "request_changes",
                      comments: commentText.trim(),
                    });
                    setCommentModalRow(null);
                    setCommentText("");
                    await loadQueue();
                  } catch (e: any) {
                    logger.error("Request changes failed", e);
                    alert(e?.message ?? "Action failed.");
                  } finally {
                    setCommentBusy(false);
                  }
                }}
                className="px-3 py-1.5 rounded-lg text-sm bg-[var(--color-warning)] text-white font-medium hover:bg-[var(--color-warning)] disabled:opacity-50"
              >
                {commentBusy ? "Sending…" : "Submit Feedback"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
