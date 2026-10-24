'use client';

import { Checkbox, Field, Input, NativeSelect, Stack, Textarea } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useId } from 'react';
import type { ReactElement } from 'react';
import type { AdminTagDTO } from '@/lib/admin';
import type { AdminThemeDetails } from '@/lib/admin-theme-editor';
import { localized } from '@/lib/utils/localized';

export function AdminMetadataPanel({
  value,
  onChange,
  tags,
  slug,
  invalidFields,
}: {
  value: AdminThemeDetails;
  onChange: (value: AdminThemeDetails) => void;
  tags: readonly AdminTagDTO[];
  slug: string;
  invalidFields: readonly string[];
}): ReactElement {
  const t = useTranslations('admin.editor'),
    common = useTranslations('admin.common'),
    errors = useTranslations('errors'),
    locale = useLocale(),
    id = useId();
  const aesthetic =
    value.tagSlugs.find((slug) =>
      tags.some((tag) => tag.slug === slug && tag.kind === 'aesthetic'),
    ) ?? '';
  const tagLabel = (tag: AdminTagDTO): string =>
    `${localized(tag, locale)}${tag.isActive ? '' : ` · ${common('inactive')}`}`;
  return (
    <Stack gap="5">
      <Field.Root>
        <Field.Label htmlFor={`${id}-slug`}>{t('slug')}</Field.Label>
        <Input id={`${id}-slug`} value={slug} readOnly dir="ltr" minH="11" />
        <Field.HelperText>{t('slugHint')}</Field.HelperText>
      </Field.Root>
      {(['nameEn', 'nameAr', 'descriptionEn', 'descriptionAr'] as const).map((key) => (
        <Field.Root key={key} invalid={invalidFields.includes(key)} required={key === 'nameEn'}>
          <Field.Label htmlFor={`${id}-${key}`}>{t(key)}</Field.Label>
          {key.startsWith('description') ? (
            <Textarea
              id={`${id}-${key}`}
              value={value[key]}
              dir={key.endsWith('Ar') ? 'rtl' : 'ltr'}
              maxLength={2000}
              minH="32"
              onChange={(event) => onChange({ ...value, [key]: event.target.value })}
            />
          ) : (
            <Input
              id={`${id}-${key}`}
              value={value[key]}
              dir={key.endsWith('Ar') ? 'rtl' : 'ltr'}
              maxLength={60}
              minH="11"
              onChange={(event) => onChange({ ...value, [key]: event.target.value })}
            />
          )}
          <Field.ErrorText>{errors('VALIDATION')}</Field.ErrorText>
        </Field.Root>
      ))}
      <Field.Root invalid={invalidFields.includes('tagSlugs')} required>
        <Field.Label htmlFor={`${id}-aesthetic`}>{t('aesthetic')}</Field.Label>
        <NativeSelect.Root size="lg">
          <NativeSelect.Field
            id={`${id}-aesthetic`}
            value={aesthetic}
            onChange={(event) =>
              onChange({
                ...value,
                tagSlugs: [
                  ...value.tagSlugs.filter(
                    (slug) => !tags.some((tag) => tag.slug === slug && tag.kind === 'aesthetic'),
                  ),
                  ...(event.target.value ? [event.target.value] : []),
                ],
              })
            }
          >
            <option value="">{common('none')}</option>
            {tags
              .filter((tag) => tag.kind === 'aesthetic')
              .map((tag) => (
                <option
                  key={tag.slug}
                  value={tag.slug}
                  disabled={!tag.isActive && aesthetic !== tag.slug}
                >
                  {tagLabel(tag)}
                </option>
              ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Field.ErrorText>{errors('VALIDATION')}</Field.ErrorText>
      </Field.Root>
      <Stack as="fieldset" gap="2">
        <legend>{t('tags')}</legend>
        {tags
          .filter((tag) => tag.kind !== 'aesthetic')
          .map((tag) => (
            <Checkbox.Root
              key={tag.slug}
              checked={value.tagSlugs.includes(tag.slug)}
              disabled={!tag.isActive && !value.tagSlugs.includes(tag.slug)}
              onCheckedChange={({ checked }) =>
                onChange({
                  ...value,
                  tagSlugs:
                    checked === true
                      ? [...value.tagSlugs, tag.slug]
                      : value.tagSlugs.filter((slug) => slug !== tag.slug),
                })
              }
              minH="11"
              colorPalette="brand"
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Label>{tagLabel(tag)}</Checkbox.Label>
            </Checkbox.Root>
          ))}
      </Stack>
      <Checkbox.Root
        checked={value.isFeatured}
        onCheckedChange={({ checked }) => onChange({ ...value, isFeatured: checked === true })}
        minH="11"
        colorPalette="brand"
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Label>{t('featured')}</Checkbox.Label>
      </Checkbox.Root>
    </Stack>
  );
}
