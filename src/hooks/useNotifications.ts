import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { logger } from '../lib/logger';

export type AppNotification = {
  id: string;
  recipient_id: string;
  user_id?: string | null;
  type: string | null;
  content_id?: string | null;
  message: string | null;
  read_at: string | null; // DB column
  created_at: string;
};

type UseNotificationsArgs = {
  userId?: string | null;
  companyId?: string | null; // reserved (recommended long-term)
};

export function useNotifications({ userId }: UseNotificationsArgs) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = useMemo(
    () => items.filter((n) => !n.read_at).length,
    [items]
  );

  const load = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: qErr } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (qErr) throw qErr;
      setItems((data as AppNotification[]) || []);
    } catch (e: any) {
      logger.error("Failed to load notifications:", e);
      setError(e?.message ?? "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const markRead = useCallback(
    async (id: string) => {
      if (!userId) return;

      const now = new Date().toISOString();

      // optimistic UI
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: now } : n))
      );

      const { error } = await (supabase as any)
        .from("notifications")
        .update({ read_at: now })
        .eq("id", id)
        .eq("recipient_id", userId);

      if (error) {
        logger.error("markRead failed:", error);
        await load(); // rollback
      }
    },
    [userId, load]
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;

    const now = new Date().toISOString();

    // optimistic UI
    setItems((prev) => prev.map((n) => ({ ...n, read_at: now })));

    const { error } = await (supabase as any)
      .from("notifications")
      .update({ read_at: now })
      .eq("recipient_id", userId)
      .is("read_at", null);

    if (error) {
      logger.error("markAllRead failed:", error);
      await load();
    }
  }, [userId, load]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime updates
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          load();
          if (payload.new) {
            const newNotif = payload.new as AppNotification;
            if (newNotif.type === "deadline_alert") {
              const textMessage = newNotif.message || "Deadline approaching!";
              let actualToastMsg = textMessage;
              // Attempt to parse if it's JSON from edge function
              try {
                if (textMessage.startsWith("{")) {
                  const p = JSON.parse(textMessage);
                  if (p.text) actualToastMsg = p.text;
                }
              } catch (e) {
                // Ignore parse errors
              }
              window.dispatchEvent(
                new CustomEvent("global-toast", {
                  detail: { message: actualToastMsg, type: "warning" },
                })
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  return {
    items,
    loading,
    error,
    unreadCount,
    reload: load,
    markRead,
    markAllRead,
  };
}
