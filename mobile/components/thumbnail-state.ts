export interface ThumbnailState {
  url: string | null;
  failed: boolean;
}
export type ThumbnailEvent =
  { kind: 'source'; url: string | null } | { kind: 'failure'; url: string };
export function thumbnailReducer(state: ThumbnailState, event: ThumbnailEvent): ThumbnailState {
  if (event.kind === 'source')
    return state.url === event.url ? state : { url: event.url, failed: false };
  return state.url === event.url ? { ...state, failed: true } : state;
}
