export type SetupMediaStep = 'open' | 'action' | 'details' | 'photo' | 'name' | 'finish';

/** P17 adds verified recordings; absent steps use the numbered illustrations. */
export const SETUP_MEDIA: Readonly<Partial<Record<SetupMediaStep, string>>> = Object.freeze({});
