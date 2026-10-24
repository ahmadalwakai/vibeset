'use client';

import { Badge, Button, Flex, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { Link } from '@/i18n/navigation';
import type { AdminPage, AdminThemeOptions, AdminThemeRow } from '@/lib/admin';
import { formatDate, formatNumber } from '@/lib/utils/format';
import { localized } from '@/lib/utils/localized';
import type { AdminThemeListQuery } from '@/lib/validation/admin-queries';
import { AdminBulkActions } from './AdminBulkActions';
import { DataTable } from './DataTable';
import type { DataTableColumn } from './DataTable';

export function AdminThemesTable({
  data,
  options,
  query,
}: {
  data: AdminPage<AdminThemeRow>;
  options: AdminThemeOptions;
  query: AdminThemeListQuery;
}): ReactElement {
  const t = useTranslations('admin.themes'),
    common = useTranslations('admin.common'),
    status = useTranslations('creator.status');
  const locale = useLocale();
  const [selected, setSelected] = useState(new Set<string>()),
    [busy, setBusy] = useState(false);
  const columns: DataTableColumn<AdminThemeRow>[] = [
    {
      key: 'name',
      header: common('name'),
      render: (row) => (
        <Button
          asChild
          variant="ghost"
          minH="11"
          h="auto"
          whiteSpace="normal"
          justifyContent="start"
          px="0"
        >
          <Link href={`/admin/themes/${row.id}`}>{localized(row, locale)}</Link>
        </Button>
      ),
    },
    {
      key: 'status',
      header: common('status'),
      render: (row) => (
        <Flex gap="2" wrap="wrap">
          <Badge>{status(row.status)}</Badge>
          {row.stale ? <Badge colorPalette="orange">{common('stale')}</Badge> : null}
          {row.isFeatured ? <Badge colorPalette="brand">{common('featured')}</Badge> : null}
        </Flex>
      ),
    },
    {
      key: 'source',
      header: common('source'),
      render: (row) => <Text textStyle="body.sm">{common(`sources.${row.source}`)}</Text>,
    },
    {
      key: 'updated',
      header: common('updated'),
      render: (row) => <Text textStyle="body.sm">{formatDate(row.updatedAt, locale)}</Text>,
    },
  ];
  function pageHref(page: number): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined) params.set(key, String(value));
    params.set('page', String(page));
    return `/admin/themes?${params}`;
  }
  return (
    <Stack gap="5" pb="24">
      {data.items.length ? (
        <DataTable
          rows={data.items}
          columns={columns}
          getId={(row) => row.id}
          getLabel={(row) => localized(row, locale)}
          selected={selected}
          onSelection={setSelected}
          disabled={busy}
        />
      ) : (
        <EmptyState
          title={t('noResults')}
          action={
            <Button asChild minH="11">
              <Link href="/admin/themes">{t('clearFilters')}</Link>
            </Button>
          }
        />
      )}
      <Flex gap="3" align="center" justify="space-between" wrap="wrap">
        <Text textStyle="body.sm" color="fg.muted">
          {t('pagination', {
            page: formatNumber(data.page, locale),
            total: formatNumber(data.total, locale),
          })}
        </Text>
        <Flex gap="2">
          {data.page > 1 ? (
            <Button asChild minH="11" variant="outline" disabled={busy}>
              <Link href={pageHref(data.page - 1)}>{t('previous')}</Link>
            </Button>
          ) : null}
          {data.nextPage ? (
            <Button asChild minH="11" variant="outline" disabled={busy}>
              <Link href={pageHref(data.nextPage)}>{t('next')}</Link>
            </Button>
          ) : null}
        </Flex>
      </Flex>
      <AdminBulkActions
        ids={[...selected]}
        options={options}
        onBusyChange={setBusy}
        onCompleted={(result) =>
          setSelected(new Set(result.results.filter((item) => !item.ok).map((item) => item.id)))
        }
      />
    </Stack>
  );
}
