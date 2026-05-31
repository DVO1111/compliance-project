import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'fola_current_page';

/**
 * Persists the current page ID to sessionStorage so that
 * reloads / tab-discards restore the user to the same page.
 *
 * - Only persists while the browser session is open (sessionStorage).
 * - Skips restore when a deep-link or invite URL is active.
 * - Validates the stored value before restoring.
 */
export function useRoutePersistence<T extends string>(
  defaultPage: T,
  isValid: (v: unknown) => v is T,
): [T, (page: T) => void] {
  // On mount: try to restore from sessionStorage
  const [page, setPageState] = useState<T>(() => {
    // Don't restore if we're on a special URL path (invite, deep-link)
    try {
      const path = window.location.pathname;
      if (path !== '/' && path !== '') return defaultPage;
    } catch { /* SSR guard */ }

    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored && isValid(stored)) return stored;
    } catch { /* private browsing guard */ }

    return defaultPage;
  });

  // Wrapped setter that also writes to sessionStorage
  const setPage = useCallback(
    (next: T) => {
      setPageState(next);
      try {
        sessionStorage.setItem(STORAGE_KEY, next);
      } catch { /* quota / private browsing */ }
    },
    [],
  );

  // Sync initial value to storage (in case the restored page differs)
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, page);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [page, setPage];
}
