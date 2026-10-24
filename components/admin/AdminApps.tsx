'use client';
import {
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Link as ChakraLink,
  Stack,
  Text,
  Table,
} from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import { Link, useRouter } from '@/i18n/navigation';
import { useContentMutation } from '@/hooks/useContentMutation';
import { APP_CATEGORIES, type AdminApp, type AdminAppPage } from '@/lib/admin-content';
import { saveAdminApp, deleteAdminApp, moveAdminAppToFront } from '@/lib/client/admin-apps';
import { formatNumber } from '@/lib/utils/format';
import type { ThemeSpec } from '@/lib/render/spec';
import type { ErrorMessageCode } from '@/lib/result';
import {
  adminUpsertAppSchema,
  adminContentIdSchema,
  type AdminUpsertAppInput,
} from '@/lib/validation/admin-content';
import { ContentCheck, ContentSelect, ContentTextField } from './ContentFields';

const GlyphPicker = dynamic(() =>
  import('@/components/theme/GlyphPicker').then((module) => module.GlyphPicker),
);
function AppForm({
  app,
  sample,
  onSaved,
  onBusyChange,
}: {
  app?: AdminApp;
  sample: ThemeSpec;
  onSaved: () => void;
  onBusyChange: (pending: boolean) => void;
}): ReactElement {
  const t = useTranslations('admin.apps'),
    errors = useTranslations('errors'),
    mutation = useContentMutation(onBusyChange);
  const [value, setValue] = useState<AdminUpsertAppInput>({
    ...(app ? { id: app.id } : {}),
    slug: app?.slug ?? '',
    name: app?.name ?? '',
    aliases: app?.aliases ?? [],
    category: app?.category ?? 'utilities',
    glyph: app?.glyph ?? 'app-window',
    iosScheme: app?.iosScheme ?? null,
    androidPackage: app?.androidPackage ?? null,
    rank: app?.rank ?? 1000,
    isActive: app?.isActive ?? true,
  });
  const [alias, setAlias] = useState(''),
    [glyphOpen, setGlyphOpen] = useState(false);
  function addAlias(): void {
    const next = alias.trim();
    if (next && next.length <= 120 && value.aliases.length < 20 && !value.aliases.includes(next)) {
      setValue((previous) => ({ ...previous, aliases: [...previous.aliases, next] }));
      setAlias('');
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void mutation.run(adminUpsertAppSchema, value, saveAdminApp, () => {
          onSaved();
        });
      }}
    >
      <Stack gap="4">
        <fieldset disabled={mutation.pending}>
          <Stack gap="4">
            <ContentTextField
              label={t('slug')}
              value={value.slug}
              maxLength={80}
              dir="ltr"
              helper={t('slugHint')}
              onChange={(slug) => setValue((previous) => ({ ...previous, slug }))}
              invalid={mutation.fields.includes('slug')}
            />
            <ContentTextField
              label={t('name')}
              value={value.name}
              maxLength={120}
              onChange={(name) => setValue((previous) => ({ ...previous, name }))}
              invalid={mutation.fields.includes('name')}
            />
            <Stack gap="2">
              <Text textStyle="body.sm">{t('aliases')}</Text>
              <Flex gap="2">
                <Input
                  aria-label={t('aliasPlaceholder')}
                  placeholder={t('aliasPlaceholder')}
                  value={alias}
                  onChange={(event) => setAlias(event.target.value)}
                  maxLength={120}
                  minH="11"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addAlias();
                    }
                  }}
                />
                <Button
                  minH="11"
                  variant="outline"
                  disabled={!alias.trim() || value.aliases.length >= 20}
                  onClick={addAlias}
                >
                  {t('addAlias')}
                </Button>
              </Flex>
              <Flex gap="2" flexWrap="wrap">
                {value.aliases.map((item) => (
                  <Box key={item} borderWidth="hairline" borderColor="border" rounded="full" ps="3">
                    <Text as="span" textStyle="body.sm">
                      {item}
                    </Text>
                    <Button
                      minW="11"
                      minH="11"
                      size="sm"
                      variant="ghost"
                      aria-label={t('removeAlias', { name: item })}
                      onClick={() =>
                        setValue((previous) => ({
                          ...previous,
                          aliases: previous.aliases.filter((entry) => entry !== item),
                        }))
                      }
                    >
                      ×
                    </Button>
                  </Box>
                ))}
              </Flex>
            </Stack>
            <ContentSelect
              label={t('category')}
              value={value.category}
              onChange={(category) => {
                const parsed = adminUpsertAppSchema.shape.category.safeParse(category);
                if (parsed.success)
                  setValue((previous) => ({ ...previous, category: parsed.data }));
              }}
            >
              {APP_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {t(`categories.${category}`)}
                </option>
              ))}
            </ContentSelect>
            <ContentTextField
              label={t('glyph')}
              value={value.glyph}
              dir="ltr"
              maxLength={48}
              onChange={(glyph) => setValue((previous) => ({ ...previous, glyph }))}
              invalid={mutation.fields.includes('glyph')}
            />
            <Button
              minH="11"
              variant="outline"
              onClick={() => setGlyphOpen((previous) => !previous)}
            >
              {t('chooseGlyph')}
            </Button>
            {glyphOpen ? (
              <GlyphPicker
                spec={sample}
                platform="ios"
                value={value.glyph}
                onChange={(glyph) => {
                  setValue((previous) => ({ ...previous, glyph }));
                  setGlyphOpen(false);
                }}
                disabled={mutation.pending}
              />
            ) : null}
            <ContentTextField
              label={t('iosScheme')}
              value={value.iosScheme ?? ''}
              maxLength={80}
              dir="ltr"
              helper={t('schemeHint')}
              onChange={(iosScheme) =>
                setValue((previous) => ({ ...previous, iosScheme: iosScheme || null }))
              }
              invalid={mutation.fields.includes('iosScheme')}
            />
            <ContentTextField
              label={t('androidPackage')}
              value={value.androidPackage ?? ''}
              maxLength={255}
              dir="ltr"
              onChange={(androidPackage) =>
                setValue((previous) => ({ ...previous, androidPackage: androidPackage || null }))
              }
              invalid={mutation.fields.includes('androidPackage')}
            />
            <ContentTextField
              label={t('rank')}
              value={String(value.rank)}
              type="number"
              onChange={(rank) => setValue((previous) => ({ ...previous, rank: Number(rank) }))}
              invalid={mutation.fields.includes('rank')}
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
        <Button minH="11" colorPalette="brand" type="submit" loading={mutation.pending}>
          {t('save')}
        </Button>
      </Stack>
    </form>
  );
}
export function AdminApps({
  data,
  sample,
  q = '',
}: {
  data: AdminAppPage;
  sample: ThemeSpec;
  q?: string;
}): ReactElement {
  const t = useTranslations('admin.apps'),
    common = useTranslations('admin.common'),
    locale = useLocale(),
    errors = useTranslations('errors'),
    router = useRouter(),
    mutation = useContentMutation();
  const [editing, setEditing] = useState<AdminApp | null | undefined>(undefined),
    [deleting, setDeleting] = useState<AdminApp | null>(null),
    [moving, setMoving] = useState<string | null>(null),
    [moveError, setMoveError] = useState<ErrorMessageCode | null>(null);
  const editingBusy = useRef(false),
    movingBusy = useRef(false),
    mounted = useRef(false),
    request = useRef(0),
    moveController = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current += 1;
      moveController.current?.abort();
    };
  }, []);
  async function moveTop(id: string): Promise<void> {
    if (movingBusy.current) return;
    movingBusy.current = true;
    const epoch = ++request.current;
    setMoving(id);
    setMoveError(null);
    const controller = new AbortController();
    moveController.current = controller;
    try {
      const result = await moveAdminAppToFront(id, controller.signal);
      if (!result || !mounted.current || epoch !== request.current) return;
      if (!result.ok) {
        setMoveError(result.error.code);
        return;
      }
      router.refresh();
    } catch {
      if (mounted.current && epoch === request.current) setMoveError('NETWORK');
    } finally {
      movingBusy.current = false;
      if (mounted.current && epoch === request.current) setMoving(null);
    }
  }
  const href = (page: number): string =>
    `/admin/apps?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page) })}`;
  return (
    <Stack gap="5">
      <Flex gap="3" flexWrap="wrap" justify="space-between">
        <form method="get">
          <Flex gap="2">
            <Input
              name="q"
              type="search"
              defaultValue={q}
              maxLength={120}
              minH="11"
              aria-label={t('search')}
              placeholder={t('search')}
            />
            <Button type="submit" minH="11">
              {t('search')}
            </Button>
          </Flex>
        </form>
        <Button minH="11" colorPalette="brand" onClick={() => setEditing(null)}>
          {t('create')}
        </Button>
      </Flex>
      {moveError ? (
        <Text role="alert" color="red.fg">
          {errors(moveError)}
        </Text>
      ) : null}
      {data.items.length ? (
        <Box overflowX="auto" display={{ base: 'none', md: 'block' }}>
          <Table.Root variant="outline" size="sm">
            <Table.Header>
              <Table.Row>
                {(['name', 'category', 'glyph', 'rank', 'isActive', 'edit'] as const).map((key) => (
                  <Table.ColumnHeader key={key}>{t(key)}</Table.ColumnHeader>
                ))}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.items.map((app) => (
                <Table.Row key={app.id}>
                  <Table.Cell>
                    <Text textStyle="body.sm">{app.name}</Text>
                    <Text textStyle="caption" color="fg.muted">
                      {app.slug}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>{t(`categories.${app.category}`)}</Table.Cell>
                  <Table.Cell>{app.glyph}</Table.Cell>
                  <Table.Cell>{formatNumber(app.rank, locale)}</Table.Cell>
                  <Table.Cell>{common(app.isActive ? 'yes' : 'no')}</Table.Cell>
                  <Table.Cell>
                    <Flex gap="2" flexWrap="wrap">
                      <Button minH="11" variant="outline" onClick={() => setEditing(app)}>
                        {t('edit')}
                      </Button>
                      <Button
                        minH="11"
                        variant="outline"
                        loading={moving === app.id}
                        disabled={!app.isActive || !!moving}
                        onClick={() => {
                          void moveTop(app.id);
                        }}
                      >
                        {t('moveTop')}
                      </Button>
                      <Button
                        minH="11"
                        variant="outline"
                        colorPalette="red"
                        onClick={() => {
                          mutation.clear();
                          setDeleting(app);
                        }}
                      >
                        {t('delete')}
                      </Button>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      ) : null}
      {data.items.length ? (
        data.items.map((app) => (
          <Stack
            key={app.id}
            display={{ base: 'flex', md: 'none' }}
            p="4"
            bg="bg.panel"
            rounded="card"
            borderWidth="hairline"
            borderColor="border"
          >
            <Flex gap="3" justify="space-between" flexWrap="wrap">
              <Stack gap="1">
                <Heading as="h2" textStyle="heading.sm">
                  {app.name}
                </Heading>
                <Text textStyle="caption" color="fg.muted">
                  {app.slug} · {t(`categories.${app.category}`)} · {t('rank')}:{' '}
                  {formatNumber(app.rank, locale)} · {common(app.isActive ? 'yes' : 'no')}
                </Text>
                <Text textStyle="body.sm" color="fg.muted">
                  {app.glyph}
                </Text>
              </Stack>
              <Flex gap="2" flexWrap="wrap">
                <Button minH="11" variant="outline" onClick={() => setEditing(app)}>
                  {t('edit')}
                </Button>
                <Button
                  minH="11"
                  variant="outline"
                  loading={moving === app.id}
                  disabled={!app.isActive || !!moving}
                  onClick={() => {
                    void moveTop(app.id);
                  }}
                >
                  {t('moveTop')}
                </Button>
                <Button
                  minH="11"
                  colorPalette="red"
                  variant="outline"
                  onClick={() => {
                    mutation.clear();
                    setDeleting(app);
                  }}
                >
                  {t('delete')}
                </Button>
              </Flex>
            </Flex>
          </Stack>
        ))
      ) : (
        <Text>{t('empty')}</Text>
      )}
      <Flex gap="3">
        {data.page > 1 ? (
          <ChakraLink asChild minH="11">
            <Link href={href(data.page - 1)}>{t('previous')}</Link>
          </ChakraLink>
        ) : null}
        {data.nextPage ? (
          <ChakraLink asChild minH="11">
            <Link href={href(data.nextPage)}>{t('next')}</Link>
          </ChakraLink>
        ) : null}
      </Flex>
      <ResponsiveSheet
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open && !editingBusy.current) setEditing(undefined);
        }}
        title={editing ? t('edit') : t('create')}
      >
        {editing !== undefined ? (
          <AppForm
            key={editing?.id ?? 'new'}
            app={editing ?? undefined}
            sample={sample}
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
        description={deleting ? t('deleteHint', { name: deleting.name }) : ''}
        confirmationText={deleting?.slug}
        pending={mutation.pending}
        errorCode={mutation.error}
        onConfirm={() =>
          deleting
            ? mutation.run(adminContentIdSchema, { id: deleting.id }, deleteAdminApp, () => {
                setDeleting(null);
                router.refresh();
              })
            : false
        }
      />
    </Stack>
  );
}
