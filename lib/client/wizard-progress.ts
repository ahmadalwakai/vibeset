import { exportSlugSchema } from '../validation/icon-export';
import { persistedWizardProgress, wizardProgressSchema } from '../wizard-progress';
import type { WizardProgress } from '../wizard-progress';

const volatileProgress = new Map<string, WizardProgress>();

export function wizardStorageKey(slug: string | null): string {
  return `vibeset:ios-wizard:${slug ? exportSlugSchema.parse(slug) : 'default'}`;
}
export function readWizardProgress(slug: string | null): WizardProgress | null {
  let key: string;
  let raw: string | null;
  try {
    key = wizardStorageKey(slug);
  } catch {
    return null;
  }
  try {
    raw = localStorage.getItem(key);
  } catch {
    const stored = volatileProgress.get(key);
    return stored ? persistedWizardProgress(stored) : null;
  }
  if (!raw || raw.length > 32_768) {
    volatileProgress.delete(key);
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    const parsed = wizardProgressSchema.safeParse(value);
    if (!parsed.success) {
      volatileProgress.delete(key);
      return null;
    }
    volatileProgress.set(key, parsed.data);
    return parsed.data;
  } catch {
    volatileProgress.delete(key);
    return null;
  }
}
export function writeWizardProgress(slug: string | null, progress: WizardProgress): void {
  const value = persistedWizardProgress(progress);
  const key = wizardStorageKey(slug);
  volatileProgress.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Preserve progress across remounts in this document when storage is denied. */
  }
}
