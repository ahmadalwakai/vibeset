'use client';
import { Button, Flex, Heading, Input, Link as ChakraLink, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import { Link, useRouter } from '@/i18n/navigation';
import type { AdminCollectionPage } from '@/lib/admin-content';
import { localized } from '@/lib/utils/localized';
import { formatNumber } from '@/lib/utils/format';
import { AdminCollectionForm } from './AdminCollectionForm';

export function AdminCollections({
  data,
  q = '',
}: {
  data: AdminCollectionPage;
  q?: string;
}): ReactElement {
  const t = useTranslations('admin.collections'),
    locale = useLocale(),
    router = useRouter();
  const [create, setCreate] = useState(false);
  const createBusy = useRef(false);
  const pageHref = (page: number): string =>
    `/admin/collections?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page) })}`;
  return (
    <Stack gap="5">
      <Flex gap="3" flexWrap="wrap" justify="space-between">
        <form method="get">
          <Flex gap="2">
            <Input
              name="q"
              type="search"
              defaultValue={q}
              maxLength={120}
              aria-label={t('search')}
              placeholder={t('search')}
              minH="11"
            />
            <Button type="submit" minH="11">
              {t('search')}
            </Button>
          </Flex>
        </form>
        <Button colorPalette="brand" minH="11" onClick={() => setCreate(true)}>
          {t('create')}
        </Button>
      </Flex>
      {data.items.length ? (
        <Stack gap="4">
          {data.items.map((row) => (
            <Stack
              key={row.id}
              p="5"
              borderWidth="hairline"
              borderColor="border"
              rounded="card"
              bg="bg.panel"
            >
              <Heading as="h2" textStyle="heading.sm">
                <ChakraLink asChild display="inline-flex" minH="11">
                  <Link href={`/admin/collections/${row.id}`}>
                    {localized(row, locale, 'title')}
                  </Link>
                </ChakraLink>
              </Heading>
              <Text textStyle="body.sm">
                {t(row.kind)} · {t(row.visibility)} ·{' '}
                {t('itemCount', {
                  count: formatNumber(row.itemCount, locale),
                  published: formatNumber(row.publishedCount, locale),
                })}
              </Text>
              {row.isPinned ? (
                <Text textStyle="caption" color="brand.fg">
                  {t('pinned')}
                </Text>
              ) : null}
              {row.kind === 'seasonal' ? (
                <Text textStyle="caption" color="fg.muted" dir="ltr">
                  {row.startsAt ?? '—'} / {row.endsAt ?? '—'}
                </Text>
              ) : null}
            </Stack>
          ))}
        </Stack>
      ) : (
        <Text>{t('empty')}</Text>
      )}
      <Flex gap="3">
        <Button asChild minH="11" variant="outline" disabled={data.page === 1}>
          <Link href={pageHref(Math.max(1, data.page - 1))} aria-disabled={data.page === 1}>
            {t('previous')}
          </Link>
        </Button>
        {data.nextPage ? (
          <Button asChild minH="11" variant="outline">
            <Link href={pageHref(data.nextPage)}>{t('next')}</Link>
          </Button>
        ) : null}
      </Flex>
      <ResponsiveSheet
        open={create}
        onOpenChange={(open) => {
          if (!createBusy.current) setCreate(open);
        }}
        title={t('create')}
      >
        <AdminCollectionForm
          onBusyChange={(pending) => {
            createBusy.current = pending;
          }}
          onSaved={(id) => {
            setCreate(false);
            router.push(`/admin/collections/${id}`);
          }}
        />
      </ResponsiveSheet>
    </Stack>
  );
}
