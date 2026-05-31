// src/hooks/useMarketingPipeline.ts
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { logger } from '../lib/logger';

export type MarketingPipelineItem = {
  id: string;
  title: string;
  platform: string;
  signoff_status: string;
  scheduled_date: string | null;
  published_at?: string | null;
  priority: string;
  created_at: string;
};

export type MarketingPipelinePayload = {
  drafts: MarketingPipelineItem[];
  awaiting_legal: MarketingPipelineItem[];
  needs_rework: MarketingPipelineItem[];
  ready_to_publish: MarketingPipelineItem[];
  scheduled: MarketingPipelineItem[];
};

export function useMarketingPipeline({
  companyId,
  userId,
  jurisdiction,
}: {
  companyId: string;
  userId: string;
  jurisdiction?: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [payload, setPayload] = useState<MarketingPipelinePayload | null>(null);

  const load = useCallback(async () => {
    if (!companyId || !userId) {
      setPayload(null);
      setErrorMsg(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const { data, error } = await (supabase as any).rpc("get_marketing_pipeline", {
      p_company_id: companyId,
      p_user_id: userId,
      p_jurisdiction: jurisdiction ?? null,
    });

    if (error) {
      logger.error("get_marketing_pipeline failed:", error);
      setPayload(null);
      setErrorMsg(error.message || "Failed to load pipeline.");
      setLoading(false);
      return;
    }

    const raw = (data ?? {}) as any;
    setPayload({
      drafts: (raw.drafts ?? []) as MarketingPipelineItem[],
      awaiting_legal: (raw.awaiting_legal ?? []) as MarketingPipelineItem[],
      needs_rework: (raw.needs_rework ?? []) as MarketingPipelineItem[],
      ready_to_publish: (raw.ready_to_publish ?? []) as MarketingPipelineItem[],
      scheduled: (raw.scheduled ?? []) as MarketingPipelineItem[],
    });
    setLoading(false);
  }, [companyId, userId, jurisdiction]);

  useEffect(() => {
    load();
  }, [load]);

  return { loading, errorMsg, payload, refresh: load };
}
