import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

export interface EventDetailsData {
    topic: string | null;
    platform: string | null;
    audience: string | null;
    aiScore: string | null;
    reviewerProfile: {
        id: string;
        fullName: string;
        avatarUrl: string | null;
    } | null;
}

export function useEventDetails(submissionId: string | undefined) {
    const [data, setData] = useState<EventDetailsData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!submissionId) {
            setData(null);
            return;
        }

        let isMounted = true;

        async function fetchDetails() {
            setLoading(true);
            setError(null);
            try {
                const { data: sub } = await supabase
                    .from('content_submissions')
                    .select('content_topic, platform, target_audience, legal_decided_by')
                    .eq('id', submissionId as string)
                    .single() as any;

                const { data: rep } = await supabase
                    .from('compliance_reports')
                    .select('overall_risk')
                    .eq('submission_id', submissionId as string)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle() as any;

                let reviewerId = sub?.legal_decided_by || null;

                if (!reviewerId) {
                    const { data: legacyReview } = await supabase
                        .from('legal_reviews')
                        .select('reviewer_id')
                        .eq('submission_id', submissionId as string)
                        .maybeSingle() as any;

                    if (legacyReview?.reviewer_id) {
                        reviewerId = legacyReview.reviewer_id;
                    } else {
                        const { data: assignment } = await supabase
                            .from('review_assignments')
                            .select('reviewer_ids')
                            .eq('submission_id', submissionId as string)
                            .maybeSingle() as any;
                        if (assignment?.reviewer_ids?.length > 0) {
                            reviewerId = assignment.reviewer_ids[0];
                        }
                    }
                }

                let reviewerProfile = null;
                if (reviewerId) {
                    const { data: prof } = await supabase
                        .from('profiles')
                        .select('id, full_name, avatar_url')
                        .eq('id', reviewerId)
                        .maybeSingle() as any;

                    if (prof) {
                        reviewerProfile = {
                            id: prof.id,
                            fullName: prof.full_name,
                            avatarUrl: prof.avatar_url,
                        };
                    }
                }

                if (isMounted) {
                    setData({
                        topic: sub?.content_topic || null,
                        platform: sub?.platform || null,
                        audience: sub?.target_audience || null,
                        aiScore: rep?.overall_risk || null,
                        reviewerProfile,
                    });
                }
            } catch (err: any) {
                logger.error('[useEventDetails] Error fetching event details:', err);
                if (isMounted) setError(err);
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        fetchDetails();

        return () => {
            isMounted = false;
        };
    }, [submissionId]);

    return { data, loading, error };
}
