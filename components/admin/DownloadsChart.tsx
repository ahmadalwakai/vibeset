'use client';

import { Skeleton } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';
import type { AdminDownloadPoint } from '@/lib/admin';

const Chart = dynamic(
  () => import('./DownloadsChartCanvas').then((module) => module.DownloadsChartCanvas),
  { loading: () => <Skeleton h="72" rounded="card" /> },
);
export function DownloadsChart({ data }: { data: readonly AdminDownloadPoint[] }): ReactElement {
  return <Chart data={data} />;
}
