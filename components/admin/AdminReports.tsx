'use client';

import {
  Badge,
  Box,
  Button,
  Checkbox,
  Field,
  Flex,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
} from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';
import type { ReactElement } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import { ThemePreviewImage } from '@/components/theme/ThemePreviewImage';
import { useAdminModeration } from '@/hooks/useAdminModeration';
import { Link, useRouter } from '@/i18n/navigation';
import type { AdminPage } from '@/lib/admin';
import type { AdminReportRow } from '@/lib/admin-moderation';
import { formatDate } from '@/lib/utils/format';
import { localized } from '@/lib/utils/localized';
import { adminResolveReportSchema, type AdminReportQuery } from '@/lib/validation/admin-moderation';
import { adminResolveReport, readAdminReport } from '@/server/actions/admin/moderation';
import { ModerationPager, ModerationSelect, ModerationValue } from './ModerationShared';

function ReportDetail({
  reportId,
  adminId,
  close,
}: {
  reportId: string;
  adminId: string;
  close: () => void;
}): ReactElement {
  const t = useTranslations('admin.reports'),
    common = useTranslations('common'),
    errors = useTranslations('errors'),
    preview = useTranslations('theme.preview'),
    locale = useLocale(),
    id = useId();
  const state = useAdminModeration(() => readAdminReport({ id: reportId }));
  const [action, setAction] = useState<'dismiss' | 'archive_theme' | 'ban_owner'>('dismiss'),
    [note, setNote] = useState(''),
    [archive, setArchive] = useState(false);
  const [confirming, setConfirming] = useState(false),
    [invalid, setInvalid] = useState(false);
  const detail = state.detail;
  async function confirm(): Promise<boolean> {
    const ok = await state.run(() =>
      adminResolveReport({
        id: reportId,
        action,
        note,
        archiveThemes: action === 'ban_owner' && archive,
      }),
    );
    if (ok) setConfirming(false);
    return ok;
  }
  return (
    <ResponsiveSheet
      open
      onOpenChange={(open) => {
        if (!open && !state.pending) close();
      }}
      title={t('details')}
    >
      <Stack gap="5" aria-busy={state.loading || state.pending}>
        {state.loading ? <Text role="status">{common('loading')}</Text> : null}
        {state.error ? <ErrorState code={state.error} onRetry={state.retry} /> : null}
        {state.saved ? (
          <Text role="status" textStyle="body.sm" color="brand.fg">
            {t('saved')}
          </Text>
        ) : null}
        {!state.loading && !state.error && !detail ? <Text>{t('notFound')}</Text> : null}
        {detail ? (
          <>
            <Text textStyle="heading.md">{localized(detail.theme, locale)}</Text>
            <Badge alignSelf="start">{t(detail.status)}</Badge>
            <Button asChild variant="outline" minH="11">
              <Link href={`/admin/themes/${detail.theme.id}`}>{t('theme')}</Link>
            </Button>
            <Flex gap="3" justify="center">
              {[detail.theme.previewHomeUrl, detail.theme.previewLockUrl].flatMap((url, index) =>
                url
                  ? [
                      <Box
                        key={`${index}:${url}`}
                        position="relative"
                        aspectRatio={264 / 572}
                        overflow="hidden"
                        rounded="card"
                        bg="bg.muted"
                        w="40"
                        minW="0"
                      >
                        <ThemePreviewImage
                          src={url}
                          alt={`${localized(detail.theme, locale)} · ${preview(index === 0 ? 'home' : 'lock')}`}
                          fallbackLabel={t('noPreview')}
                        />
                      </Box>,
                    ]
                  : [],
              )}
            </Flex>
            {!detail.theme.previewHomeUrl && !detail.theme.previewLockUrl ? (
              <Text textStyle="body.sm" color="fg.muted">
                {t('noPreview')}
              </Text>
            ) : null}
            <SimpleGrid columns={2} gap="4">
              <ModerationValue label={t('reporter')}>
                {detail.reporter?.maskedEmail ?? t('anonymous')}
              </ModerationValue>
              <ModerationValue label={t('created')}>
                {formatDate(detail.createdAt, locale)}
              </ModerationValue>
            </SimpleGrid>
            <ModerationValue label={t('reason')}>{t(detail.reason)}</ModerationValue>
            <ModerationValue label={t('detailsLabel')}>
              <Text whiteSpace="pre-wrap">{detail.details ?? t('noDetails')}</Text>
            </ModerationValue>
            <ModerationValue label={t('otherReports')}>
              <Stack gap="2">
                {detail.otherReports.length ? (
                  detail.otherReports.map((other) => (
                    <Box key={other.id} borderWidth="hairline" rounded="lg" p="3">
                      <Text textStyle="body.sm">
                        {t(other.reason)} · {t(other.status)} ·{' '}
                        {formatDate(other.createdAt, locale)}
                      </Text>
                      {other.details ? (
                        <Text textStyle="body.sm" color="fg.muted" whiteSpace="pre-wrap">
                          {other.details}
                        </Text>
                      ) : null}
                    </Box>
                  ))
                ) : (
                  <Text textStyle="body.sm" color="fg.muted">
                    {t('noOtherReports')}
                  </Text>
                )}
              </Stack>
            </ModerationValue>
            {detail.status === 'open' ? (
              <Box asChild border="0" p="0" minW="0">
                <fieldset disabled={state.pending}>
                  <Stack gap="4">
                    <ModerationSelect
                      id={`${id}-action`}
                      label={t('resolution')}
                      value={action}
                      onChange={(value) => {
                        setAction(
                          value === 'archive_theme'
                            ? value
                            : value === 'ban_owner'
                              ? value
                              : 'dismiss',
                        );
                        setArchive(false);
                      }}
                      options={(
                        [
                          'dismiss',
                          'archive_theme',
                          ...(detail.theme.ownerId && detail.theme.ownerId !== adminId
                            ? ['ban_owner' as const]
                            : []),
                        ] as const
                      ).map((value) => ({ value, label: t(value) }))}
                    />
                    {!detail.theme.ownerId ? (
                      <Text textStyle="body.sm" color="fg.muted">
                        {t('noOwner')}
                      </Text>
                    ) : null}
                    <Field.Root invalid={invalid}>
                      <Field.Label htmlFor={`${id}-note`}>{t('note')}</Field.Label>
                      <Textarea
                        id={`${id}-note`}
                        maxLength={1000}
                        value={note}
                        onChange={(event) => {
                          setNote(event.target.value);
                          setInvalid(false);
                        }}
                      />
                      <Field.HelperText>{t('noteHint')}</Field.HelperText>
                      <Field.ErrorText>{errors('VALIDATION')}</Field.ErrorText>
                    </Field.Root>
                    {action === 'ban_owner' ? (
                      <Checkbox.Root
                        minH="11"
                        checked={archive}
                        onCheckedChange={(event) => setArchive(event.checked === true)}
                      >
                        <Checkbox.HiddenInput />
                        <Checkbox.Control />
                        <Checkbox.Label>{t('archiveThemes')}</Checkbox.Label>
                      </Checkbox.Root>
                    ) : null}
                    <Button
                      minH="11"
                      colorPalette={action === 'dismiss' ? 'brand' : 'red'}
                      onClick={() => {
                        if (
                          !adminResolveReportSchema.safeParse({
                            id: reportId,
                            action,
                            note,
                            archiveThemes: action === 'ban_owner' && archive,
                          }).success
                        ) {
                          setInvalid(true);
                          return;
                        }
                        setConfirming(true);
                      }}
                    >
                      {t(action)}
                    </Button>
                  </Stack>
                </fieldset>
              </Box>
            ) : (
              <ModerationValue label={t('resolution')}>
                <Text>{detail.resolutionNote ?? t('closed')}</Text>
              </ModerationValue>
            )}
            <ConfirmDialog
              open={confirming}
              onOpenChange={setConfirming}
              title={t('confirm')}
              description={t(action)}
              danger={action !== 'dismiss'}
              pending={state.pending}
              errorCode={state.error}
              onConfirm={confirm}
            />
          </>
        ) : null}
      </Stack>
    </ResponsiveSheet>
  );
}
export function AdminReports({
  data,
  query,
  adminId,
}: {
  data: AdminPage<AdminReportRow>;
  query: AdminReportQuery;
  adminId: string;
}): ReactElement {
  const t = useTranslations('admin.reports'),
    locale = useLocale(),
    router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [navigating, startTransition] = useTransition();
  return (
    <Stack gap="6">
      <Tabs.Root
        value={query.status}
        onValueChange={({ value }) => {
          if (value !== 'open' && value !== 'resolved' && value !== 'dismissed') return;
          setSelected(null);
          startTransition(() => router.replace(`/admin/reports?status=${value}`));
        }}
        colorPalette="brand"
        aria-busy={navigating}
      >
        <Tabs.List aria-label={t('status')}>
          {(['open', 'resolved', 'dismissed'] as const).map((value) => (
            <Tabs.Trigger key={value} value={value} minH="11" disabled={navigating}>
              {t(value)}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value={query.status} p="0" pt="5">
          {!data.items.length ? (
            <EmptyState title={t('empty')} />
          ) : (
            <Stack as="ul" gap="3" listStyleType="none" m="0" p="0">
              {data.items.map((row) => (
                <Box as="li" key={row.id} p="4" bg="bg.panel" borderWidth="hairline" rounded="card">
                  <SimpleGrid columns={{ base: 1, md: 3 }} gap="3" alignItems="center">
                    <Stack gap="1">
                      <Text fontWeight="semibold" overflowWrap="anywhere">
                        {localized(row.theme, locale)}
                      </Text>
                      <Text textStyle="body.sm" color="fg.muted">
                        {t(row.reason)} · {formatDate(row.createdAt, locale)}
                      </Text>
                    </Stack>
                    <Stack gap="1" align="start">
                      <Badge>{t(row.status)}</Badge>
                      <Text textStyle="body.sm" color="fg.muted">
                        {row.reporter?.maskedEmail ?? t('anonymous')}
                      </Text>
                    </Stack>
                    <Button
                      minH="11"
                      variant="outline"
                      onClick={() => setSelected(row.id)}
                      aria-label={`${t('view')}: ${localized(row.theme, locale)}`}
                    >
                      {t('view')}
                    </Button>
                  </SimpleGrid>
                </Box>
              ))}
            </Stack>
          )}
          <ModerationPager data={data} path="/admin/reports" query={query} />
        </Tabs.Content>
      </Tabs.Root>
      {selected ? (
        <ReportDetail
          key={selected}
          reportId={selected}
          adminId={adminId}
          close={() => setSelected(null)}
        />
      ) : null}
    </Stack>
  );
}
