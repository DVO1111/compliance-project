// src/components/Dashboard/widgets/MarketingPipelineWidget.tsx
import { useState } from "react";
import { KanbanSquare } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import type {
  MarketingPipelineItem,
  MarketingPipelinePayload,
} from "../../../hooks/useMarketingPipeline";
import {
  publishContentFromPipeline,
  rescheduleContent,
  sendContentToLegal,
} from "../../../lib/marketingActions";
import DashboardCard from "../ui/DashboardCard";
import { SkeletonChart } from "../ui/Skeleton";
import { EmptyState, ErrorState } from "../ui/EmptyState";
import { logger } from '../../../lib/logger';

type ActionName = "send_legal" | "open_correction" | "publish" | "reschedule";

function canSendToLegal(status: string) {
  return ["draft", "analyzed", "amend_requested"].includes(status);
}

function canPublish(status: string) {
  return status === "signed_off";
}

function canOpenCorrection(status: string) {
  return ["draft", "analyzed", "amend_requested"].includes(status);
}

const btnBase =
  "text-[11px] px-2 py-1 rounded-md font-medium transition-colors disabled:opacity-40";

function Column({
  title,
  items,
  onAction,
  busyId,
}: {
  title: string;
  items: MarketingPipelineItem[];
  onAction: (item: MarketingPipelineItem, action: ActionName) => Promise<void>;
  busyId: string | null;
}) {
  return (
    <div className="border dash-border rounded-lg overflow-hidden flex flex-col h-full min-h-0">
      <div className="px-3 py-2 dash-surface-alt border-b dash-border shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wider dash-text-secondary">
          {title} ({items.length})
        </p>
      </div>
      <div className="p-2 space-y-2 flex-1 overflow-y-auto min-h-0">
        {items.length === 0 ? (
          <p className="text-xs dash-text-tertiary px-1 py-2">No items.</p>
        ) : (
          items.map((item) => {
            const isBusy = busyId === item.id;
            const disableSendToLegal =
              isBusy || !canSendToLegal(item.signoff_status);
            const disableOpenCorrection =
              isBusy || !canOpenCorrection(item.signoff_status);
            const disablePublish = isBusy || !canPublish(item.signoff_status);
            const disableReschedule = isBusy;

            return (
              <div
                key={item.id}
                className="border dash-border rounded-md p-2 dash-surface transition-colors hover:border-[var(--color-border-hover)]"
              >
                <p className="text-xs font-medium dash-text truncate">
                  {item.title}
                </p>
                <p className="text-[11px] dash-text-secondary mt-1">
                  {item.platform} • {item.signoff_status}
                </p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    disabled={disableSendToLegal}
                    onClick={() => onAction(item, "send_legal")}
                    className={`${btnBase} bg-[var(--color-warning-soft)] text-[var(--color-warning)] border border-[var(--color-warning)]/20`}
                  >
                    Send to legal
                  </button>

                  <button
                    disabled={disableOpenCorrection}
                    onClick={() => onAction(item, "open_correction")}
                    className={`${btnBase} bg-[var(--color-warning-soft)] text-[var(--color-warning)] border border-[var(--color-warning)]/20`}
                  >
                    Open correction
                  </button>

                  <button
                    disabled={disablePublish}
                    onClick={() => onAction(item, "publish")}
                    className={`${btnBase} bg-[var(--color-success-soft)] text-[var(--color-success)] border border-[var(--color-success)]/20`}
                  >
                    Publish
                  </button>

                  <button
                    disabled={disableReschedule}
                    onClick={() => onAction(item, "reschedule")}
                    className={`${btnBase} bg-[var(--color-info-soft)] text-[var(--color-info)] border border-[var(--color-info)]/20`}
                  >
                    Reschedule
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function MarketingPipelineWidget({
  companyId,
  loading,
  errorMsg,
  payload,
  onRefresh,
}: {
  companyId: string;
  loading: boolean;
  errorMsg: string | null;
  payload: MarketingPipelinePayload | null;
  onRefresh: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState("all");

  const views = [
    { id: "all", label: "All Stages" },
    { id: "action", label: "Action Required" },
    { id: "pending", label: "Pending/Ready" },
  ];

  const handleAction = async (
    item: MarketingPipelineItem,
    action: ActionName
  ) => {
    try {
      setBusyId(item.id);

      if (action === "open_correction") {
        localStorage.setItem("cc_open_correction_content_id", item.id);
        window.dispatchEvent(
          new CustomEvent("navigate", {
            detail: { page: "correction-editor" },
          })
        );
        window.dispatchEvent(
          new CustomEvent("navigate-to", {
            detail: { page: "correction-editor" },
          })
        );
        return;
      }

      if (action === "send_legal") {
        if (!user) throw new Error("You must be signed in.");
        await sendContentToLegal({
          contentId: item.id,
          companyId,
          userId: user.id,
          currentStatus: item.signoff_status,
        });
      }

      if (action === "publish") {
        if (!user) throw new Error("You must be signed in to publish.");
        await publishContentFromPipeline({
          contentId: item.id,
          companyId,
          userId: user.id,
          currentStatus: item.signoff_status,
        });
      }

      if (action === "reschedule") {
        if (!user) throw new Error("You must be signed in.");
        const nextDate = window.prompt(
          "Enter new schedule date (YYYY-MM-DD):",
          ""
        );
        if (!nextDate) return;
        await rescheduleContent({
          contentId: item.id,
          companyId,
          userId: user.id,
          nextDate,
        });
      }

      await onRefresh();
    } catch (e: any) {
      logger.error(`Action ${action} failed:`, e);
      alert(e?.message ?? "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardCard
      className="h-full min-h-[400px] max-h-[400px] flex flex-col"
      views={views}
      currentView={currentView}
      onViewChange={setCurrentView}
    >
      <div className="flex items-center gap-2 shrink-0">
        <div
          className="p-1.5 rounded-lg"
          style={{ background: "var(--color-accent-soft)" }}
        >
          <KanbanSquare className="w-4 h-4 dash-accent" />
        </div>
        <div>
          <h3 className="text-sm font-semibold dash-text">My Pipeline</h3>
          <p className="text-xs dash-text-secondary mt-0.5">
            Draft → Legal → Rework → Ready
          </p>
        </div>
      </div>

      <div className="mt-4 flex-1 flex flex-col min-h-0">
        {loading ? (
          <SkeletonChart className="flex-1" />
        ) : errorMsg ? (
          <ErrorState message={errorMsg} />
        ) : !payload ? (
          <EmptyState message="No pipeline data yet." />
        ) : (
          <div className={`grid gap-3 flex-1 min-h-0 ${currentView === 'all'
            ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'
            : 'grid-cols-1 md:grid-cols-2'
            }`}>
            {(currentView === 'all' || currentView === 'action') && (
              <Column
                title="Drafts"
                items={payload.drafts ?? []}
                onAction={handleAction}
                busyId={busyId}
              />
            )}
            {(currentView === 'all' || currentView === 'pending') && (
              <Column
                title="Awaiting Legal"
                items={payload.awaiting_legal ?? []}
                onAction={handleAction}
                busyId={busyId}
              />
            )}
            {(currentView === 'all' || currentView === 'action') && (
              <Column
                title="Needs Rework"
                items={payload.needs_rework ?? []}
                onAction={handleAction}
                busyId={busyId}
              />
            )}
            {(currentView === 'all' || currentView === 'pending') && (
              <Column
                title="Ready to Publish"
                items={payload.ready_to_publish ?? []}
                onAction={handleAction}
                busyId={busyId}
              />
            )}
          </div>
        )}
      </div>
    </DashboardCard>
  );
}
