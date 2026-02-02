import { useState, useEffect, useCallback } from 'react';
import { dropdownService } from '../services/dropdownService';
import { DropdownConfig } from '../types/dropdown.types';

// Fallback values from hardcoded constants
import {
  LEAD_STATUS_OPTIONS,
  LEAD_SOURCE_OPTIONS,
  TRIMESTER_OPTIONS as LEAD_TRIMESTER_OPTIONS,
  LOOKING_FOR_OPTIONS,
  SERVICE_ENROLLED_OPTIONS as LEAD_SERVICE_ENROLLED_OPTIONS,
  SERVICE_PARTNER_OPTIONS as LEAD_SERVICE_PARTNER_OPTIONS,
  REASON_FOR_NO_SALE_OPTIONS,
  PACKAGE_OPTIONS as LEAD_PACKAGE_OPTIONS,
  PARTNER_CENTER_OPTIONS,
} from '../types/lead.types';

import {
  CONNECT_STATUS_OPTIONS,
  ACTION_TAKEN_OPTIONS,
  SERVICE_PARTNER_OPTIONS as ENROLLMENT_SERVICE_PARTNER_OPTIONS,
  TRIMESTER_OPTIONS as ENROLLMENT_TRIMESTER_OPTIONS,
  SERVICE_ENROLLED_OPTIONS as ENROLLMENT_SERVICE_ENROLLED_OPTIONS,
  PACKAGE_OPTIONS as ENROLLMENT_PACKAGE_OPTIONS,
} from '../types/enrollment.types';

// Cache for dropdown configs to avoid repeated API calls
const configCache: Record<string, { data: DropdownConfig; timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Fallback mapping for field names
const FALLBACK_OPTIONS: Record<string, string[]> = {
  lead_status: LEAD_STATUS_OPTIONS,
  lead_source: LEAD_SOURCE_OPTIONS,
  trimester: LEAD_TRIMESTER_OPTIONS,
  looking_for: LOOKING_FOR_OPTIONS,
  service_enrolled: LEAD_SERVICE_ENROLLED_OPTIONS,
  service_partner: LEAD_SERVICE_PARTNER_OPTIONS,
  reason_for_no_sale: REASON_FOR_NO_SALE_OPTIONS,
  package_options: LEAD_PACKAGE_OPTIONS,
  connect_status: CONNECT_STATUS_OPTIONS,
  action_taken: ACTION_TAKEN_OPTIONS,
};

const FALLBACK_CONDITIONAL_OPTIONS: Record<string, Record<string, string[]>> = {
  partner_center: PARTNER_CENTER_OPTIONS,
};

interface UseDropdownOptionsResult {
  options: string[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

interface UseConditionalDropdownOptionsResult {
  options: string[];
  allOptions: Record<string, string[]>;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * Hook to fetch dropdown options from API with fallback to hardcoded values
 */
export function useDropdownOptions(fieldName: string): UseDropdownOptionsResult {
  const [options, setOptions] = useState<string[]>(FALLBACK_OPTIONS[fieldName] || []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchOptions = useCallback(async () => {
    // Check cache first
    const cached = configCache[fieldName];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setOptions(cached.data.options);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const config = await dropdownService.getDropdownConfig(fieldName);
      configCache[fieldName] = { data: config, timestamp: Date.now() };
      setOptions(config.options);
    } catch (err) {
      console.error(`Failed to fetch dropdown options for ${fieldName}:`, err);
      setError(err as Error);
      // Keep fallback options on error
      setOptions(FALLBACK_OPTIONS[fieldName] || []);
    } finally {
      setLoading(false);
    }
  }, [fieldName]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const refresh = useCallback(() => {
    // Clear cache and refetch
    delete configCache[fieldName];
    fetchOptions();
  }, [fieldName, fetchOptions]);

  return { options, loading, error, refresh };
}

/**
 * Hook to fetch conditional dropdown options (e.g., partner centers based on service partner)
 */
export function useConditionalDropdownOptions(
  fieldName: string,
  parentValue?: string
): UseConditionalDropdownOptionsResult {
  const fallbackConditional = FALLBACK_CONDITIONAL_OPTIONS[fieldName] || {};
  const [allOptions, setAllOptions] = useState<Record<string, string[]>>(fallbackConditional);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchOptions = useCallback(async () => {
    // Check cache first
    const cached = configCache[fieldName];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setAllOptions(cached.data.conditional_options || {});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const config = await dropdownService.getDropdownConfig(fieldName);
      configCache[fieldName] = { data: config, timestamp: Date.now() };
      setAllOptions(config.conditional_options || {});
    } catch (err) {
      console.error(`Failed to fetch dropdown options for ${fieldName}:`, err);
      setError(err as Error);
      // Keep fallback options on error
      setAllOptions(fallbackConditional);
    } finally {
      setLoading(false);
    }
  }, [fieldName, fallbackConditional]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const refresh = useCallback(() => {
    // Clear cache and refetch
    delete configCache[fieldName];
    fetchOptions();
  }, [fieldName, fetchOptions]);

  // Get options for specific parent value
  const options = parentValue ? (allOptions[parentValue] || []) : [];

  return { options, allOptions, loading, error, refresh };
}

/**
 * Clear the dropdown options cache
 */
export function clearDropdownCache(): void {
  Object.keys(configCache).forEach((key) => {
    delete configCache[key];
  });
}

/**
 * Prefetch multiple dropdown configs to improve UX
 */
export async function prefetchDropdownConfigs(fieldNames: string[]): Promise<void> {
  const promises = fieldNames.map(async (fieldName) => {
    if (configCache[fieldName] && Date.now() - configCache[fieldName].timestamp < CACHE_TTL) {
      return; // Already cached
    }
    try {
      const config = await dropdownService.getDropdownConfig(fieldName);
      configCache[fieldName] = { data: config, timestamp: Date.now() };
    } catch (err) {
      console.error(`Failed to prefetch dropdown config for ${fieldName}:`, err);
    }
  });

  await Promise.all(promises);
}
