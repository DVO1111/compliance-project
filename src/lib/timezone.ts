// src/lib/timezone.ts
// Centralized timezone configuration for the app
// Nigeria (WAT) = Africa/Lagos = UTC+01:00

export const APP_TIMEZONE = 'Africa/Lagos';
export const APP_LOCALE = 'en-NG'; // Nigerian English locale

/** Format options presets */
export const TZ = { timeZone: APP_TIMEZONE } as const;

/** Combine date + time inputs (from <input type="date"> and <input type="time">) into a proper UTC ISO string.
 *  Treats the inputs as Africa/Lagos local time. */
export function localInputToISO(dateStr: string, timeStr?: string): string {
  // Build a local datetime string
  const time = timeStr || '09:00'; // Default to 9 AM WAT if no time provided
  const localStr = `${dateStr}T${time}`;
  
  // new Date() will parse this as LOCAL time (browser timezone).
  // Since the browser is in Nigeria (WAT), this is correct.
  const d = new Date(localStr);
  return d.toISOString();
}

/** Format a date/ISO string for display in WAT timezone */
export function formatDateWAT(isoOrDate: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleString(APP_LOCALE, { timeZone: APP_TIMEZONE, ...opts });
}

/** Format just the date portion in WAT */
export function formatDateOnlyWAT(isoOrDate: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleDateString(APP_LOCALE, { timeZone: APP_TIMEZONE, ...opts });
}

/** Format just the time portion in WAT */
export function formatTimeWAT(isoOrDate: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleTimeString(APP_LOCALE, { timeZone: APP_TIMEZONE, ...opts });
}

/** Get a Date object representing "now" in WAT context (same JS Date, just for clarity) */
export function nowWAT(): Date {
  return new Date(); // JS Date is always UTC internally; display functions handle the TZ
}
