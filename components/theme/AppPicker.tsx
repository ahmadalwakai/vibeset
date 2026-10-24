'use client';

import {
  Box,
  Button,
  Checkbox,
  Field,
  Flex,
  Icon,
  IconButton,
  Input,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { matchesSearch } from '@/lib/client/icon-export-utils';
import type { AppDTO } from '@/lib/dto';
import type { ThemeExportSource } from '@/lib/theme-export';
import { MAX_CUSTOM_ICONS, MAX_SELECTED_APPS } from '@/lib/icon-export';
import type { IconSelection } from '@/lib/icon-export';
import { customIconSchema } from '@/lib/validation/icon-export';
import { formatNumber } from '@/lib/utils/format';
import { GlyphPicker } from './GlyphPicker';
import { IconPreview } from './IconPreview';

const CATEGORIES = [
  'ai',
  'education',
  'finance',
  'food',
  'games',
  'health',
  'lifestyle',
  'media',
  'messaging',
  'music',
  'news',
  'photo',
  'productivity',
  'shopping',
  'social',
  'system',
  'travel',
  'utilities',
  'other',
] as const;
type Category = (typeof CATEGORIES)[number];

function categoryFor(app: AppDTO): Category {
  return CATEGORIES.find((category) => category === app.category) ?? 'other';
}

export interface AppPickerProps {
  apps: readonly AppDTO[];
  selection: IconSelection;
  onSelectionChange: (selection: IconSelection) => void;
  theme: ThemeExportSource;
  platform: 'ios' | 'shaped';
  disabled?: boolean;
}

export function AppPicker({
  apps,
  selection,
  onSelectionChange,
  theme,
  platform,
  disabled = false,
}: AppPickerProps): ReactElement {
  const t = useTranslations('theme.icons');
  const common = useTranslations('common');
  const locale = useLocale();
  const id = useId();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [customOpen, setCustomOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [glyph, setGlyph] = useState<string | null>(null);
  const [invalid, setInvalid] = useState({ label: false, glyph: false });
  const categories = CATEGORIES.filter((category) =>
    apps.some((app) => categoryFor(app) === category),
  );
  const shown = apps.filter(
    (app) => (category === 'all' || categoryFor(app) === category) && matchesSearch(app, query),
  );
  const selected = new Set(selection.appSlugs);
  const atLimit = selection.appSlugs.length >= MAX_SELECTED_APPS;
  const customLimit = selection.custom.length >= MAX_CUSTOM_ICONS;

  function toggleApp(slug: string, checked: boolean): void {
    const appSlugs = checked
      ? [...selection.appSlugs, slug]
      : selection.appSlugs.filter((value) => value !== slug);
    onSelectionChange({
      ...selection,
      appSlugs: [...new Set(appSlugs)].slice(0, MAX_SELECTED_APPS),
    });
  }

  function addCustom(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (customLimit || disabled) return;
    const parsed = customIconSchema.safeParse({
      id: 'custom-' + crypto.randomUUID(),
      label,
      glyph,
    });
    if (!parsed.success) {
      setInvalid({
        label: parsed.error.issues.some(({ path }) => path[0] === 'label'),
        glyph: parsed.error.issues.some(({ path }) => path[0] === 'glyph'),
      });
      return;
    }
    onSelectionChange({ ...selection, custom: [...selection.custom, parsed.data] });
    setLabel('');
    setGlyph(null);
    setInvalid({ label: false, glyph: false });
    setCustomOpen(false);
  }

  return (
    <Stack gap="5">
      <Field.Root>
        <Field.Label htmlFor={id}>{t('searchLabel')}</Field.Label>
        <Input
          id={id}
          type="search"
          value={query}
          maxLength={100}
          placeholder={t('searchPlaceholder')}
          minH="11"
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Field.Root>
      <Flex gap="2" overflowX="auto" pb="2" role="group" aria-label={t('allCategories')}>
        <Button
          minH="11"
          rounded="chip"
          size="sm"
          flexShrink="0"
          variant={category === 'all' ? 'solid' : 'outline'}
          colorPalette="brand"
          aria-pressed={category === 'all'}
          disabled={disabled}
          onClick={() => setCategory('all')}
        >
          {t('allCategories')}
        </Button>
        {categories.map((item) => (
          <Button
            key={item}
            minH="11"
            rounded="chip"
            size="sm"
            flexShrink="0"
            variant={category === item ? 'solid' : 'outline'}
            colorPalette="brand"
            aria-pressed={category === item}
            disabled={disabled}
            onClick={() => setCategory(item)}
          >
            {t(`categories.${item}`)}
          </Button>
        ))}
      </Flex>
      <Flex gap="2" wrap="wrap" align="center" justify="space-between">
        <Text textStyle="body.sm" color="fg.muted" role="status">
          {t('selected', {
            count: formatNumber(selection.appSlugs.length + selection.custom.length, locale),
          })}
        </Text>
        <Flex gap="2" wrap="wrap">
          <Button
            variant="ghost"
            minH="11"
            size="sm"
            disabled={disabled || !shown.length}
            onClick={() =>
              onSelectionChange({
                ...selection,
                appSlugs: [
                  ...new Set([...selection.appSlugs, ...shown.map(({ slug }) => slug)]),
                ].slice(0, MAX_SELECTED_APPS),
              })
            }
          >
            {t('selectAll')}
          </Button>
          <Button
            variant="ghost"
            minH="11"
            size="sm"
            disabled={disabled || !selection.appSlugs.length}
            onClick={() => onSelectionChange({ ...selection, appSlugs: [] })}
          >
            {t('selectNone')}
          </Button>
        </Flex>
      </Flex>
      {shown.length ? (
        <SimpleGrid columns={{ base: 3, sm: 4 }} gap="2">
          {shown.map((app) => (
            <Checkbox.Root
              key={app.slug}
              checked={selected.has(app.slug)}
              onCheckedChange={({ checked }) => toggleApp(app.slug, checked === true)}
              disabled={disabled || (atLimit && !selected.has(app.slug))}
              position="relative"
              display="flex"
              flexDirection="column"
              gap="2"
              alignItems="center"
              minW="0"
              minH="24"
              p="3"
              rounded="input"
              borderWidth="hairline"
              borderColor={selected.has(app.slug) ? 'brand.solid' : 'border'}
              bg={selected.has(app.slug) ? 'brand.subtle' : 'bg.panel'}
              colorPalette="brand"
              cursor="pointer"
              _focusWithin={{
                outlineStyle: 'solid',
                outlineWidth: 'medium',
                outlineColor: 'brand.focusRing',
              }}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control position="absolute" top="1" insetEnd="1" boxSize="4">
                <Checkbox.Indicator />
              </Checkbox.Control>
              <IconPreview spec={theme.spec} glyph={app.glyph} platform={platform} label="" />
              <Checkbox.Label
                textStyle="caption"
                textAlign="center"
                maxW="full"
                lineClamp="2"
                overflowWrap="anywhere"
              >
                {app.name}
              </Checkbox.Label>
            </Checkbox.Root>
          ))}
        </SimpleGrid>
      ) : (
        <Text textStyle="body.sm" color="fg.muted" role="status">
          {apps.length ? t('noApps') : t('emptyCatalogue')}
        </Text>
      )}
      <Text textStyle="caption" color="fg.muted">
        {t('selectionLimit', { count: formatNumber(MAX_SELECTED_APPS, locale) })}
      </Text>
      <Stack gap="3" borderTopWidth="hairline" borderColor="border" pt="5">
        <Text as="h3" textStyle="heading.sm">
          {t('custom.title')}
        </Text>
        {selection.custom.map((custom) => (
          <Flex key={custom.id} gap="3" align="center" rounded="input" p="2" bg="bg.subtle">
            <IconPreview spec={theme.spec} glyph={custom.glyph} platform={platform} label="" />
            <Text textStyle="body.sm" flex="1" minW="0" overflowWrap="anywhere">
              {custom.label}
            </Text>
            <IconButton
              variant="ghost"
              rounded="button"
              minH="11"
              minW="11"
              aria-label={t('custom.remove', { label: custom.label })}
              disabled={disabled}
              onClick={() =>
                onSelectionChange({
                  ...selection,
                  custom: selection.custom.filter(({ id }) => id !== custom.id),
                })
              }
            >
              <Icon asChild boxSize="5">
                <TrashIcon aria-hidden />
              </Icon>
            </IconButton>
          </Flex>
        ))}
        {customLimit ? (
          <Text textStyle="body.sm" color="fg.muted">
            {t('custom.limit', { count: formatNumber(MAX_CUSTOM_ICONS, locale) })}
          </Text>
        ) : null}
        {!customOpen ? (
          <Button
            variant="outline"
            minH="11"
            rounded="button"
            disabled={disabled || customLimit}
            onClick={() => setCustomOpen(true)}
          >
            <Icon asChild boxSize="5">
              <PlusIcon aria-hidden />
            </Icon>
            {t('custom.add')}
          </Button>
        ) : (
          <Box borderWidth="hairline" borderColor="border" rounded="input" p="3">
            <form onSubmit={addCustom}>
              <Stack gap="4">
                <Field.Root invalid={invalid.label}>
                  <Field.Label htmlFor={id + '-custom'}>{t('custom.label')}</Field.Label>
                  <Input
                    id={id + '-custom'}
                    value={label}
                    maxLength={24}
                    placeholder={t('custom.labelPlaceholder')}
                    minH="11"
                    disabled={disabled}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                  {invalid.label ? (
                    <Field.ErrorText>{t('custom.invalidLabel')}</Field.ErrorText>
                  ) : null}
                </Field.Root>
                <GlyphPicker
                  value={glyph}
                  onChange={setGlyph}
                  spec={theme.spec}
                  platform={platform}
                  disabled={disabled}
                />
                {invalid.glyph ? (
                  <Text textStyle="body.sm" color="red.fg" role="alert">
                    {t('custom.chooseGlyph')}
                  </Text>
                ) : null}
                <Flex gap="2" wrap="wrap">
                  <Button type="submit" colorPalette="brand" minH="11" disabled={disabled}>
                    {t('custom.addIcon')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    minH="11"
                    onClick={() => setCustomOpen(false)}
                  >
                    {common('cancel')}
                  </Button>
                </Flex>
              </Stack>
            </form>
          </Box>
        )}
      </Stack>
    </Stack>
  );
}
