import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { BookOpen, ExternalLink } from "lucide-react";
import { useJurisdictionStore } from "../../../stores/jurisdictionStore";
import type { Jurisdiction } from "../../../lib/rules/types";
import DashboardCard from "../ui/DashboardCard";
import { logger } from '../../../lib/logger';

type Regulation = {
  id: string;
  title: string;
  source: string;
  category: "pharma" | "medical_devices" | "clinical_trials" | "marketing" | "general";
  content: string;
  source_url: string | null;
  version: string;
  effective_date: string | null; // ISO date
  last_crawled: string; // timestamptz
  is_active: boolean;
  created_at: string;
  updated_at: string;
  jurisdiction?: Jurisdiction;
};

const CATEGORY_LABELS: Record<Regulation["category"] | "all", string> = {
  all: "All",
  pharma: "Pharma",
  medical_devices: "Medical Devices",
  clinical_trials: "Clinical Trials",
  marketing: "Marketing",
  general: "General",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
}

function getJurisdictionFilter(selected: Jurisdiction) {
  if (selected === "all") return null;
  return [selected, "all"];
}

export default function RegulationsFeedWidget() {
  const { selectedJurisdiction } = useJurisdictionStore();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Regulation[]>([]);
  const [currentView, setCurrentView] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const views = [
    { id: "all", label: "All Configured" },
    { id: "marketing", label: "Marketing Only" },
    { id: "pharma", label: "Pharma & Medical" },
  ];

  const filtered = useMemo(() => {
    if (currentView === "all") return rows;
    if (currentView === "marketing") return rows.filter((r) => r.category === "marketing");
    if (currentView === "pharma") return rows.filter((r) => ["pharma", "medical_devices"].includes(r.category));
    return rows;
  }, [rows, currentView]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);

      let q = supabase
        .from("regulations")
        .select("*")
        .eq("is_active", true);

      const jurFilter = getJurisdictionFilter(selectedJurisdiction);
      if (jurFilter) q = q.in("jurisdiction", jurFilter);

      const { data, error } = await q.order("updated_at", { ascending: false }).limit(20);

      if (!mounted) return;

      if (error) {
        logger.error("RegulationsFeedWidget load failed:", error);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as Regulation[]);
      setLoading(false);
    };

    load();

    // Realtime refresh
    const channel = supabase
      .channel("regulations-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "regulations", filter: "is_active=eq.true" },
        () => load()
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [selectedJurisdiction]);

  return (
    <DashboardCard
      className="h-full min-h-[400px] max-h-[400px] flex flex-col"
      views={views}
      currentView={currentView}
      onViewChange={setCurrentView}
    >
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-behance-blue" />
          <div>
            <h3 className="text-sm font-semibold dash-text">Regulations Live Feed</h3>
            <p className="text-xs dash-text-secondary mt-0.5">Latest active updates (by updated_at)</p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2 flex-1 overflow-y-auto pr-1 min-h-0">
        {loading ? (
          <div className="dash-surface-alt rounded-lg border dash-border p-4 text-sm dash-text-secondary">
            Loading regulations…
          </div>
        ) : filtered.length === 0 ? (
          <div className="dash-surface-alt rounded-lg border dash-border p-4 text-sm dash-text-secondary">
            No active regulations found{currentView === "all" ? "" : ` for this category`}.
          </div>
        ) : (
          filtered.map((r) => {
            const isOpen = expandedId === r.id;
            return (
              <div
                key={r.id}
                className="border dash-border rounded-lg p-3 hover:shadow-sm transition-shadow hover:bg-white/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold dash-text truncate">{r.title}</p>

                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium dash-surface-alt dash-text-secondary border dash-border">
                        {CATEGORY_LABELS[r.category]}
                      </span>

                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-behance-blue/10 text-behance-blue border border-behance-blue/20">
                        v{r.version}
                      </span>
                    </div>

                    <div className="text-xs dash-text-secondary mt-1 flex items-center gap-2 flex-wrap">
                      <span>
                        <span className="font-medium dash-text">Source:</span> {r.source}
                      </span>
                      <span className="dash-text-tertiary">•</span>
                      <span>
                        <span className="font-medium dash-text">Effective:</span> {formatDate(r.effective_date)}
                      </span>
                      <span className="dash-text-tertiary">•</span>
                      <span>
                        <span className="font-medium dash-text">Updated:</span> {formatDate(r.updated_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {r.source_url ? (
                      <a
                        href={r.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-behance-blue hover:underline"
                        title="Open source"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Source
                      </a>
                    ) : null}

                    <button
                      onClick={() => setExpandedId(isOpen ? null : r.id)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border dash-border hover:border-behance-blue hover:text-behance-blue transition-colors dash-text"
                    >
                      {isOpen ? "Hide" : "Read"}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-3 dash-surface-alt border dash-border rounded-lg p-3">
                    <p className="text-sm dash-text-secondary whitespace-pre-wrap leading-relaxed">{r.content}</p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </DashboardCard>
  );
}
