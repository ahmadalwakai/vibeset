'use client';
import { Button, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { AdminCollection } from '@/lib/admin-content';
import {
  adminUpsertCollectionSchema,
  adminUtcDateInput,
  type AdminUpsertCollectionInput,
} from '@/lib/validation/admin-content';
import { adminUpsertCollection } from '@/server/actions/admin/collections';
import { useContentMutation } from '@/hooks/useContentMutation';
import { ContentCheck, ContentSelect, ContentTextField } from './ContentFields';
import { PublishedThemePicker } from './PublishedThemePicker';

export function AdminCollectionForm({
  collection,
  onSaved,
  onBusyChange,
}: {
  collection?: AdminCollection;
  onSaved: (id: string) => void;
  onBusyChange?: (pending: boolean) => void;
}): ReactElement {
  const t = useTranslations('admin.collections'),
    errors = useTranslations('errors');
  const [value, setValue] = useState<AdminUpsertCollectionInput>({
    ...(collection ? { id: collection.id } : {}),
    slug: collection?.slug ?? '',
    kind: collection?.kind ?? 'editorial',
    visibility: collection?.visibility ?? 'private',
    titleEn: collection?.titleEn ?? '',
    titleAr: collection?.titleAr ?? null,
    descriptionEn: collection?.descriptionEn ?? null,
    descriptionAr: collection?.descriptionAr ?? null,
    coverThemeId: collection?.coverThemeId ?? null,
    isPinned: collection?.isPinned ?? false,
    sortOrder: collection?.sortOrder ?? 0,
    startsAt: collection?.startsAt ?? null,
    endsAt: collection?.endsAt ?? null,
  });
  const [coverOpen, setCoverOpen] = useState(false);
  const mutation = useContentMutation(onBusyChange);
  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void mutation.run(adminUpsertCollectionSchema, value, adminUpsertCollection, (result) =>
            onSaved(result.id),
          );
        }}
      >
        <Stack gap="4">
          <fieldset disabled={mutation.pending}>
            <Stack gap="4">
              <ContentTextField
                label={t('slug')}
                value={value.slug}
                onChange={(slug) => setValue((previous) => ({ ...previous, slug }))}
                maxLength={120}
                dir="ltr"
                invalid={mutation.fields.includes('slug')}
                helper={collection?.visibility === 'public' ? t('renameHint') : undefined}
              />
              <ContentSelect
                label={t('kind')}
                value={value.kind}
                onChange={(kind) =>
                  setValue((previous) => ({
                    ...previous,
                    kind: kind === 'seasonal' ? 'seasonal' : 'editorial',
                    startsAt: null,
                    endsAt: null,
                  }))
                }
              >
                <option value="editorial">{t('editorial')}</option>
                <option value="seasonal">{t('seasonal')}</option>
              </ContentSelect>
              <ContentSelect
                label={t('visibility')}
                value={value.visibility}
                onChange={(visibility) =>
                  setValue((previous) => ({
                    ...previous,
                    visibility: visibility === 'public' ? 'public' : 'private',
                  }))
                }
              >
                <option value="private">{t('private')}</option>
                <option value="public">{t('public')}</option>
              </ContentSelect>
              {(['titleEn', 'titleAr', 'descriptionEn', 'descriptionAr'] as const).map((key) => (
                <ContentTextField
                  key={key}
                  label={t(key)}
                  value={value[key] ?? ''}
                  onChange={(text) => setValue((previous) => ({ ...previous, [key]: text }))}
                  multiline={key.startsWith('description')}
                  maxLength={key.startsWith('description') ? 4000 : 120}
                  dir={key.endsWith('Ar') ? 'rtl' : 'ltr'}
                  invalid={mutation.fields.includes(key)}
                />
              ))}
              <ContentCheck
                label={t('pinned')}
                checked={value.isPinned}
                onChange={(isPinned) => setValue((previous) => ({ ...previous, isPinned }))}
              />
              <ContentTextField
                label={t('sortOrder')}
                type="number"
                value={String(value.sortOrder)}
                onChange={(sortOrder) =>
                  setValue((previous) => ({ ...previous, sortOrder: Number(sortOrder) }))
                }
                invalid={mutation.fields.includes('sortOrder')}
              />
              {value.kind === 'seasonal' ? (
                <>
                  <Text textStyle="caption" color="fg.muted">
                    {t('windowHint')}
                  </Text>
                  {(['startsAt', 'endsAt'] as const).map((key) => (
                    <ContentTextField
                      key={key}
                      label={t(key)}
                      type="datetime-local"
                      value={value[key]?.slice(0, 16) ?? ''}
                      onChange={(date) =>
                        setValue((previous) => ({
                          ...previous,
                          [key]: adminUtcDateInput(date),
                        }))
                      }
                      invalid={mutation.fields.includes(key)}
                    />
                  ))}
                </>
              ) : null}
              <Stack>
                <Text textStyle="body.sm">{t('cover')}</Text>
                {value.coverThemeId ? (
                  <Text textStyle="caption" wordBreak="break-all">
                    {t('coverValue', { id: value.coverThemeId })}
                  </Text>
                ) : null}
                <Button minH="11" variant="outline" onClick={() => setCoverOpen(true)}>
                  {t('chooseCover')}
                </Button>
                <Button
                  minH="11"
                  variant="ghost"
                  disabled={!value.coverThemeId}
                  onClick={() => setValue((previous) => ({ ...previous, coverThemeId: null }))}
                >
                  {t('clearCover')}
                </Button>
              </Stack>
            </Stack>
          </fieldset>
          {mutation.error ? (
            <Text role="alert" color="red.fg">
              {errors(mutation.error)}
            </Text>
          ) : null}
          <Button type="submit" colorPalette="brand" minH="11" loading={mutation.pending}>
            {t('save')}
          </Button>
        </Stack>
      </form>
      <PublishedThemePicker
        open={coverOpen}
        onOpenChange={setCoverOpen}
        onPick={(theme) => {
          setValue((previous) => ({ ...previous, coverThemeId: theme.id }));
          setCoverOpen(false);
        }}
      />
    </>
  );
}
