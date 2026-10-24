'use client';

import {
  Box,
  Button,
  Checkbox,
  Field,
  Heading,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { AdminHeroOption } from '@/lib/admin-operations';
import type { ErrorMessageCode } from '@/lib/result';
import type { Settings } from '@/lib/settings';
import { localized } from '@/lib/utils/localized';
import { adminUpdateSettingSchema } from '@/lib/validation/admin-operations';
import type { AdminUpdateSettingInput } from '@/lib/validation/admin-operations';
import { adminUpdateSetting } from '@/server/actions/admin/settings';

function useSettingSave(): {
  pending: boolean;
  error: ErrorMessageCode | null;
  saved: boolean;
  fields: ReadonlySet<string>;
  edited: () => void;
  save: (value: AdminUpdateSettingInput) => Promise<void>;
} {
  const [pending, setPending] = useState(false),
    [error, setError] = useState<ErrorMessageCode | null>(null),
    [saved, setSaved] = useState(false);
  const [fields, setFields] = useState<ReadonlySet<string>>(new Set());
  const mounted = useRef(false),
    running = useRef(false),
    router = useRouter();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function save(raw: AdminUpdateSettingInput): Promise<void> {
    if (running.current) return;
    setSaved(false);
    setError(null);
    setFields(new Set());
    const parsed = adminUpdateSettingSchema.safeParse(raw);
    if (!parsed.success) {
      setError('VALIDATION');
      setFields(
        new Set(
          parsed.error.issues.flatMap((issue) =>
            typeof issue.path[1] === 'string' ? [issue.path[1]] : [],
          ),
        ),
      );
      return;
    }
    running.current = true;
    setPending(true);
    try {
      const result = await adminUpdateSetting(parsed.data);
      if (!mounted.current) return;
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error.code);
        setFields(
          new Set(
            Object.keys(result.error.fieldErrors ?? {}).map((field) =>
              field.replace(/^value\./, ''),
            ),
          ),
        );
      }
    } catch {
      if (mounted.current) setError('NETWORK');
    } finally {
      running.current = false;
      if (mounted.current) setPending(false);
    }
  }
  function edited(): void {
    setSaved(false);
    setError(null);
    setFields(new Set());
  }
  return { pending, error, saved, fields, edited, save };
}
function SaveFeedback({
  error,
  saved,
}: {
  error: ErrorMessageCode | null;
  saved: boolean;
}): ReactElement | null {
  const errors = useTranslations('errors'),
    t = useTranslations('admin.settings');
  if (error)
    return (
      <Text role="alert" textStyle="body.sm" color="red.fg">
        {errors(error)}
      </Text>
    );
  return saved ? (
    <Text role="status" textStyle="body.sm" color="green.fg">
      {t('saved')}
    </Text>
  ) : null;
}
function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
}): ReactElement {
  return (
    <Checkbox.Root
      checked={checked}
      onCheckedChange={({ checked: value }) => onChange(value === true)}
      disabled={disabled}
      minH="11"
      colorPalette="brand"
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Label>{label}</Checkbox.Label>
    </Checkbox.Root>
  );
}
function HeroSettings({
  initial,
  options,
}: {
  initial: Settings['home.hero'];
  options: readonly AdminHeroOption[];
}): ReactElement {
  const t = useTranslations('admin.settings'),
    locale = useLocale(),
    id = useId(),
    state = useSettingSave();
  const [slug, setSlug] = useState(initial.collectionSlug ?? '');
  return (
    <Box asChild>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void state.save({ key: 'home.hero', value: { collectionSlug: slug || null } });
        }}
      >
        <Stack
          gap="4"
          p="5"
          rounded="card"
          borderWidth="hairline"
          borderColor="border"
          bg="bg.panel"
        >
          <Heading as="h2" textStyle="heading.md">
            {t('hero')}
          </Heading>
          <Field.Root invalid={state.error === 'VALIDATION'}>
            <Field.Label htmlFor={id}>{t('heroCollection')}</Field.Label>
            <NativeSelect.Root disabled={state.pending}>
              <NativeSelect.Field
                id={id}
                value={slug}
                onChange={(event) => {
                  state.edited();
                  setSlug(event.target.value);
                }}
                minH="11"
              >
                <option value="">{t('automatic')}</option>
                {slug && !options.some((option) => option.slug === slug) ? (
                  <option value={slug}>{slug}</option>
                ) : null}
                {options.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {localized(option, locale, 'title')}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
            <Field.HelperText>{t('heroHint')}</Field.HelperText>
            {state.error === 'VALIDATION' ? (
              <Field.ErrorText>{t('invalid')}</Field.ErrorText>
            ) : null}
          </Field.Root>
          <Button
            type="submit"
            minH="11"
            alignSelf="start"
            colorPalette="brand"
            loading={state.pending}
          >
            {t('saveHero')}
          </Button>
          <SaveFeedback {...state} />
        </Stack>
      </form>
    </Box>
  );
}
function AnnouncementSettings({
  initial,
}: {
  initial: Settings['home.announcement'];
}): ReactElement {
  const t = useTranslations('admin.settings'),
    id = useId(),
    state = useSettingSave();
  const [value, setValue] = useState(initial);
  function update(patch: Partial<Settings['home.announcement']>): void {
    state.edited();
    setValue({ ...value, ...patch });
  }
  const tone = {
    info: 'brand.subtle',
    celebrate: 'peach.subtle',
    warning: 'yellow.subtle',
  } as const;
  return (
    <Box asChild>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void state.save({ key: 'home.announcement', value });
        }}
      >
        <Stack
          gap="4"
          p="5"
          rounded="card"
          borderWidth="hairline"
          borderColor="border"
          bg="bg.panel"
        >
          <Heading as="h2" textStyle="heading.md">
            {t('announcement')}
          </Heading>
          <Toggle
            label={t('announcementEnabled')}
            checked={value.enabled}
            disabled={state.pending}
            onChange={(enabled) => update({ enabled })}
          />
          <SimpleGrid columns={{ base: 1, lg: 2 }} gap="4">
            {(['textEn', 'textAr'] as const).map((key) => (
              <Field.Root key={key} invalid={state.fields.has(key)}>
                <Field.Label htmlFor={`${id}-${key}`}>{t(key)}</Field.Label>
                <Textarea
                  id={`${id}-${key}`}
                  dir={key === 'textAr' ? 'rtl' : 'ltr'}
                  lang={key === 'textAr' ? 'ar' : 'en'}
                  value={value[key]}
                  maxLength={280}
                  disabled={state.pending}
                  minH="24"
                  onChange={(event) => update({ [key]: event.target.value })}
                />
                {state.fields.has(key) ? <Field.ErrorText>{t('invalid')}</Field.ErrorText> : null}
              </Field.Root>
            ))}
          </SimpleGrid>
          <Text textStyle="caption" color="fg.muted">
            {t('textHint')}
          </Text>
          <Field.Root invalid={state.fields.has('href')}>
            <Field.Label htmlFor={`${id}-href`}>{t('link')}</Field.Label>
            <Input
              id={`${id}-href`}
              dir="ltr"
              maxLength={2048}
              value={value.href ?? ''}
              disabled={state.pending}
              minH="11"
              onChange={(event) => update({ href: event.target.value || null })}
            />
            <Field.HelperText>{t('linkHint')}</Field.HelperText>
            {state.fields.has('href') ? <Field.ErrorText>{t('invalid')}</Field.ErrorText> : null}
          </Field.Root>
          <Field.Root>
            <Field.Label htmlFor={`${id}-tone`}>{t('tone')}</Field.Label>
            <NativeSelect.Root disabled={state.pending}>
              <NativeSelect.Field
                id={`${id}-tone`}
                value={value.tone}
                minH="11"
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === 'info' || next === 'celebrate' || next === 'warning')
                    update({ tone: next });
                }}
              >
                {(['info', 'celebrate', 'warning'] as const).map((item) => (
                  <option key={item} value={item}>
                    {t(item)}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
          <Stack gap="3">
            <Heading as="h3" textStyle="heading.sm">
              {t('preview')}
            </Heading>
            {(['en', 'ar'] as const).map((language) => (
              <Stack key={language} gap="2">
                <Text textStyle="caption" color="fg.muted">
                  {t(language === 'ar' ? 'arabicPreview' : 'englishPreview')}
                </Text>
                <Box
                  dir={language === 'ar' ? 'rtl' : 'ltr'}
                  lang={language}
                  bg={tone[value.tone]}
                  rounded="card"
                  p="4"
                >
                  <Text
                    textStyle="body.sm"
                    textAlign="start"
                    overflowWrap="anywhere"
                    textDecoration={value.href ? 'underline' : undefined}
                  >
                    {value[language === 'ar' ? 'textAr' : 'textEn'] || t('previewEmpty')}
                  </Text>
                </Box>
              </Stack>
            ))}
          </Stack>
          <Button
            type="submit"
            minH="11"
            alignSelf="start"
            colorPalette="brand"
            loading={state.pending}
          >
            {t('saveAnnouncement')}
          </Button>
          <SaveFeedback {...state} />
        </Stack>
      </form>
    </Box>
  );
}
function FeatureSettings({ initial }: { initial: Settings['features'] }): ReactElement {
  const t = useTranslations('admin.settings'),
    state = useSettingSave(),
    [value, setValue] = useState(initial);
  return (
    <Box asChild>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void state.save({ key: 'features', value });
        }}
      >
        <Stack
          gap="4"
          p="5"
          rounded="card"
          borderWidth="hairline"
          borderColor="border"
          bg="bg.panel"
        >
          <Heading as="h2" textStyle="heading.md">
            {t('features')}
          </Heading>
          {(['creatorApplicationsOpen', 'uploadsEnabled', 'reportsEnabled'] as const).map((key) => (
            <Toggle
              key={key}
              label={t(key)}
              checked={value[key]}
              disabled={state.pending}
              onChange={(checked) => {
                state.edited();
                setValue({ ...value, [key]: checked });
              }}
            />
          ))}
          <Button
            type="submit"
            minH="11"
            alignSelf="start"
            colorPalette="brand"
            loading={state.pending}
          >
            {t('saveFeatures')}
          </Button>
          <SaveFeedback {...state} />
        </Stack>
      </form>
    </Box>
  );
}
export function AdminSettings({
  initial,
  heroOptions,
}: {
  initial: Settings;
  heroOptions: readonly AdminHeroOption[];
}): ReactElement {
  return (
    <Stack gap="6">
      <HeroSettings initial={initial['home.hero']} options={heroOptions} />
      <AnnouncementSettings initial={initial['home.announcement']} />
      <FeatureSettings initial={initial.features} />
    </Stack>
  );
}
