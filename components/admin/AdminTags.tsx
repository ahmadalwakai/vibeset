'use client';
import { Button, Flex, Heading, Input, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import { useRouter } from '@/i18n/navigation';
import { useContentMutation } from '@/hooks/useContentMutation';
import type { AdminContentTag } from '@/lib/admin-content';
import { localized } from '@/lib/utils/localized';
import { formatNumber } from '@/lib/utils/format';
import {
  adminUpsertTagSchema,
  adminDeleteTagSchema,
  adminMergeTagsSchema,
  adminContentTagKindSchema,
  type AdminUpsertTagInput,
} from '@/lib/validation/admin-content';
import { adminUpsertTag, adminDeleteTag, adminMergeTags } from '@/server/actions/admin/tags';
import { ContentCheck, ContentSelect, ContentTextField } from './ContentFields';

const kinds = ['aesthetic', 'mood', 'season', 'style'] as const;
function TagForm({
  tag,
  onSaved,
  onBusyChange,
}: {
  tag?: AdminContentTag;
  onSaved: () => void;
  onBusyChange: (pending: boolean) => void;
}): ReactElement {
  const t = useTranslations('admin.tags'),
    errors = useTranslations('errors'),
    mutation = useContentMutation(onBusyChange);
  const [value, setValue] = useState<AdminUpsertTagInput>({
    ...(tag ? { id: tag.id } : {}),
    slug: tag?.slug ?? '',
    kind: tag?.kind ?? 'mood',
    nameEn: tag?.nameEn ?? '',
    nameAr: tag?.nameAr ?? '',
    descriptionEn: tag?.descriptionEn ?? null,
    descriptionAr: tag?.descriptionAr ?? null,
    sortOrder: tag?.sortOrder ?? 0,
    isActive: tag?.isActive ?? true,
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void mutation.run(adminUpsertTagSchema, value, adminUpsertTag, onSaved);
      }}
    >
      <Stack gap="4">
        <fieldset disabled={mutation.pending}>
          <Stack gap="4">
            <ContentTextField
              label={t('slug')}
              value={value.slug}
              maxLength={40}
              dir="ltr"
              disabled={tag?.isSeeded}
              invalid={mutation.fields.includes('slug')}
              onChange={(slug) => setValue((previous) => ({ ...previous, slug }))}
              helper={tag?.isSeeded ? t('protected') : t('renameHint')}
            />
            <ContentSelect
              label={t('kind')}
              value={value.kind}
              disabled={tag?.isSeeded || !!tag?.usageCount}
              onChange={(kind) => {
                const parsed = adminContentTagKindSchema.safeParse(kind);
                if (parsed.success) setValue((previous) => ({ ...previous, kind: parsed.data }));
              }}
            >
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {t(kind)}
                </option>
              ))}
            </ContentSelect>
            {tag?.usageCount ? (
              <Text textStyle="caption" color="fg.muted">
                {t('usedKindHint')}
              </Text>
            ) : null}
            {(['nameEn', 'nameAr', 'descriptionEn', 'descriptionAr'] as const).map((key) => (
              <ContentTextField
                key={key}
                label={t(key)}
                value={value[key] ?? ''}
                onChange={(text) => setValue((previous) => ({ ...previous, [key]: text }))}
                invalid={mutation.fields.includes(key)}
                dir={key.endsWith('Ar') ? 'rtl' : 'ltr'}
                multiline={key.startsWith('description')}
                maxLength={key.startsWith('description') ? 4000 : 120}
              />
            ))}
            <ContentTextField
              label={t('sortOrder')}
              value={String(value.sortOrder)}
              type="number"
              onChange={(sortOrder) =>
                setValue((previous) => ({ ...previous, sortOrder: Number(sortOrder) }))
              }
            />
            <ContentCheck
              label={t('isActive')}
              checked={value.isActive}
              onChange={(isActive) => setValue((previous) => ({ ...previous, isActive }))}
            />
          </Stack>
        </fieldset>
        {mutation.error ? (
          <Text role="alert" color="red.fg">
            {errors(mutation.error)}
          </Text>
        ) : null}
        <Button type="submit" minH="11" colorPalette="brand" loading={mutation.pending}>
          {t('save')}
        </Button>
      </Stack>
    </form>
  );
}
export function AdminTags({ tags }: { tags: AdminContentTag[] }): ReactElement {
  const t = useTranslations('admin.tags'),
    common = useTranslations('common'),
    admin = useTranslations('admin.common'),
    errors = useTranslations('errors'),
    locale = useLocale(),
    router = useRouter(),
    mutation = useContentMutation();
  const [query, setQuery] = useState(''),
    [kind, setKind] = useState(''),
    [editing, setEditing] = useState<AdminContentTag | null | undefined>(undefined),
    [deleting, setDeleting] = useState<AdminContentTag | null>(null),
    [merging, setMerging] = useState<AdminContentTag | null>(null),
    [target, setTarget] = useState('');
  const editingBusy = useRef(false);
  const visible = tags.filter(
    (tag) =>
      (!kind || tag.kind === kind) &&
      `${tag.slug} ${tag.nameEn} ${tag.nameAr}`
        .toLocaleLowerCase(locale)
        .includes(query.trim().toLocaleLowerCase(locale)),
  );
  const targets = tags.filter(
    (tag) => tag.id !== merging?.id && tag.kind === merging?.kind && tag.isActive,
  );
  return (
    <Stack gap="5">
      <Flex gap="3" flexWrap="wrap">
        <Input
          aria-label={t('search')}
          placeholder={t('search')}
          value={query}
          maxLength={120}
          onChange={(event) => setQuery(event.target.value)}
          minH="11"
          flex="1"
        />
        <Button colorPalette="brand" minH="11" onClick={() => setEditing(null)}>
          {t('create')}
        </Button>
        <Button minH="11" variant="outline" onClick={() => router.refresh()}>
          {common('retry')}
        </Button>
      </Flex>
      <ContentSelect label={t('kind')} value={kind} onChange={setKind}>
        <option value="">{t('allKinds')}</option>
        {kinds.map((value) => (
          <option key={value} value={value}>
            {t(value)}
          </option>
        ))}
      </ContentSelect>
      {visible.length ? (
        kinds.map((group) => {
          const rows = visible.filter((tag) => tag.kind === group);
          return rows.length ? (
            <Stack key={group} gap="3">
              <Heading as="h2" textStyle="heading.md">
                {t(group)}
              </Heading>
              {rows.map((tag) => (
                <Stack
                  key={tag.id}
                  p="4"
                  gap="2"
                  rounded="card"
                  bg="bg.panel"
                  borderWidth="hairline"
                  borderColor="border"
                >
                  <Flex justify="space-between" gap="3" flexWrap="wrap">
                    <Stack gap="1">
                      <Heading as="h3" textStyle="heading.sm">
                        {localized(tag, locale)}
                      </Heading>
                      <Text textStyle="caption" color="fg.muted">
                        {tag.slug} · {t('usage', { count: formatNumber(tag.usageCount, locale) })}
                        {!tag.isActive ? ` · ${admin('inactive')}` : ''}
                      </Text>
                    </Stack>
                    <Flex gap="2" flexWrap="wrap">
                      <Button minH="11" variant="outline" onClick={() => setEditing(tag)}>
                        {t('edit')}
                      </Button>
                      <Button
                        minH="11"
                        variant="outline"
                        disabled={tag.isSeeded}
                        onClick={() => {
                          mutation.clear();
                          setMerging(tag);
                          setTarget('');
                        }}
                      >
                        {t('merge')}
                      </Button>
                      <Button
                        minH="11"
                        variant="outline"
                        colorPalette="red"
                        disabled={tag.isSeeded || (tag.kind === 'aesthetic' && tag.usageCount > 0)}
                        onClick={() => {
                          mutation.clear();
                          setDeleting(tag);
                        }}
                      >
                        {t('delete')}
                      </Button>
                    </Flex>
                  </Flex>
                  {tag.isSeeded ? (
                    <Text textStyle="caption" color="fg.muted">
                      {t('protected')}
                    </Text>
                  ) : tag.kind === 'aesthetic' && tag.usageCount > 0 ? (
                    <Text textStyle="caption" color="fg.muted">
                      {t('aestheticHint')}
                    </Text>
                  ) : null}
                </Stack>
              ))}
            </Stack>
          ) : null;
        })
      ) : (
        <Text>{t('empty')}</Text>
      )}
      <ResponsiveSheet
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open && !editingBusy.current) setEditing(undefined);
        }}
        title={editing ? t('edit') : t('create')}
      >
        {editing !== undefined ? (
          <TagForm
            key={editing?.id ?? 'new'}
            tag={editing ?? undefined}
            onBusyChange={(pending) => {
              editingBusy.current = pending;
            }}
            onSaved={() => {
              setEditing(undefined);
              router.refresh();
            }}
          />
        ) : null}
      </ResponsiveSheet>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t('delete')}
        description={
          deleting
            ? t('deleteHint', {
                name: localized(deleting, locale),
                count: formatNumber(deleting.usageCount, locale),
              })
            : ''
        }
        confirmationText={deleting?.slug}
        pending={mutation.pending}
        errorCode={mutation.error}
        onConfirm={() =>
          deleting
            ? mutation.run(
                adminDeleteTagSchema,
                {
                  id: deleting.id,
                  removeFromThemes: deleting.usageCount > 0,
                  expectedUsageCount: deleting.usageCount,
                },
                adminDeleteTag,
                () => {
                  setDeleting(null);
                  router.refresh();
                },
              )
            : false
        }
      />
      <ResponsiveSheet
        open={!!merging}
        onOpenChange={(open) => {
          if (!open && !mutation.pending) setMerging(null);
        }}
        title={t('mergeTitle', { name: merging ? localized(merging, locale) : '' })}
      >
        <Stack gap="4">
          <Text>{t('mergeHint')}</Text>
          <ContentSelect label={t('target')} value={target} onChange={setTarget}>
            <option value="">{t('chooseTarget')}</option>
            {targets.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {localized(tag, locale)} ({tag.slug})
              </option>
            ))}
          </ContentSelect>
          {!targets.length ? <Text>{t('none')}</Text> : null}
          {mutation.error ? (
            <Text role="alert" color="red.fg">
              {errors(mutation.error)}
            </Text>
          ) : null}
          <Button
            minH="11"
            colorPalette="brand"
            loading={mutation.pending}
            disabled={!target}
            onClick={() => {
              if (merging)
                void mutation.run(
                  adminMergeTagsSchema,
                  { fromId: merging.id, toId: target },
                  adminMergeTags,
                  () => {
                    setMerging(null);
                    router.refresh();
                  },
                );
            }}
          >
            {t('merge')}
          </Button>
        </Stack>
      </ResponsiveSheet>
    </Stack>
  );
}
