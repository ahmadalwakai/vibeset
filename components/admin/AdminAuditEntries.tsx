'use client';

import { Box, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { Link } from '@/i18n/navigation';
import type { AdminAuditEntry } from '@/lib/admin';
import { formatDate } from '@/lib/utils/format';

export function AdminAuditEntries({
  entries,
}: {
  entries: readonly AdminAuditEntry[];
}): ReactElement {
  const t = useTranslations('admin.editor'),
    common = useTranslations('admin.common'),
    locale = useLocale();
  if (!entries.length)
    return (
      <Text textStyle="body.sm" color="fg.muted">
        {t('noHistory')}
      </Text>
    );
  return (
    <Stack as="ol" ps="0" listStyleType="none" gap="3">
      {entries.map((entry) => (
        <Stack
          as="li"
          key={entry.id}
          gap="2"
          p="4"
          rounded="card"
          borderWidth="hairline"
          borderColor="border"
          bg="bg.panel"
        >
          <Text textStyle="body.sm" fontWeight="medium" overflowWrap="anywhere">
            {entry.action}
          </Text>
          <Text textStyle="caption" color="fg.muted">
            {formatDate(entry.createdAt, locale, { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
            {entry.actorName ?? common('none')}
          </Text>
          {entry.entityType === 'theme' && entry.entityId ? (
            <Box asChild minH="11" display="inline-flex" alignItems="center">
              <Link href={`/admin/themes/${entry.entityId}`}>{entry.entityId}</Link>
            </Box>
          ) : null}
          <Box as="details">
            <Box as="summary" minH="11" cursor="pointer">
              {t('historyMeta')}
            </Box>
            <Box
              as="pre"
              dir="ltr"
              textStyle="caption"
              whiteSpace="pre-wrap"
              overflowWrap="anywhere"
              maxH="64"
              overflowY="auto"
            >
              {JSON.stringify(entry.meta, null, 2)}
            </Box>
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}
