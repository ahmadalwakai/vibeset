import { randomUUID } from 'node:crypto';
import { Badge, Button, Field, Flex, Heading, NativeSelect, Stack, Text } from '@chakra-ui/react';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { Link } from '@/i18n/navigation';
import type { AdminPage } from '@/lib/admin';
import type { AdminGenerationRun, AdminGeneratorOption } from '@/lib/admin-operations';
import { formatDate, formatNumber } from '@/lib/utils/format';
import { localized } from '@/lib/utils/localized';
import type { AdminGenerationQuery } from '@/lib/validation/admin-operations';
import { GenerationRunLog, RefreshGenerationHistory } from './AdminGenerator';
import { AdminOperationsPager } from './AdminOperationsPager';

export async function AdminGeneratorHistory({
  page,
  query,
  options,
}: {
  page: AdminPage<AdminGenerationRun>;
  query: AdminGenerationQuery;
  options: readonly AdminGeneratorOption[];
}): Promise<ReactElement> {
  const [t, filters, locale] = await Promise.all([
    getTranslations('admin.generator'),
    getTranslations('admin.themes'),
    getLocale(),
  ]);
  const id = randomUUID();
  return (
    <Stack gap="4">
      <Heading as="h2" textStyle="display.lg">
        {t('history')}
      </Heading>
      <form method="get">
        <Flex gap="3" align="end" wrap="wrap">
          <Field.Root maxW="sm">
            <Field.Label htmlFor={id}>{t('aesthetic')}</Field.Label>
            <NativeSelect.Root>
              <NativeSelect.Field
                id={id}
                name="aesthetic"
                defaultValue={query.aesthetic ?? ''}
                minH="11"
              >
                <option value="">{t('all')}</option>
                {options.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {localized(option, locale)}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
          <Button type="submit" minH="11" colorPalette="brand">
            {filters('applyFilters')}
          </Button>
        </Flex>
      </form>
      <RefreshGenerationHistory />
      {!page.items.length ? (
        <EmptyState title={t('empty')} description={t('emptyBody')} />
      ) : (
        <Stack as="ol" p="0" listStyleType="none" gap="3">
          {page.items.map((run) => (
            <Stack
              as="li"
              key={run.id}
              gap="3"
              p="5"
              rounded="card"
              borderWidth="hairline"
              borderColor="border"
              bg="bg.panel"
            >
              <Flex gap="3" wrap="wrap" justify="space-between">
                <Heading as="h3" textStyle="heading.sm">
                  {run.aesthetic}
                </Heading>
                <Badge
                  colorPalette={
                    run.status === 'failed' ? 'red' : run.status === 'completed' ? 'green' : 'brand'
                  }
                >
                  {t(run.status)}
                </Badge>
              </Flex>
              <Text textStyle="caption" color="fg.muted">
                {formatDate(run.startedAt, locale, { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                {t('actor')}: {run.actorName ?? t('system')}
              </Text>
              <Flex gap="4" wrap="wrap">
                {(
                  [
                    ['seed', run.seed],
                    ['requested', run.requested],
                    ['created', run.created],
                    ['duplicates', run.skippedDuplicates],
                    ['qa', run.skippedQa],
                  ] as const
                ).map(([key, value]) => (
                  <Text key={key} textStyle="body.sm">
                    {t(key)}: {formatNumber(value, locale)}
                  </Text>
                ))}
              </Flex>
              <GenerationRunLog runId={run.id} />
              <Button asChild variant="outline" minH="11" alignSelf="start">
                <Link href={`/admin/review?run=${run.id}`}>{t('review')}</Link>
              </Button>
            </Stack>
          ))}
        </Stack>
      )}
      <AdminOperationsPager {...page} path="/admin/generator" query={query} />
    </Stack>
  );
}
