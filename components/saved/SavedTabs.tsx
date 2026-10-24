'use client';

import { Box, Button, Skeleton, Stack, Tabs } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { useFavorites } from '@/components/theme/FavoritesProvider';
import { ThemeGrid } from '@/components/theme/ThemeGrid';
import { ThemeGridSkeleton } from '@/components/theme/ThemeGridSkeleton';
import { Link } from '@/i18n/navigation';
import type { ThemeCardDTO } from '@/lib/dto';
import type { ErrorMessageCode } from '@/lib/result';
import { themePageResponseSchema, apiErrorSchema } from '@/lib/validation/themes';

export function SavedLoading(): ReactElement {
  return (
    <Stack gap="4" py="6" aria-busy="true">
      <Skeleton h="12" rounded="button" />
      <ThemeGridSkeleton count={4} />
    </Stack>
  );
}
const Collections = dynamic(
  () => import('./SavedCollections').then((module) => module.SavedCollections),
  { loading: SavedLoading },
);
const Remixes = dynamic(() => import('./SavedRemixes').then((module) => module.SavedRemixes), {
  loading: SavedLoading,
});

export function SavedSignIn(): ReactElement {
  const t = useTranslations('saved');
  return (
    <EmptyState
      title={t('signInTitle')}
      description={t('signInBody')}
      action={
        <Button asChild colorPalette="brand" size="lg">
          <Link href={{ pathname: '/sign-in', query: { next: '/saved' } }}>{t('signIn')}</Link>
        </Button>
      }
    />
  );
}

function SavedFavorites(): ReactElement {
  const t = useTranslations('saved');
  const favorites = useFavorites();
  const [themes, setThemes] = useState<ThemeCardDTO[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ErrorMessageCode | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = favorites.ids.join(',');
  useEffect(() => {
    const controller = new AbortController();
    const ids = key ? key.split(',') : [];
    let active = true;
    async function load(): Promise<void> {
      setFailure(null);
      if (!ids.length) {
        setThemes([]);
        setPending(false);
        return;
      }
      setPending(true);
      try {
        const all: ThemeCardDTO[] = [];
        for (let offset = 0; offset < ids.length; offset += 100) {
          const query = new URLSearchParams({ ids: ids.slice(offset, offset + 100).join(',') });
          const response = await fetch(`/api/v1/themes?${query}`, {
            signal: controller.signal,
            credentials: 'omit',
          });
          const body: unknown = await response.json();
          if (!response.ok) {
            const parsed = apiErrorSchema.safeParse(body);
            if (active) setFailure(parsed.success ? parsed.data.error.code : 'INTERNAL');
            return;
          }
          all.push(...themePageResponseSchema.parse(body).data.items);
        }
        if (active) setThemes([...new Map(all.map((theme) => [theme.id, theme])).values()]);
      } catch {
        if (active && !controller.signal.aborted) setFailure('NETWORK');
      } finally {
        if (active) setPending(false);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, attempt]);
  if (favorites.status === 'loading' || pending) return <SavedLoading />;
  if (favorites.status === 'error' || failure)
    return (
      <ErrorState
        code={failure ?? favorites.error ?? 'NETWORK'}
        onRetry={() => {
          favorites.refresh();
          setAttempt((value) => value + 1);
        }}
      />
    );
  if (!themes.length)
    return (
      <EmptyState
        title={t('emptyFavouritesTitle')}
        description={t('emptyFavouritesBody')}
        action={
          <Button asChild colorPalette="brand" size="lg">
            <Link href="/explore">{t('browse')}</Link>
          </Button>
        }
      />
    );
  return <ThemeGrid themes={themes} />;
}

export function SavedTabs(): ReactElement {
  const t = useTranslations('saved');
  const favorites = useFavorites();
  const privateContent = (children: ReactElement): ReactElement =>
    favorites.status === 'loading' ? (
      <SavedLoading />
    ) : favorites.status === 'error' && !favorites.isSignedIn ? (
      <ErrorState code={favorites.error ?? 'NETWORK'} onRetry={favorites.refresh} />
    ) : favorites.isSignedIn ? (
      children
    ) : (
      <SavedSignIn />
    );
  return (
    <Box pb="12">
      <Tabs.Root defaultValue="favourites" colorPalette="brand" lazyMount unmountOnExit>
        <Tabs.List mb="6" overflowX="auto" overflowY="hidden">
          {(['favourites', 'collections', 'remixes'] as const).map((tab) => (
            <Tabs.Trigger key={tab} value={tab} minH="11" flex="1" whiteSpace="nowrap">
              {t(`tabs.${tab}`)}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="favourites">
          <SavedFavorites />
        </Tabs.Content>
        <Tabs.Content value="collections">{privateContent(<Collections />)}</Tabs.Content>
        <Tabs.Content value="remixes">{privateContent(<Remixes />)}</Tabs.Content>
      </Tabs.Root>
    </Box>
  );
}
