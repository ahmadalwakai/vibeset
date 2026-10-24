import { z } from 'zod';
import { MAX_CUSTOM_ICONS, MAX_SELECTED_APPS } from './icon-export';
import { appSlugSchema } from './validation/icon-export';

export const wizardItemIdSchema = z
  .string()
  .max(200)
  .refine((value) => {
    if (value.startsWith('app:')) return appSlugSchema.safeParse(value.slice(4)).success;
    return (
      value.startsWith('custom:custom-') && z.uuid().length(36).safeParse(value.slice(14)).success
    );
  });
export const wizardProgressSchema = z.strictObject({
  v: z.literal(1),
  done: z
    .array(wizardItemIdSchema)
    .max(MAX_SELECTED_APPS + MAX_CUSTOM_ICONS)
    .transform((values) => [...new Set(values)]),
  completed: z.boolean(),
});
export type WizardProgress = z.infer<typeof wizardProgressSchema>;
export interface WizardState extends WizardProgress {
  selectedIds: string[];
}
export type WizardAction =
  | { type: 'reconcile'; selectedIds: string[] }
  | { type: 'done'; id: string; value: boolean }
  | { type: 'claim-completion' }
  | { type: 'reset' };

export function initialWizardState(
  selectedIds: readonly string[],
  progress: WizardProgress | null = null,
): WizardState {
  const selected = z
    .array(wizardItemIdSchema)
    .max(MAX_SELECTED_APPS + MAX_CUSTOM_ICONS)
    .parse([...new Set(selectedIds)]);
  const stored = progress
    ? persistedWizardProgress(progress)
    : { v: 1 as const, done: [], completed: false };
  const allowed = new Set(selected);
  return { ...stored, selectedIds: selected, done: stored.done.filter((id) => allowed.has(id)) };
}

export function wizardSummary(state: WizardState): {
  done: number;
  total: number;
  complete: boolean;
  nextId: string | null;
  percent: number;
} {
  const done = new Set(state.done);
  const total = state.selectedIds.length;
  return {
    done: state.done.length,
    total,
    complete: total > 0 && state.done.length === total,
    nextId: state.selectedIds.find((id) => !done.has(id)) ?? null,
    percent: total ? Math.round((state.done.length / total) * 100) : 0,
  };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'reconcile':
      return initialWizardState(action.selectedIds, state);
    case 'done': {
      if (!state.selectedIds.includes(action.id)) return state;
      const done = new Set(state.done);
      if (action.value) done.add(action.id);
      else done.delete(action.id);
      return { ...state, done: state.selectedIds.filter((id) => done.has(id)) };
    }
    case 'claim-completion':
      return wizardSummary(state).complete && !state.completed
        ? { ...state, completed: true }
        : state;
    case 'reset':
      return { ...state, done: [], completed: false };
  }
}

export function persistedWizardProgress(state: WizardProgress): WizardProgress {
  return wizardProgressSchema.parse({ v: 1, done: state.done, completed: state.completed });
}
