import { randomUUID } from 'node:crypto';
import { Button, Field, Flex, Input, NativeSelect, SimpleGrid } from '@chakra-ui/react';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { Link } from '@/i18n/navigation';
import type { AdminThemeOptions } from '@/lib/admin';
import { THEME_STATUSES, themeSourceSchema } from '@/lib/theme-status';
import { formatDate } from '@/lib/utils/format';
import { localized } from '@/lib/utils/localized';
import { ADMIN_THEME_SORTS } from '@/lib/validation/admin-queries';
import type { AdminThemeListQuery } from '@/lib/validation/admin-queries';
import { COLOR_FAMILIES } from '@/lib/validation/themes';

export async function AdminThemeFilters({
  query,
  options,
}: {
  query: AdminThemeListQuery;
  options: AdminThemeOptions;
}): Promise<ReactElement> {
  const [t, common, status, explore, locale] = await Promise.all([
    getTranslations('admin.themes'),
    getTranslations('admin.common'),
    getTranslations('creator.status'),
    getTranslations('explore'),
    getLocale(),
  ]);
  const id = randomUUID();
  const selects = [
    { key: 'status', values: THEME_STATUSES.map((value) => ({ value, label: status(value) })) },
    {
      key: 'source',
      values: themeSourceSchema.options.map((value) => ({
        value,
        label: common(`sources.${value}`),
      })),
    },
    {
      key: 'aesthetic',
      values: options.tags
        .filter((tag) => tag.kind === 'aesthetic')
        .map((tag) => ({ value: tag.slug, label: localized(tag, locale) })),
    },
    {
      key: 'color',
      values: COLOR_FAMILIES.map((value) => ({ value, label: explore(`colors.${value}`) })),
    },
    ...(['featured', 'stale'] as const).map((key) => ({
      key,
      values: [
        { value: 'true', label: common('yes') },
        { value: 'false', label: common('no') },
      ],
    })),
    {
      key: 'run',
      values: [
        ...(query.run && !options.runs.some((run) => run.id === query.run)
          ? [{ value: query.run, label: query.run }]
          : []),
        ...options.runs.map((run) => ({
          value: run.id,
          label: `${run.aesthetic} · ${formatDate(run.startedAt, locale)}`,
        })),
      ],
    },
    {
      key: 'sort',
      values: ADMIN_THEME_SORTS.map((value) => ({ value, label: t(`${value}Sort`) })),
    },
  ] as const;
  return (
    <form method="get">
      <SimpleGrid columns={{ base: 1, sm: 2, xl: 3 }} gap="3">
        <Field.Root>
          <Field.Label htmlFor={`${id}-search`}>{t('search')}</Field.Label>
          <Input
            id={`${id}-search`}
            name="q"
            defaultValue={query.q ?? ''}
            maxLength={120}
            minH="11"
          />
        </Field.Root>
        {selects.map((select) => (
          <Field.Root key={select.key}>
            <Field.Label htmlFor={`${id}-${select.key}`}>{t(select.key)}</Field.Label>
            <NativeSelect.Root size="lg">
              <NativeSelect.Field
                id={`${id}-${select.key}`}
                name={select.key}
                defaultValue={String(query[select.key] ?? '')}
              >
                {select.key !== 'sort' ? <option value="">{t('all')}</option> : null}
                {select.values.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
        ))}
        <Flex gap="2" align="end">
          <Button type="submit" minH="11" colorPalette="brand">
            {t('applyFilters')}
          </Button>
          <Button asChild variant="outline" minH="11">
            <Link href="/admin/themes">{t('clearFilters')}</Link>
          </Button>
        </Flex>
      </SimpleGrid>
    </form>
  );
}
