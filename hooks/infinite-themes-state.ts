import type { Paginated, ThemeCardDTO } from '../lib/dto';
import type { ErrorMessageCode } from '../lib/result';

export interface InfiniteThemesState extends Paginated<ThemeCardDTO> {
  key: string;
  loading: boolean;
  error: ErrorMessageCode | null;
  requestId: number | null;
  requestedCursor: string | null;
}
export type InfiniteThemesAction =
  | { type: 'reset'; key: string; page: Paginated<ThemeCardDTO> }
  | { type: 'start'; key: string; requestId: number; cursor: string }
  | {
      type: 'success';
      key: string;
      requestId: number;
      cursor: string;
      page: Paginated<ThemeCardDTO>;
    }
  | { type: 'failure'; key: string; requestId: number; cursor: string; error: ErrorMessageCode };

function unique(items: readonly ThemeCardDTO[]): ThemeCardDTO[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}
export function initialInfiniteThemesState(
  key: string,
  page: Paginated<ThemeCardDTO>,
): InfiniteThemesState {
  return {
    key,
    items: unique(page.items),
    nextCursor: page.nextCursor,
    loading: false,
    error: null,
    requestId: null,
    requestedCursor: null,
  };
}
export function infiniteThemesReducer(
  state: InfiniteThemesState,
  action: InfiniteThemesAction,
): InfiniteThemesState {
  if (action.type === 'reset') return initialInfiniteThemesState(action.key, action.page);
  if (action.key !== state.key) return state;
  if (action.type === 'start') {
    if (state.loading || state.nextCursor !== action.cursor) return state;
    return {
      ...state,
      loading: true,
      error: null,
      requestId: action.requestId,
      requestedCursor: action.cursor,
    };
  }
  if (action.requestId !== state.requestId || action.cursor !== state.requestedCursor) return state;
  if (action.type === 'failure')
    return {
      ...state,
      loading: false,
      error: action.error,
      requestId: null,
      requestedCursor: null,
    };
  if (action.page.nextCursor === action.cursor)
    return { ...state, loading: false, error: 'INTERNAL', requestId: null, requestedCursor: null };
  return {
    ...state,
    items: unique([...state.items, ...action.page.items]),
    nextCursor: action.page.nextCursor,
    loading: false,
    error: null,
    requestId: null,
    requestedCursor: null,
  };
}
