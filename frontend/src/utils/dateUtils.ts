import { format, parseISO } from 'date-fns';

// IST offset from UTC in milliseconds (5 hours 30 minutes)
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Converts a UTC date to IST (Indian Standard Time, UTC+5:30)
 * Server timestamps are UTC but may not have 'Z' suffix
 * Returns a Date that displays as IST when formatted with date-fns
 */
export function toIST(date: Date | string): Date {
  let d: Date;
  if (typeof date === 'string') {
    // Treat string timestamps as UTC (append Z if missing)
    const utcString = date.endsWith('Z') ? date : date + 'Z';
    d = new Date(utcString);
  } else {
    d = date;
  }
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
  let d: Date;
  if (typeof date === 'string') {
    // Treat string timestamps as UTC (append Z if missing)
    const utcString = date.endsWith('Z') ? date : date + 'Z';
    d = new Date(utcString);
  } else {
    d = date;
  }
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
    let date: Date;
    if (typeof dateString === 'string') {
      // Server sends timestamps without 'Z' suffix but they are UTC
      // Append 'Z' if not present to parse as UTC
      const utcString = dateString.endsWith('Z') ? dateString : dateString + 'Z';
      date = parseISO(utcString);
    } else {
      date = dateString;
    }
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
