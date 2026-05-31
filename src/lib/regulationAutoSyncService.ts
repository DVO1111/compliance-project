// src/lib/regulationAutoSyncService.ts
// Background auto-sync for regulations — polls on a configurable interval.

import { syncRegulations, type SyncProgress } from './regulationsSyncService';
import { logger } from './logger';

let intervalId: ReturnType<typeof setInterval> | null = null;

const LS_KEY_ENABLED = 'reg_auto_sync_enabled';
const LS_KEY_LAST = 'reg_auto_sync_last';

export function isAutoSyncEnabled(): boolean {
  return localStorage.getItem(LS_KEY_ENABLED) === 'true';
}

export function getLastSyncedAt(): string | null {
  return localStorage.getItem(LS_KEY_LAST);
}

export function startAutoSync(
  intervalMs: number = 3600000, // default 1 hour
  onProgress?: (progress: SyncProgress) => void,
  onComplete?: () => void
): void {
  if (intervalId) clearInterval(intervalId);

  localStorage.setItem(LS_KEY_ENABLED, 'true');

  const doSync = async () => {
    try {
      await syncRegulations((progress) => {
        onProgress?.(progress);
      });
      localStorage.setItem(LS_KEY_LAST, new Date().toISOString());
      onComplete?.();
    } catch (err) {
      logger.warn('[regulationAutoSync] Sync failed (non-fatal):', err);
    }
  };

  intervalId = setInterval(doSync, intervalMs);
}

export function stopAutoSync(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  localStorage.setItem(LS_KEY_ENABLED, 'false');
}

export function getTimeAgo(isoDate: string | null): string {
  if (!isoDate) return 'Never';
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
