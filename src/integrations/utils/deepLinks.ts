/**
 * Deep-link helpers used in notifications.
 *
 * This app uses an internal page state (no router). These URLs allow a user
 * to click from Slack/Teams/Notion/HubSpot and land in the right place.
 */

const OPEN_KEY = 'cc_open_content_id';
const CORRECTION_OPEN_KEY = 'cc_open_correction_content_id';

export function buildReviewUrl(contentId: string): string {
  // Example: https://app.example.com/?page=archive&open_content_id=<id>
  if (typeof window === 'undefined') return `/?page=archive&open_content_id=${encodeURIComponent(contentId)}`;
  return `${window.location.origin}/?page=archive&open_content_id=${encodeURIComponent(contentId)}`;
}

export function buildCorrectionUrl(contentId: string): string {
  // Example: https://app.example.com/?page=correction-editor&open_correction_id=<id>
  if (typeof window === 'undefined') return `/?page=correction-editor&open_correction_id=${encodeURIComponent(contentId)}`;
  return `${window.location.origin}/?page=correction-editor&open_correction_id=${encodeURIComponent(contentId)}`;
}

/**
 * Apply deep-link query params on app load.
 * - Navigates to `page`
 * - Sets localStorage keys that pages already read (ArchivePage / CorrectionEditor)
 */
export function applyDeepLinksFromUrl(opts: {
  setCurrentPage: (page: any) => void;
  isValidPageId: (value: any) => boolean;
}): void {
  if (typeof window === 'undefined') return;

  try {
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const page = params.get('page');
    const openContentId = params.get('open_content_id');
    const openCorrectionId = params.get('open_correction_id');

    if (openContentId) {
      localStorage.setItem(OPEN_KEY, openContentId);
      if (!page) params.set('page', 'archive');
    }

    if (openCorrectionId) {
      localStorage.setItem(CORRECTION_OPEN_KEY, openCorrectionId);
      if (!page) params.set('page', 'correction-editor');
    }

    const nextPage = params.get('page');
    if (nextPage && opts.isValidPageId(nextPage)) {
      opts.setCurrentPage(nextPage);
    }

    // Clean up URL (keep only OAuth status params if present)
    params.delete('page');
    params.delete('open_content_id');
    params.delete('open_correction_id');
    window.history.replaceState({}, '', url.pathname + (params.toString() ? `?${params.toString()}` : ''));
  } catch {
    // ignore
  }
}
