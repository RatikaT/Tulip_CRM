import { format, parseISO } from 'date-fns';

// IST offset from UTC in milliseconds (5 hours 30 minutes)
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a timestamp from the API. The server stores UTC and sends naive ISO
 * strings (no 'Z'), which the browser would otherwise read as local time.
 * A bare 'YYYY-MM-DD' is a calendar date and parses as local midnight.
 */
export function parseServerDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (DATE_ONLY_RE.test(value)) return parseISO(value);
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasZone ? value : value + 'Z');
}

/**
 * IST calendar day of a server timestamp as 'yyyy-MM-dd' (sortable/comparable).
 * Use this for "today" / "overdue" checks instead of new Date(value).
 */
export function istDateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const key = formatToIST(value, 'yyyy-MM-dd');
  return key === '-' ? null : key;
}

/** Today's IST calendar day as 'yyyy-MM-dd', optionally shifted by whole days. */
export function todayISTKey(offsetDays = 0): string {
  return formatToIST(new Date(Date.now() + offsetDays * 86400000), 'yyyy-MM-dd');
}

/**
 * Converts a UTC date to IST (Indian Standard Time, UTC+5:30)
 * Server timestamps are UTC but may not have 'Z' suffix
 * Returns a Date that displays as IST when formatted with date-fns
 */
export function toIST(date: Date | string): Date {
  // Naive server timestamps are UTC; bare dates are calendar dates.
  const d = parseServerDate(date) as Date;
  // Add IST offset and adjust for browser timezone (since format() uses local timezone)
  const browserOffset = d.getTimezoneOffset() * 60 * 1000;
  return new Date(d.getTime() + IST_OFFSET_MS + browserOffset);
}

/**
 * Converts a UTC date to an adjusted Date for DateTimePicker display in IST
 * This makes the picker show IST time regardless of browser timezone
 * Server timestamps are UTC but may not have 'Z' suffix
 */
export function toISTForPicker(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  // Naive server timestamps are UTC; bare dates are calendar dates.
  const d = parseServerDate(date) as Date;
  // Get the UTC time and add IST offset, then subtract browser offset to "trick" the picker
  const browserOffset = d.getTimezoneOffset() * 60 * 1000;
  return new Date(d.getTime() + IST_OFFSET_MS + browserOffset);
}

/**
 * Converts a DateTimePicker selected value (shown as IST) back to UTC ISO string for storage
 */
export function fromISTPickerToUTC(date: Date | null | undefined): string | null {
  if (!date) return null;
  // Reverse the IST adjustment: subtract IST offset and add browser offset
  const browserOffset = date.getTimezoneOffset() * 60 * 1000;
  const utcDate = new Date(date.getTime() - IST_OFFSET_MS - browserOffset);
  return utcDate.toISOString();
}

/**
 * Formats a date/datetime string to IST with the specified format
 * @param dateString - ISO date string or Date object
 * @param formatStr - date-fns format string (default: 'dd MMM yyyy, hh:mm a')
 */
export function formatToIST(dateString: string | Date | null | undefined, formatStr: string = 'dd MMM yyyy, hh:mm a'): string {
  if (!dateString) return '-';
  try {
    // A bare 'YYYY-MM-DD' is already a calendar date - no timezone shift.
    if (typeof dateString === 'string' && DATE_ONLY_RE.test(dateString)) {
      return format(parseISO(dateString), formatStr);
    }
    const date = parseServerDate(dateString);
    if (!date || isNaN(date.getTime())) return '-';
    // Add IST offset and adjust for browser timezone (since format() uses local timezone)
    // This ensures IST is displayed regardless of browser timezone
    const browserOffset = date.getTimezoneOffset() * 60 * 1000;
    const istDate = new Date(date.getTime() + IST_OFFSET_MS + browserOffset);
    return format(istDate, formatStr);
  } catch {
    return '-';
  }
}

/**
 * Formats a date to IST with date and time (dd/MM/yyyy hh:mm a)
 */
export function formatDateTimeIST(dateString: string | Date | null | undefined): string {
  return formatToIST(dateString, 'dd/MM/yyyy hh:mm a');
}

/**
 * Formats a date to IST with full date and time (dd MMM yyyy, hh:mm a)
 */
export function formatFullDateTimeIST(dateString: string | Date | null | undefined): string {
  return formatToIST(dateString, 'dd MMM yyyy, hh:mm a');
}

/**
 * Formats a date to IST with short date format (dd/MM/yy)
 */
export function formatShortDateIST(dateString: string | Date | null | undefined): string {
  return formatToIST(dateString, 'dd/MM/yy');
}

/**
 * Formats a date to IST with date only (dd/MM/yyyy)
 */
export function formatDateIST(dateString: string | Date | null | undefined): string {
  return formatToIST(dateString, 'dd/MM/yyyy');
}

/**
 * Formats a date to IST with time only (hh:mm a)
 */
export function formatTimeIST(dateString: string | Date | null | undefined): string {
  return formatToIST(dateString, 'hh:mm a');
}
