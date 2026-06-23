// Persist page filter state across navigation (e.g. clicking into a record and
// coming back) using sessionStorage. Filters survive navigation and refresh
// within the same tab, and reset only when the user clears them or closes the tab.

export function loadPersistedFilters(key: string): Record<string, unknown> {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function savePersistedFilters(key: string, value: Record<string, unknown>): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / serialization errors */
  }
}

// Date <-> storage helpers (Date isn't JSON-serializable)
export const toDateOrNull = (v: unknown): Date | null => (v ? new Date(v as string) : null);
export const dateToIso = (d: Date | null): string | null => (d ? d.toISOString() : null);
