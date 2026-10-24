'use client';

import { Badge, Box, Button, Flex, Grid, Image, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { toaster } from '@/components/ui/toaster';
import { Link, useRouter } from '@/i18n/navigation';
import type { CreatorThemeSummary } from '@/lib/creator';
import type { ErrorMessageCode } from '@/lib/result';
import { formatDate } from '@/lib/utils/format';
import { localized } from '@/lib/utils/localized';
import { deleteCreatorTheme, submitTheme, withdrawTheme } from '@/server/actions/creator';

export function CreatorThemeCard({
  theme,
  canSubmit,
  actions = true,
}: {
  theme: CreatorThemeSummary;
  canSubmit: boolean;
  actions?: boolean;
}): ReactElement {
  const t = useTranslations('creator.themes');
  const statusLabel = useTranslations('creator.status');
  const errors = useTranslations('errors');
  const locale = useLocale(),
    router = useRouter();
  const [pending, setPending] = useState(false),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState<ErrorMessageCode | null>(null);
  const busy = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function mutate(kind: 'submit' | 'withdraw' | 'delete'): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const action =
        kind === 'submit' ? submitTheme : kind === 'withdraw' ? withdrawTheme : deleteCreatorTheme;
      const result = await action({ id: theme.id });
      if (!mounted.current) return false;
      if (!result.ok) {
        setError(result.error.code);
        return false;
      }
      toaster.create({
        type: 'success',
        title: t(kind === 'submit' ? 'submitted' : kind === 'withdraw' ? 'withdrawn' : 'deleted'),
      });
      router.refresh();
      return true;
    } catch {
      if (mounted.current) setError('NETWORK');
      return false;
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  const editable = theme.status === 'draft' || theme.status === 'rejected';
  return (
    <Stack
      gap="4"
      p="5"
      rounded="card"
      bg="bg.panel"
      borderWidth="hairline"
      borderColor="border"
      minW="0"
    >
      <Grid templateColumns="auto minmax(0, 1fr)" gap="4" alignItems="start">
        <Box
          position="relative"
          aspectRatio={9 / 19.5}
          overflow="hidden"
          rounded="input"
          bg="bg.subtle"
          w="20"
        >
          {theme.thumbUrl ? (
            <Image
              src={theme.thumbUrl}
              alt=""
              width={360}
              height={780}
              position="absolute"
              inset="0"
              w="full"
              h="full"
              objectFit="cover"
              loading="lazy"
              decoding="async"
            />
          ) : null}
        </Box>
        <Stack gap="3" minW="0">
          <Badge
            alignSelf="start"
            colorPalette={
              theme.status === 'published' ? 'brand' : theme.status === 'rejected' ? 'red' : 'gray'
            }
          >
            {statusLabel(theme.status)}
          </Badge>
          <Text as="h2" textStyle="heading.sm" overflowWrap="anywhere">
            {localized(theme, locale)}
          </Text>
          <Text textStyle="caption" color="fg.muted">
            {t('updatedAt', { date: formatDate(theme.updatedAt, locale, { dateStyle: 'medium' }) })}
          </Text>
        </Stack>
      </Grid>
      {theme.rejectionReason && theme.status === 'rejected' ? (
        <Stack gap="1">
          <Text textStyle="caption" fontWeight="semibold">
            {t('rejectionReason')}
          </Text>
          <Text textStyle="body.sm" overflowWrap="anywhere">
            {theme.rejectionReason}
          </Text>
        </Stack>
      ) : null}
      {actions ? (
        <Flex gap="2" flexWrap="wrap">
          {editable ? (
            <Button asChild colorPalette="brand" minH="11" disabled={pending}>
              <Link href={`/creator/themes/${theme.id}`}>{t('edit')}</Link>
            </Button>
          ) : null}
          {theme.status === 'draft' ? (
            <Button
              minH="11"
              variant="outline"
              loading={pending}
              disabled={!canSubmit}
              title={!canSubmit ? t('submitNeedsProfile') : undefined}
              onClick={() => void mutate('submit')}
            >
              {t('submit')}
            </Button>
          ) : null}
          {theme.status === 'pending_review' ? (
            <Button
              minH="11"
              variant="outline"
              loading={pending}
              onClick={() => void mutate('withdraw')}
            >
              {t('withdraw')}
            </Button>
          ) : null}
          {theme.status === 'published' ? (
            <Button asChild minH="11" variant="outline">
              <Link href={`/t/${theme.slug}`}>{t('publishedView')}</Link>
            </Button>
          ) : null}
          {editable ? (
            <Button
              minH="11"
              variant="ghost"
              colorPalette="red"
              disabled={pending}
              onClick={() => {
                setError(null);
                setConfirm(true);
              }}
            >
              {t('delete')}
            </Button>
          ) : null}
        </Flex>
      ) : (
        <Button asChild variant="outline" minH="11">
          <Link href={theme.status === 'published' ? `/t/${theme.slug}` : '/creator/themes'}>
            {theme.status === 'published' ? t('publishedView') : t('title')}
          </Link>
        </Button>
      )}
      {error && !confirm ? (
        <Text role="alert" textStyle="body.sm" color="red.fg">
          {errors(error)}
        </Text>
      ) : null}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('deleteTitle')}
        description={t('deleteBody')}
        confirmLabel={t('delete')}
        errorCode={error}
        onConfirm={() => mutate('delete')}
      />
    </Stack>
  );
}
