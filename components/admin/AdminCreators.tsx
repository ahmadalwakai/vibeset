'use client';

import {
  Badge,
  Box,
  Button,
  Checkbox,
  Field,
  Flex,
  Input,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { ReactElement } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import { useAdminModeration } from '@/hooks/useAdminModeration';
import { Link } from '@/i18n/navigation';
import type { AdminPage } from '@/lib/admin';
import type { AdminCreatorRow } from '@/lib/admin-moderation';
import { formatDate, formatNumber } from '@/lib/utils/format';
import {
  adminReviewCreatorSchema,
  type AdminCreatorQuery,
} from '@/lib/validation/admin-moderation';
import { adminReviewCreator, readAdminCreator } from '@/server/actions/admin/moderation';
import { ModerationPager, ModerationSelect, ModerationValue } from './ModerationShared';

function CreatorDetail({ userId, close }: { userId: string; close: () => void }): ReactElement {
  const t = useTranslations('admin.creators'),
    common = useTranslations('common'),
    status = useTranslations('creator.status'),
    users = useTranslations('admin.users'),
    locale = useLocale(),
    id = useId();
  const state = useAdminModeration(() => readAdminCreator({ userId }));
  const [reason, setReason] = useState(''),
    [archive, setArchive] = useState(false),
    [invalid, setInvalid] = useState(false);
  const [decision, setDecision] = useState<'approve' | 'reject' | 'suspend' | null>(null);
  const detail = state.detail;
  function choose(value: 'approve' | 'reject' | 'suspend'): void {
    if (
      !adminReviewCreatorSchema.safeParse({
        userId,
        decision: value,
        ...(value === 'approve' ? {} : { reason }),
        archiveThemes: value === 'suspend' && archive,
      }).success
    ) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDecision(value);
  }
  async function confirm(): Promise<boolean> {
    const ok = await state.run(() =>
      adminReviewCreator({
        userId,
        decision,
        ...(decision === 'approve' ? {} : { reason }),
        archiveThemes: decision === 'suspend' && archive,
      }),
    );
    if (ok) {
      setDecision(null);
      setReason('');
      setArchive(false);
    }
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
            <Text textStyle="heading.md">{detail.displayName}</Text>
            <Text dir="ltr" overflowWrap="anywhere">
              @{detail.handle} · {detail.email}
            </Text>
            <Badge alignSelf="start" colorPalette={detail.status === 'approved' ? 'brand' : 'gray'}>
              {status(detail.status)}
            </Badge>
            <SimpleGrid columns={2} gap="4">
              <ModerationValue label={t('accountCreated')}>
                {formatDate(detail.accountCreatedAt, locale)}
              </ModerationValue>
              <ModerationValue label={t('applied')}>
                {formatDate(detail.appliedAt, locale)}
              </ModerationValue>
              <ModerationValue label={t('adult')}>
                {users(detail.isAdult ? 'yes' : 'no')}
              </ModerationValue>
              <ModerationValue label={users('banned')}>
                {users(detail.banned ? 'blocked' : 'active')}
              </ModerationValue>
              <ModerationValue label={t('themes')}>
                {formatNumber(detail.themeCount, locale)}
              </ModerationValue>
              <ModerationValue label={t('published')}>
                {formatNumber(detail.publishedCount, locale)}
              </ModerationValue>
              <ModerationValue label={t('downloads')}>
                {formatNumber(detail.downloads30d, locale)}
              </ModerationValue>
            </SimpleGrid>
            {detail.bio ? (
              <ModerationValue label={t('bio')}>
                <Text whiteSpace="pre-wrap">{detail.bio}</Text>
              </ModerationValue>
            ) : null}
            {detail.links.length ? (
              <ModerationValue label={t('links')}>
                <Stack gap="2">
                  {detail.links.map((link) => (
                    <Button asChild key={link.url} variant="outline" minH="11" whiteSpace="normal">
                      <a href={link.url} target="_blank" rel="noopener noreferrer">
                        {link.label}
                      </a>
                    </Button>
                  ))}
                </Stack>
              </ModerationValue>
            ) : null}
            {detail.rejectionReason ? (
              <ModerationValue label={t('lastDecision')}>{detail.rejectionReason}</ModerationValue>
            ) : null}
            <Box asChild border="0" p="0" minW="0">
              <fieldset disabled={state.pending}>
                <Stack gap="4">
                  {detail.status !== 'rejected' ? (
                    <>
                      {detail.status === 'pending' || detail.status === 'approved' ? (
                        <Field.Root invalid={invalid}>
                          <Field.Label htmlFor={`${id}-reason`}>{t('reason')}</Field.Label>
                          <Textarea
                            id={`${id}-reason`}
                            value={reason}
                            maxLength={500}
                            onChange={(event) => {
                              setReason(event.target.value);
                              setInvalid(false);
                            }}
                          />
                          <Field.ErrorText>{t('reasonRequired')}</Field.ErrorText>
                        </Field.Root>
                      ) : null}
                      {detail.status === 'approved' ? (
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
                      <Flex gap="2" wrap="wrap">
                        {detail.status === 'pending' || detail.status === 'suspended' ? (
                          <Button minH="11" colorPalette="brand" onClick={() => choose('approve')}>
                            {t('approve')}
                          </Button>
                        ) : null}
                        {detail.status === 'pending' ? (
                          <Button minH="11" colorPalette="red" onClick={() => choose('reject')}>
                            {t('reject')}
                          </Button>
                        ) : null}
                        {detail.status === 'approved' ? (
                          <Button minH="11" colorPalette="red" onClick={() => choose('suspend')}>
                            {t('suspend')}
                          </Button>
                        ) : null}
                      </Flex>
                    </>
                  ) : null}
                </Stack>
              </fieldset>
            </Box>
            <ConfirmDialog
              open={decision !== null}
              onOpenChange={(open) => {
                if (!open) setDecision(null);
              }}
              title={t('confirm')}
              description={detail.displayName}
              danger={decision !== 'approve'}
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

export function AdminCreators({
  data,
  query,
}: {
  data: AdminPage<AdminCreatorRow>;
  query: AdminCreatorQuery;
}): ReactElement {
  const t = useTranslations('admin.creators'),
    status = useTranslations('creator.status'),
    locale = useLocale(),
    id = useId();
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Stack gap="6">
      <form method="get">
        <SimpleGrid columns={{ base: 1, md: 2 }} gap="3">
          <Field.Root>
            <Field.Label htmlFor={`${id}-q`}>{t('search')}</Field.Label>
            <Input id={`${id}-q`} name="q" defaultValue={query.q ?? ''} maxLength={120} minH="11" />
          </Field.Root>
          <ModerationSelect
            id={`${id}-status`}
            name="status"
            label={t('status')}
            value={query.status}
            options={[
              { value: 'all', label: t('all') },
              ...(['pending', 'approved', 'rejected', 'suspended'] as const).map((value) => ({
                value,
                label: status(value),
              })),
            ]}
          />
          <Button type="submit" minH="11" colorPalette="brand">
            {t('apply')}
          </Button>
          <Button asChild minH="11" variant="outline">
            <Link href="/admin/creators">{t('clear')}</Link>
          </Button>
        </SimpleGrid>
      </form>
      {!data.items.length ? (
        <EmptyState title={t('empty')} />
      ) : (
        <Stack as="ul" gap="3" listStyleType="none" m="0" p="0">
          {data.items.map((row) => (
            <Box as="li" key={row.userId} p="4" bg="bg.panel" borderWidth="hairline" rounded="card">
              <SimpleGrid columns={{ base: 1, md: 3 }} gap="3" alignItems="center">
                <Stack gap="1">
                  <Text fontWeight="semibold" overflowWrap="anywhere">
                    {row.displayName}
                  </Text>
                  <Text textStyle="body.sm" color="fg.muted" overflowWrap="anywhere">
                    @{row.handle}
                  </Text>
                </Stack>
                <Stack gap="1" align="start">
                  <Badge colorPalette={row.status === 'approved' ? 'brand' : 'gray'}>
                    {status(row.status)}
                  </Badge>
                  <Text textStyle="body.sm" color="fg.muted">
                    {formatDate(row.appliedAt, locale)}
                  </Text>
                  <Text textStyle="caption" color="fg.muted">
                    {t('themes')}: {formatNumber(row.themeCount, locale)} · {t('published')}:{' '}
                    {formatNumber(row.publishedCount, locale)}
                  </Text>
                  <Text textStyle="caption" color="fg.muted">
                    {t('downloads')}: {formatNumber(row.downloads30d, locale)}
                  </Text>
                </Stack>
                <Button
                  minH="11"
                  variant="outline"
                  onClick={() => setSelected(row.userId)}
                  aria-label={`${t('open')}: ${row.displayName}`}
                >
                  {t('open')}
                </Button>
              </SimpleGrid>
            </Box>
          ))}
        </Stack>
      )}
      <ModerationPager data={data} path="/admin/creators" query={query} />
      {selected ? (
        <CreatorDetail key={selected} userId={selected} close={() => setSelected(null)} />
      ) : null}
    </Stack>
  );
}
