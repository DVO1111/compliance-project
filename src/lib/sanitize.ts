import DOMPurify from 'dompurify';

/**
 * Sanitize user-provided text to prevent XSS.
 * Strips all HTML tags and returns plain text.
 */
export function sanitizeInput(text: string): string {
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
