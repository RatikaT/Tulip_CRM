import { useEffect, useState } from 'react';
import { fieldConfigService } from '../services/fieldConfigService';
import { FieldConfigItem } from '../types/fieldConfig.types';

/**
 * Load the super-admin field configuration for a form and expose it as a
 * lookup by field_name. Forms use this to render dropdown-vs-text and to
 * enforce SA-configured `required` (additive to the hardcoded mandatory rules).
 */
export function useFieldConfig(form: 'lead' | 'enrollment') {
  const [configs, setConfigs] = useState<Record<string, FieldConfigItem>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fieldConfigService.list(form);
        if (cancelled) return;
        const map: Record<string, FieldConfigItem> = {};
        (res.fields || []).forEach((f) => { map[f.field_name] = f; });
        setConfigs(map);
      } catch {
        if (!cancelled) setConfigs({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [form]);

  const isRequired = (field: string) => !!configs[field]?.required;
  const isDropdown = (field: string) => configs[field]?.input_type === 'dropdown';
  const optionsFor = (field: string) => configs[field]?.options || [];

  return { configs, loading, isRequired, isDropdown, optionsFor };
}
