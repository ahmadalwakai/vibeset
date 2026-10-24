'use client';

import { Box, Button, Flex, NativeSelect, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import type { AdminPage } from '@/lib/admin';
import { formatNumber } from '@/lib/utils/format';

export function ModerationPager<T>({
  data,
  path,
  query,
}: {
  data: AdminPage<T>;
  path: string;
  query: Record<string, string | number | boolean | undefined>;
}): ReactElement {
  const t = useTranslations('admin.users'),
    locale = useLocale();
  const href = (page: number): string => {
    const params = new URLSearchParams();
    const values: Record<string, string | number | boolean | undefined> = { ...query, page };
    for (const [key, value] of Object.entries(values))
      if (value !== undefined && value !== '') params.set(key, String(value));
    return `${path}?${params}`;
  };
  return (
    <Flex gap="3" justify="space-between" align="center" wrap="wrap">
      <Text textStyle="body.sm" color="fg.muted">
        {t('page', {
          page: formatNumber(data.page, locale),
          total: formatNumber(data.total, locale),
        })}
      </Text>
      <Flex gap="2">
        <Button asChild variant="outline" minH="11" disabled={data.page <= 1}>
          <Link
            href={href(data.page - 1)}
            aria-disabled={data.page <= 1}
            tabIndex={data.page <= 1 ? -1 : undefined}
            onClick={(event) => {
              if (data.page <= 1) event.preventDefault();
            }}
          >
            {t('previous')}
          </Link>
        </Button>
        <Button asChild variant="outline" minH="11" disabled={!data.nextPage}>
          <Link
            href={href(data.nextPage ?? data.page)}
            aria-disabled={!data.nextPage}
            tabIndex={!data.nextPage ? -1 : undefined}
            onClick={(event) => {
              if (!data.nextPage) event.preventDefault();
            }}
          >
            {t('next')}
          </Link>
        </Button>
      </Flex>
    </Flex>
  );
}
export function ModerationValue({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Stack gap="1">
      <Text textStyle="caption" color="fg.muted">
        {label}
      </Text>
      <Box overflowWrap="anywhere">{children}</Box>
    </Stack>
  );
}
export function ModerationSelect({
  id,
  name,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  name?: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange?: (value: string) => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <Stack gap="2">
      <Text asChild textStyle="body.sm">
        <label htmlFor={id}>{label}</label>
      </Text>
      <NativeSelect.Root size="lg" disabled={disabled}>
        <NativeSelect.Field
          id={id}
          name={name}
          {...(onChange
            ? { value, onChange: (event) => onChange(event.target.value) }
            : { defaultValue: value })}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Stack>
  );
}
