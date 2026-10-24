'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { writeStudioDraft } from '../lib/client/studio-draft';
import type { ThemeSpec } from '../lib/render/spec';
import { STUDIO_AUTOSAVE_MS, type EditorAction, type ThemeEditor } from '../lib/studio';
import { initialThemeEditorState, themeEditorReducer } from './theme-editor-state';

export function isEditorTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !==
    null
  );
}

/** The entry gate resolves URL/draft precedence and remounts this hook for a new source. */
export function useThemeEditor(initialSpec: ThemeSpec, sourceSlug: string | null): ThemeEditor {
  const [state, reduce] = useReducer(themeEditorReducer, initialSpec, initialThemeEditorState);
  const latest = useRef({ spec: state.spec, sourceSlug });
  useEffect(() => {
    latest.current = { spec: state.spec, sourceSlug };
  }, [state.spec, sourceSlug]);

  const dispatch = useCallback((action: EditorAction): void => {
    let seeded = action;
    if (action.type === 'shuffleSeed' && action.seed === undefined) {
      const random = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
      seeded = { ...action, seed: random & 0x7fffffff };
    }
    reduce({ ...seeded, at: Date.now() });
  }, []);
  const clearError = useCallback((): void => reduce({ type: 'clearError' }), []);
  const flushDraft = useCallback((): void => {
    writeStudioDraft({ v: 1, ...latest.current });
  }, []);

  useEffect(() => {
    const timer = setTimeout(
      () => writeStudioDraft({ v: 1, spec: state.spec, sourceSlug }),
      STUDIO_AUTOSAVE_MS,
    );
    return () => clearTimeout(timer);
  }, [state.spec, sourceSlug]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'z' ||
        isEditorTypingTarget(event.target)
      )
        return;
      event.preventDefault();
      dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
    };
    const visibility = (): void => {
      if (document.visibilityState === 'hidden') flushDraft();
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('pagehide', flushDraft);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('pagehide', flushDraft);
      document.removeEventListener('visibilitychange', visibility);
      flushDraft();
    };
  }, [dispatch, flushDraft]);

  return {
    spec: state.spec,
    dispatch,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    error: state.error,
    clearError,
    flushDraft,
  };
}
