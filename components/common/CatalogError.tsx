'use client';

import type { ReactElement } from 'react';
import { useRouter } from '@/i18n/navigation';
import { ErrorState } from './ErrorState';

export function CatalogError(): ReactElement {
  const router = useRouter();
  return <ErrorState onRetry={() => router.refresh()} />;
}
