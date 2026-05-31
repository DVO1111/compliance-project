import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Bell } from "lucide-react";
import { useJurisdictionStore } from "../../../stores/jurisdictionStore";
import type { Jurisdiction } from "../../../lib/rules/types";
import DashboardCard from "../ui/DashboardCard";
import { logger } from '../../../lib/logger';

type Circular = {
  id: string;
  source: string;
  circular_number: string;
  title: string;
  summary: string;
  product_categories: string[];
  severity: string;
  published_date: string;
  is_active: boolean;
  created_at: string;
  // New fields (optional for backward-compat)
  jurisdiction?: Jurisdiction;
  document_type?: string | null;
  topics?: string[] | null;
  source_url?: string | null;
  effective_date?: string | null;
};

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  medium: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  low: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
};

const DOC_TYPE_STYLES: Record<string, string> = {
  circular: "bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)]",
  guideline: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
  advisory: "bg-[var(--color-purple)]/10 text-[var(--color-purple)]",
  enforcement: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  news: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  policy_update: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
};

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function getJurisdictionFilter(selected: Jurisdiction) {
  // If user selects a specific jurisdiction, include BOTH:
  // - the selected jurisdiction
  // - 'all' (global updates)
  if (selected === "all") return null;
  return [selected, "all"];
}

export default function RegulatoryCircularsWidget() {
  const { selectedJurisdiction } = useJurisdictionStore();
  const [loading, setLoading] = useState(true);
  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [currentView, setCurrentView] = useState("5");

  const views = [
    { id: "5", label: "Top 5" },
    { id: "10", label: "Top 10" },
    { id: "20", label: "Top 20" },
  ];

  const currentLimit = parseInt(currentView, 10);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      let q = supabase
        .from("regulatory_circulars")
        .select("*")
        .eq("is_active", true);

      const jurFilter = getJurisdictionFilter(selectedJurisdiction);
      if (jurFilter) q = q.in("jurisdiction", jurFilter);

      const { data, error } = await q
        .order("published_date", { ascending: false })
        .limit(currentLimit);

      if (cancelled) return;
      if (error) {
        logger.error("RegulatoryCircularsWidget load failed:", error);
        setCirculars([]);
      } else {
        setCirculars((data ?? []) as Circular[]);
      }
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [currentLimit, selectedJurisdiction]);

  return (
    <DashboardCard
      className="h-full flex flex-col min-h-0"
      views={views}
      currentView={currentView}
      onViewChange={setCurrentView}
    >
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <Bell className="w-4 h-4 text-behance-pink" />
        <div>
          <h3 className="text-sm font-semibold dash-text">Regulatory Alerts</h3>
          <p className="text-xs dash-text-secondary">
            Circulars, guidelines & advisories relevant to healthcare marketing
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center text-sm dash-text-tertiary">Loading…</div>
      ) : circulars.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-sm dash-text-tertiary">
          No active updates for this jurisdiction.
        </div>
      ) : (
        <div className="space-y-2 flex-1 overflow-y-auto pr-1 min-h-0">
          {circulars.map((c) => {
            const docType = (c.document_type || "circular").toLowerCase();
            return (
              <div
                key={c.id}
                className="border dash-border rounded-lg p-3 hover:bg-white/5 transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase border dash-border ${SEVERITY_STYLES[c.severity] ?? SEVERITY_STYLES.medium
                          }`}
                      >
                        {c.severity}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium border dash-border ${DOC_TYPE_STYLES[docType] ?? "dash-surface-alt dash-text"
                          }`}
                        title="Update type"
                      >
                        {docType.replace("_", " ")}
                      </span>

                      <span className="text-[11px] dash-text-tertiary font-medium">
                        {c.source} • {c.circular_number}
                      </span>
                    </div>

                    <p className="text-sm font-semibold dash-text mt-1 line-clamp-1">{c.title}</p>
                    <p className="text-xs dash-text-secondary mt-0.5 line-clamp-2">{c.summary}</p>
                  </div>

                  <div className="text-right text-[11px] dash-text-tertiary whitespace-nowrap shrink-0">
                    {formatDate(c.published_date)}
                  </div>
                </div>

                {!!c.topics?.length && (
                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                    {c.topics.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium dash-surface-alt dash-text-secondary border dash-border"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {c.product_categories.length > 0 && (
                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                    {c.product_categories.map((cat) => (
                      <span
                        key={cat}
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium dash-surface dash-text-secondary border dash-border"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}
