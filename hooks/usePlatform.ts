'use client';

import { useSyncExternalStore } from 'react';
import { getPlatformInfo } from '@/lib/client/platform';
import type { PlatformInfo } from '@/lib/client/platform';

const subscribe = (): (() => void) => () => {};
const serverSnapshot = (): null => null;
const clientSnapshot = (): boolean => true;

export function usePlatform(): PlatformInfo | null {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return mounted ? getPlatformInfo() : null;
}
