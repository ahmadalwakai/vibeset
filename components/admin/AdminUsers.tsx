'use client';

import {
  Badge,
  Box,
  Button,
  Checkbox,
  Field,
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
import type { AdminUserRow } from '@/lib/admin-moderation';
import { formatDate, formatNumber } from '@/lib/utils/format';
import { adminBanUserSchema, type AdminUserQuery } from '@/lib/validation/admin-moderation';
import {
  adminBanUser,
  adminSetRole,
  adminUnbanUser,
  readAdminUser,
} from '@/server/actions/admin/moderation';
import { ModerationPager, ModerationSelect, ModerationValue } from './ModerationShared';

function UserDetail({
  userId,
  adminId,
  close,
}: {
  userId: string;
  adminId: string;
  close: () => void;
}): ReactElement {
  const t = useTranslations('admin.users'),
    common = useTranslations('common'),
    creator = useTranslations('creator.status'),
    locale = useLocale(),
    id = useId();
  const state = useAdminModeration(() => readAdminUser({ userId }));
  const [role, setRole] = useState<'user' | 'admin' | ''>(''),
    [reason, setReason] = useState(''),
    [archive, setArchive] = useState(false);
  const [decision, setDecision] = useState<'role' | 'ban' | 'unban' | null>(null),
    [invalid, setInvalid] = useState(false);
  const detail = state.detail,
    self = userId === adminId;
  async function confirm(): Promise<boolean> {
    if (!detail) return false;
    const ok = await state.run(() =>
      decision === 'role'
        ? adminSetRole({ userId, role: role || detail.role })
        : decision === 'ban'
          ? adminBanUser({ userId, reason, archiveThemes: archive })
          : adminUnbanUser({ userId }),
    );
    if (ok) {
      setDecision(null);
      setReason('');
      setArchive(false);
      setRole('');
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
            <Text textStyle="heading.md">{detail.name}</Text>
            <Text dir="ltr" overflowWrap="anywhere">
              {detail.email}
            </Text>
            <SimpleGrid columns={2} gap="4">
              <ModerationValue label={t('joined')}>
                {formatDate(detail.createdAt, locale)}
              </ModerationValue>
              <ModerationValue label={t('verified')}>
                {t(detail.emailVerified ? 'yes' : 'no')}
              </ModerationValue>
              <ModerationValue label={t('locale')}>{detail.locale}</ModerationValue>
              <ModerationValue label={t('banned')}>
                {t(detail.banned ? 'blocked' : 'active')}
              </ModerationValue>
              {(['favorites', 'collections', 'remixes', 'themes'] as const).map((key) => (
                <ModerationValue key={key} label={t(key)}>
                  {formatNumber(detail.counts[key], locale)}
                </ModerationValue>
              ))}
            </SimpleGrid>
            {detail.creator ? (
              <ModerationValue label={t('creatorStatus')}>
                {detail.creator.handle} · {creator(detail.creator.status)}
              </ModerationValue>
            ) : null}
            {detail.banReason ? (
              <ModerationValue label={t('banReason')}>{detail.banReason}</ModerationValue>
            ) : null}
            {self ? (
              <Text textStyle="body.sm" color="fg.muted">
                {t('selfProtected')}
              </Text>
            ) : null}
            <Box asChild border="0" p="0" minW="0">
              <fieldset disabled={self || state.pending}>
                <Stack gap="4">
                  <ModerationSelect
                    id={`${id}-role`}
                    label={t('role')}
                    value={role || detail.role}
                    onChange={(value) => setRole(value === 'admin' ? 'admin' : 'user')}
                    options={(['user', 'admin'] as const).map((value) => ({
                      value,
                      label: t(value),
                    }))}
                  />
                  <Text textStyle="body.sm" color="fg.muted">
                    {t('roleHelp')}
                  </Text>
                  <Button
                    minH="11"
                    variant="outline"
                    disabled={self || state.pending || !role || role === detail.role}
                    onClick={() => setDecision('role')}
                  >
                    {t('setRole')}
                  </Button>
                  {detail.banned ? (
                    <Button
                      minH="11"
                      colorPalette="brand"
                      disabled={self || state.pending}
                      onClick={() => setDecision('unban')}
                    >
                      {t('unban')}
                    </Button>
                  ) : (
                    <>
                      <Field.Root invalid={invalid}>
                        <Field.Label htmlFor={`${id}-reason`}>{t('banReason')}</Field.Label>
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
                      <Checkbox.Root
                        minH="11"
                        checked={archive}
                        onCheckedChange={(event) => setArchive(event.checked === true)}
                      >
                        <Checkbox.HiddenInput />
                        <Checkbox.Control />
                        <Checkbox.Label>{t('archiveThemes')}</Checkbox.Label>
                      </Checkbox.Root>
                      <Text textStyle="body.sm" color="fg.muted">
                        {t('archiveHint')}
                      </Text>
                      <Button
                        minH="11"
                        colorPalette="red"
                        disabled={self || state.pending}
                        onClick={() => {
                          if (
                            !adminBanUserSchema.safeParse({
                              userId,
                              reason,
                              archiveThemes: archive,
                            }).success
                          ) {
                            setInvalid(true);
                            return;
                          }
                          setDecision('ban');
                        }}
                      >
                        {t('ban')}
                      </Button>
                    </>
                  )}
                </Stack>
              </fieldset>
            </Box>
            <ConfirmDialog
              open={decision !== null}
              onOpenChange={(open) => {
                if (!open) setDecision(null);
              }}
              title={t(
                decision === 'role'
                  ? 'confirmRole'
                  : decision === 'unban'
                    ? 'confirmUnban'
                    : 'confirmBan',
              )}
              description={detail.email}
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

export function AdminUsers({
  data,
  query,
  adminId,
}: {
  data: AdminPage<AdminUserRow>;
  query: AdminUserQuery;
  adminId: string;
}): ReactElement {
  const t = useTranslations('admin.users'),
    creator = useTranslations('creator.status'),
    locale = useLocale(),
    id = useId();
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Stack gap="6">
      <form method="get">
        <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap="3">
          <Field.Root>
            <Field.Label htmlFor={`${id}-q`}>{t('search')}</Field.Label>
            <Input id={`${id}-q`} name="q" defaultValue={query.q ?? ''} maxLength={120} minH="11" />
          </Field.Root>
          <ModerationSelect
            id={`${id}-role`}
            name="role"
            label={t('role')}
            value={query.role ?? ''}
            options={[
              { value: '', label: t('all') },
              ...(['user', 'admin'] as const).map((value) => ({ value, label: t(value) })),
            ]}
          />
          <ModerationSelect
            id={`${id}-banned`}
            name="banned"
            label={t('banned')}
            value={query.banned === undefined ? '' : String(query.banned)}
            options={[
              { value: '', label: t('all') },
              { value: 'false', label: t('active') },
              { value: 'true', label: t('blocked') },
            ]}
          />
          <ModerationSelect
            id={`${id}-creator`}
            name="creatorStatus"
            label={t('creatorStatus')}
            value={query.creatorStatus ?? ''}
            options={[
              { value: '', label: t('all') },
              ...(['pending', 'approved', 'rejected', 'suspended'] as const).map((value) => ({
                value,
                label: creator(value),
              })),
            ]}
          />
          <Button type="submit" minH="11" colorPalette="brand">
            {t('apply')}
          </Button>
          <Button asChild minH="11" variant="outline">
            <Link href="/admin/users">{t('clear')}</Link>
          </Button>
        </SimpleGrid>
      </form>
      {!data.items.length ? (
        <EmptyState title={t('empty')} />
      ) : (
        <Stack as="ul" gap="3" listStyleType="none" m="0" p="0">
          {data.items.map((row) => (
            <Box as="li" key={row.id} p="4" bg="bg.panel" borderWidth="hairline" rounded="card">
              <SimpleGrid columns={{ base: 1, md: 3 }} gap="3" alignItems="center">
                <Stack gap="1" minW="0">
                  <Text fontWeight="semibold" overflowWrap="anywhere">
                    {row.name}
                  </Text>
                  <Text textStyle="body.sm" color="fg.muted" overflowWrap="anywhere">
                    {row.email}
                  </Text>
                </Stack>
                <Stack gap="2" align="start">
                  <Badge colorPalette={row.banned ? 'red' : 'brand'}>
                    {t(row.banned ? 'blocked' : 'active')}
                  </Badge>
                  <Text textStyle="body.sm">
                    {t(row.role)} · {formatDate(row.createdAt, locale)}
                  </Text>
                </Stack>
                <Button
                  minH="11"
                  variant="outline"
                  onClick={() => setSelected(row.id)}
                  aria-label={`${t('open')}: ${row.name}`}
                >
                  {t('open')}
                </Button>
              </SimpleGrid>
            </Box>
          ))}
        </Stack>
      )}
      <ModerationPager data={data} query={query} path="/admin/users" />
      {selected ? (
        <UserDetail
          key={selected}
          userId={selected}
          adminId={adminId}
          close={() => setSelected(null)}
        />
      ) : null}
    </Stack>
  );
}
