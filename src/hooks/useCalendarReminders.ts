// src/hooks/useCalendarReminders.ts
// Polls for upcoming deadlines and fires reminders every 60s
import { useEffect, useRef } from 'react';
import { checkAndSendReminders } from '../lib/calendarService';

const POLL_INTERVAL_MS = 60_000; // 60 seconds

export function useCalendarReminders(
  companyId: string | null | undefined,
  userId: string | null | undefined,
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!companyId || !userId) return;

    // Run immediately on mount
    checkAndSendReminders(companyId, userId).catch(() => {});

    // Then poll every 60s
    intervalRef.current = setInterval(() => {
      checkAndSendReminders(companyId, userId).catch(() => {});
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [companyId, userId]);
}
