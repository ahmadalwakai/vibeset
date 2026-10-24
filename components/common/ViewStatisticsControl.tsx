'use client';

import { Checkbox, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { ReactElement } from 'react';
import { useViewStatisticsPreference } from '@/hooks/useViewStatisticsPreference';

export function ViewStatisticsControl(): ReactElement {
  const t = useTranslations('legal.statistics');
  const preference = useViewStatisticsPreference();
  const id = useId();
  return (
    <Stack
      as="section"
      id="view-statistics"
      aria-labelledby={`${id}-title`}
      gap="3"
      p={{ base: '5', md: '6' }}
      bg="bg.panel"
      rounded="card"
      borderWidth="hairline"
      borderColor="border"
    >
      <Text as="h2" id={`${id}-title`} textStyle="heading.md">
        {t('title')}
      </Text>
      <Text id={`${id}-description`} textStyle="body.sm" color="fg.muted">
        {t('description')}
      </Text>
      <Checkbox.Root
        checked={preference.enabled}
        disabled={!preference.ready}
        onCheckedChange={({ checked }) => preference.setEnabled(checked === true)}
        minH="11"
        colorPalette="brand"
      >
        <Checkbox.HiddenInput aria-describedby={`${id}-description ${id}-scope`} />
        <Checkbox.Control />
        <Checkbox.Label>{t('label')}</Checkbox.Label>
      </Checkbox.Root>
      <Text id={`${id}-scope`} textStyle="body.sm" color="fg.muted">
        {t('scope')}
      </Text>
      <Text textStyle="body.sm" role="status">
        {t(!preference.ready ? 'loading' : preference.enabled ? 'enabled' : 'disabled')}
      </Text>
      {preference.persistence === 'tab' ? (
        <Text textStyle="body.sm" color="fg.muted">
          {t('sessionOnly')}
        </Text>
      ) : null}
    </Stack>
  );
}
