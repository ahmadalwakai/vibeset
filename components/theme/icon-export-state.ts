import type { IconExportWarning } from '@/lib/icon-export';
import type { IconSelection } from '@/lib/icon-export';
import type { AppDTO } from '@/lib/dto';
import { reconcileIconSelection } from '@/lib/client/icon-selection';

export function resolveExportSelection(
  selection: IconSelection,
  apps: readonly AppDTO[],
  glyphNames?: readonly string[],
): { selection: IconSelection; apps: AppDTO[] } {
  const reconciled = reconcileIconSelection(selection, apps, glyphNames);
  const bySlug = new Map(apps.map((app) => [app.slug, app]));
  return {
    selection: reconciled,
    apps: reconciled.appSlugs.flatMap((slug) => {
      const app = bySlug.get(slug);
      return app ? [app] : [];
    }),
  };
}

export interface IconExportState {
  phase: 'pick' | 'generating' | 'save' | 'error';
  run: number;
  completed: number;
  total: number;
  files: readonly File[];
  warnings: readonly IconExportWarning[];
  savedBatches: readonly number[];
}

export type IconExportEvent =
  | { type: 'start'; run: number; total: number }
  | { type: 'progress'; run: number; completed: number }
  | { type: 'warning'; run: number; warning: IconExportWarning }
  | { type: 'complete'; run: number; files: readonly File[] }
  | { type: 'fail' | 'cancel' | 'edit'; run: number }
  | { type: 'saved'; run: number; batch: number };

export const INITIAL_ICON_EXPORT_STATE: IconExportState = {
  phase: 'pick',
  run: 0,
  completed: 0,
  total: 0,
  files: [],
  warnings: [],
  savedBatches: [],
};

export function iconExportReducer(state: IconExportState, event: IconExportEvent): IconExportState {
  if (event.type === 'start') {
    if (event.run <= state.run) return state;
    return {
      ...INITIAL_ICON_EXPORT_STATE,
      phase: 'generating',
      run: event.run,
      total: event.total,
    };
  }
  if (event.run !== state.run) return state;
  if (event.type === 'edit' || event.type === 'cancel')
    return { ...INITIAL_ICON_EXPORT_STATE, run: state.run };
  if (event.type === 'saved') {
    if (state.phase !== 'save' || state.savedBatches.includes(event.batch)) return state;
    return { ...state, savedBatches: [...state.savedBatches, event.batch] };
  }
  if (state.phase !== 'generating') return state;
  if (event.type === 'progress')
    return {
      ...state,
      completed: Math.max(state.completed, Math.min(state.total, event.completed)),
    };
  if (event.type === 'warning')
    return state.warnings.includes(event.warning)
      ? state
      : { ...state, warnings: [...state.warnings, event.warning] };
  if (event.type === 'complete')
    return {
      ...state,
      phase: event.files.length ? 'save' : 'error',
      files: event.files,
      completed: event.files.length,
    };
  return { ...state, phase: 'error' };
}
