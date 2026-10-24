'use client';

import { Box } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AdminDownloadPoint } from '@/lib/admin';
import { formatDate, formatNumber } from '@/lib/utils/format';

export function DownloadsChartCanvas({
  data,
}: {
  data: readonly AdminDownloadPoint[];
}): ReactElement {
  const t = useTranslations('admin.dashboard'),
    locale = useLocale();
  return (
    <Box h="72" minW="0" w="full" dir="ltr" role="img" aria-label={t('downloadsChart')}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={[...data]}
          accessibilityLayer
          margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke="var(--chakra-colors-border)" vertical={false} />
          <XAxis
            dataKey="day"
            minTickGap={36}
            tick={{ fill: 'var(--chakra-colors-fg-muted)' }}
            tickFormatter={(day) =>
              formatDate(String(day), locale, { month: 'short', day: 'numeric' })
            }
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'var(--chakra-colors-fg-muted)' }}
            tickFormatter={(value) => formatNumber(Number(value), locale)}
          />
          <Tooltip
            labelFormatter={(day) => formatDate(String(day), locale)}
            contentStyle={{
              background: 'var(--chakra-colors-bg-panel)',
              borderColor: 'var(--chakra-colors-border)',
              color: 'var(--chakra-colors-fg)',
            }}
          />
          <Line
            type="monotone"
            dataKey="downloads"
            name={t('downloads')}
            stroke="var(--chakra-colors-brand-solid)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
