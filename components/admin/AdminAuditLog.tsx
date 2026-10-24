import { randomUUID } from 'node:crypto';
import { Box, Button, Field, Flex, Input, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { Link } from '@/i18n/navigation';
import type { AdminAuditEntry, AdminPage } from '@/lib/admin';
import { adminEntityLink } from '@/lib/admin-entity-link';
import { formatDate } from '@/lib/utils/format';
import type { AdminAuditQuery } from '@/lib/validation/admin-operations';
import { AdminOperationsPager } from './AdminOperationsPager';

export async function AdminAuditLog({
  page,
  query,
}: {
  page: AdminPage<AdminAuditEntry>;
  query: AdminAuditQuery;
}): Promise<ReactElement> {
  const [t, locale] = await Promise.all([getTranslations('admin.audit'), getLocale()]);
  const id = randomUUID();
  return (
    <Stack gap="6">
      <form method="get">
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} gap="3">
          {(['actor', 'action', 'entityType', 'entityId', 'from', 'to'] as const).map((key) => (
            <Field.Root key={key}>
              <Field.Label htmlFor={`${id}-${key}`}>{t(key)}</Field.Label>
              <Input
                id={`${id}-${key}`}
                name={key}
                type={key === 'from' || key === 'to' ? 'date' : 'text'}
                dir="ltr"
                defaultValue={query[key] ?? ''}
                maxLength={256}
                minH="11"
              />
            </Field.Root>
          ))}
          <Flex gap="3" wrap="wrap">
            <Button type="submit" minH="11" colorPalette="brand">
              {t('apply')}
            </Button>
            <Button asChild minH="11" variant="outline">
              <Link href="/admin/audit">{t('reset')}</Link>
            </Button>
          </Flex>
        </SimpleGrid>
      </form>
      {!page.items.length ? (
        <EmptyState title={t('empty')} description={t('emptyBody')} />
      ) : (
        <Stack as="ol" p="0" listStyleType="none" gap="3">
          {page.items.map((entry) => {
            const href = adminEntityLink(entry.entityType, entry.entityId);
            return (
              <Stack
                as="li"
                key={entry.id}
                gap="2"
                p="5"
                rounded="card"
                borderWidth="hairline"
                borderColor="border"
                bg="bg.panel"
              >
                <Text textStyle="body.sm" fontWeight="medium" overflowWrap="anywhere">
                  {entry.action}
                </Text>
                <Text textStyle="caption" color="fg.muted">
                  {formatDate(entry.createdAt, locale, { dateStyle: 'medium', timeStyle: 'short' })}{' '}
                  · {entry.actorName ?? t('unknownActor')}
                </Text>
                <Text textStyle="caption" color="fg.muted" overflowWrap="anywhere">
                  {entry.actorId}
                </Text>
                <Text textStyle="body.sm" overflowWrap="anywhere">
                  {entry.entityType} · {entry.entityId}
                </Text>
                {href ? (
                  <Button asChild minH="11" variant="outline" alignSelf="start">
                    <Link href={href}>{t('openEntity')}</Link>
                  </Button>
                ) : null}
                <Box as="details">
                  <Box as="summary" minH="11" cursor="pointer">
                    {t('meta')}
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
            );
          })}
        </Stack>
      )}
      <AdminOperationsPager {...page} path="/admin/audit" query={query} />
    </Stack>
  );
}
