'use client';

import { Checkbox, Field, Input, NativeSelect, Stack, Text, Textarea } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useId } from 'react';
import type { ReactElement } from 'react';
import type { CreatorThemeDetails } from '@/lib/creator-studio';
import type { TagDTO } from '@/lib/dto';
import { localized } from '@/lib/utils/localized';

export function CreatorDetailsPanel({
  value,
  onChange,
  tags,
  invalid,
  invalidFields = [],
}: {
  value: CreatorThemeDetails;
  onChange: (value: CreatorThemeDetails) => void;
  tags: readonly TagDTO[];
  invalid: boolean;
  invalidFields?: readonly string[];
}): ReactElement {
  const t = useTranslations('creator.editor');
  const errors = useTranslations('errors');
  const locale = useLocale();
  const id = useId();
  return (
    <Stack gap="5">
      {(['nameEn', 'nameAr', 'descriptionEn', 'descriptionAr'] as const).map((key) => (
        <Field.Root
          key={key}
          invalid={
            invalidFields.includes(key) || (invalid && key === 'nameEn' && !value.nameEn.trim())
          }
        >
          <Field.Label htmlFor={`${id}-${key}`}>{t(key)}</Field.Label>
          {key.startsWith('description') ? (
            <Textarea
              id={`${id}-${key}`}
              value={value[key]}
              maxLength={2000}
              minH="32"
              dir={key.endsWith('Ar') ? 'rtl' : 'ltr'}
              onChange={(event) => onChange({ ...value, [key]: event.target.value })}
            />
          ) : (
            <Input
              id={`${id}-${key}`}
              value={value[key]}
              maxLength={60}
              minH="11"
              dir={key.endsWith('Ar') ? 'rtl' : 'ltr'}
              required={key === 'nameEn'}
              onChange={(event) => onChange({ ...value, [key]: event.target.value })}
            />
          )}
          <Field.ErrorText>{errors('VALIDATION')}</Field.ErrorText>
        </Field.Root>
      ))}
      <Field.Root
        invalid={invalidFields.includes('tagSlugs') || (invalid && !value.aesthetic)}
        required
      >
        <Field.Label htmlFor={`${id}-aesthetic`}>{t('aesthetic')}</Field.Label>
        <NativeSelect.Root size="lg">
          <NativeSelect.Field
            id={`${id}-aesthetic`}
            value={value.aesthetic}
            onChange={(event) => onChange({ ...value, aesthetic: event.target.value })}
          >
            <option value="">{t('requiredAesthetic')}</option>
            {tags
              .filter((tag) => tag.kind === 'aesthetic')
              .map((tag) => (
                <option key={tag.slug} value={tag.slug}>
                  {localized(tag, locale)}
                </option>
              ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Field.ErrorText>{t('requiredAesthetic')}</Field.ErrorText>
      </Field.Root>
      <Stack as="fieldset" gap="2">
        <Text as="legend" textStyle="body.sm" fontWeight="medium">
          {t('tags')}
        </Text>
        <Text textStyle="caption" color="fg.muted">
          {t('tagsLimit')}
        </Text>
        {invalidFields.includes('tagSlugs') ? (
          <Text role="alert" textStyle="body.sm" color="red.fg">
            {errors('VALIDATION')}
          </Text>
        ) : null}
        {tags
          .filter((tag) => tag.kind !== 'aesthetic')
          .map((tag) => (
            <Checkbox.Root
              key={tag.slug}
              colorPalette="brand"
              minH="11"
              checked={value.tags.includes(tag.slug)}
              disabled={!value.tags.includes(tag.slug) && value.tags.length >= 5}
              onCheckedChange={({ checked }) =>
                onChange({
                  ...value,
                  tags:
                    checked === true
                      ? [...value.tags, tag.slug]
                      : value.tags.filter((slug) => slug !== tag.slug),
                })
              }
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Label>{localized(tag, locale)}</Checkbox.Label>
            </Checkbox.Root>
          ))}
      </Stack>
    </Stack>
  );
}
