import { Box, Button, Flex, Heading, Icon, Skeleton, Stack, Text } from '@chakra-ui/react';
import { ArrowUpRightIcon, MagicWandIcon } from '@phosphor-icons/react/ssr';
import { unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { CatalogError } from '@/components/common/CatalogError';
import { EmptyState } from '@/components/common/EmptyState';
import { TagChip } from '@/components/common/TagChip';
import { FadeIn } from '@/components/common/motion';
import { CollectionCard } from '@/components/theme/CollectionCard';
import { HorizontalRail } from '@/components/theme/HorizontalRail';
import { ThemeCard } from '@/components/theme/ThemeCard';
import { Link } from '@/i18n/navigation';
import type { CollectionCardDTO, Paginated, TagDTO, ThemeCardDTO, ThemeSort } from '@/lib/dto';
import { ThemePreviewImage } from '@/components/theme/ThemePreviewImage';
import { localized } from '@/lib/utils/localized';
import {
  selectHomeCollections,
  selectHomeHero,
  type HomeCollectionCandidate,
} from '@/lib/collection-window';
import { BrandHero } from './BrandHero';

function HomeCardRailSkeleton({ ratio }: { ratio: number }): ReactElement {
  return (
    <Stack gap="5" aria-hidden>
      <Skeleton h="8" w="48" />
      <Flex gap={{ base: '3', md: '5' }} overflow="hidden">
        {Array.from({ length: 6 }, (_, index) => (
          <Stack
            key={index}
            flexShrink="0"
            w={{ base: '40', sm: '44', md: '48', lg: '52' }}
            gap="3"
          >
            <Box position="relative" aspectRatio={ratio} overflow="hidden" rounded="card">
              <Skeleton position="absolute" inset="0" rounded="card" />
            </Box>
            <Skeleton h="5" w="4/5" />
            <Skeleton h="4" w="3/5" />
          </Stack>
        ))}
      </Flex>
    </Stack>
  );
}

export function HomeRailSkeleton(): ReactElement {
  return <HomeCardRailSkeleton ratio={9 / 19.5} />;
}

export function HomeCollectionsSkeleton(): ReactElement {
  return <HomeCardRailSkeleton ratio={3 / 2} />;
}

export function HomeAestheticsSkeleton(): ReactElement {
  return (
    <Stack gap="5" aria-hidden>
      <Skeleton h="8" w="56" />
      <Flex gap="2" wrap="wrap">
        {Array.from({ length: 12 }, (_, index) => (
          <Skeleton key={index} h="11" w="24" rounded="chip" />
        ))}
      </Flex>
    </Stack>
  );
}

export async function HomeHero(): Promise<ReactElement> {
  await connection();
  let collection: HomeCollectionCandidate | null = null;
  try {
    const { getPublicSettings } = await import('@/server/queries/settings');
    const { heroCollectionSlug } = await getPublicSettings();
    const { getHomeCollectionCandidates } = await import('@/server/queries/collections');
    collection = selectHomeHero(
      await getHomeCollectionCandidates(),
      heroCollectionSlug,
      new Date().getTime(),
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error({ scope: 'home.hero', err: error });
  }
  if (!collection?.slug || !collection.coverThumbUrl) return <BrandHero />;
  const [locale, t, theme] = await Promise.all([
    getLocale(),
    getTranslations('home.hero'),
    getTranslations('theme'),
  ]);
  const title = localized(collection, locale, 'title');
  return (
    <Flex
      as="section"
      align="center"
      gap={{ base: '8', lg: '16' }}
      direction={{ base: 'column', lg: 'row' }}
      py={{ base: '12', md: '20' }}
      minH={{ base: 'auto', md: 'xl' }}
    >
      <Stack gap="6" flex="1" align="start">
        <Text textStyle="caption" color="brand.fg">
          {t('collectionLabel')}
        </Text>
        <Heading as="h1" textStyle="display.2xl" textWrap="balance">
          {title}
        </Heading>
        <Text textStyle="body.md" color="fg.muted" maxW="xl">
          {localized(collection, locale, 'description')}
        </Text>
        <Button asChild colorPalette="brand" rounded="button" size="lg">
          <Link href={'/collections/' + collection.slug}>
            {t('viewCollection')}
            <Icon _rtl={{ transform: 'scaleX(-1)' }}>
              <ArrowUpRightIcon />
            </Icon>
          </Link>
        </Button>
      </Stack>
      <Box
        bgGradient="to-br"
        gradientFrom="brand.subtle"
        gradientTo="peach.subtle"
        rounded="card"
        p="6"
        w={{ base: '64', md: '80' }}
        flexShrink="0"
      >
        <Box position="relative" aspectRatio={9 / 19.5} overflow="hidden" rounded="card">
          <ThemePreviewImage
            key={collection.coverThumbUrl}
            src={collection.coverThumbUrl}
            alt={t('collectionAlt', { name: title })}
            fallbackLabel={theme('previewUnavailable')}
            priority
          />
        </Box>
      </Box>
    </Flex>
  );
}

export async function HomeThemeRail({
  sort,
}: {
  sort: Extract<ThemeSort, 'trending' | 'new'>;
}): Promise<ReactElement> {
  await connection();
  const t = await getTranslations('home');
  const title = sort === 'new' ? t('sections.new') : t('sections.trending');
  let page: Paginated<ThemeCardDTO> | null = null;
  try {
    const { listThemes } = await import('@/server/queries/themes');
    page = await listThemes({ sort, limit: 12 });
  } catch (error) {
    unstable_rethrow(error);
    console.error({ scope: 'home.themes', err: error });
  }
  return (
    <Stack as="section" gap="4">
      <Flex align="center" justify="space-between" gap="3">
        <Heading as="h2" textStyle="display.lg">
          {title}
        </Heading>
        <Button asChild variant="ghost" rounded="button" minH="11">
          <Link href={sort === 'new' ? '/explore?sort=new' : '/explore'}>
            {t('sections.viewAll')}
            <Icon _rtl={{ transform: 'scaleX(-1)' }}>
              <ArrowUpRightIcon />
            </Icon>
          </Link>
        </Button>
      </Flex>
      {page === null ? (
        <CatalogError />
      ) : page.items.length ? (
        <HorizontalRail label={title}>
          {page.items.map((theme, index) => (
            <ThemeCard key={theme.id} theme={theme} priority={sort === 'trending' && index < 2} />
          ))}
        </HorizontalRail>
      ) : (
        <EmptyState
          title={t('empty.themesTitle')}
          description={t('empty.themesDescription')}
          action={
            <Button asChild colorPalette="brand" rounded="button">
              <Link href="/explore">{t('hero.explore')}</Link>
            </Button>
          }
        />
      )}
    </Stack>
  );
}

export async function HomeAesthetics(): Promise<ReactElement> {
  await connection();
  const t = await getTranslations('home');
  let aesthetics: TagDTO[] | null = null;
  try {
    const { listTags } = await import('@/server/queries/taxonomy');
    aesthetics = await listTags('aesthetic');
  } catch (error) {
    unstable_rethrow(error);
    console.error({ scope: 'home.aesthetics', err: error });
  }
  return (
    <Stack as="section" gap="5">
      <Heading as="h2" textStyle="display.lg" id="home-aesthetics">
        {t('sections.aesthetics')}
      </Heading>
      {aesthetics === null ? (
        <CatalogError />
      ) : aesthetics.length ? (
        <Flex as="nav" aria-labelledby="home-aesthetics" wrap="wrap" gap="2">
          {aesthetics.map((tag) => (
            <TagChip key={tag.slug} tag={tag} href={'/a/' + tag.slug} />
          ))}
        </Flex>
      ) : (
        <EmptyState
          title={t('empty.themesTitle')}
          description={t('empty.themesDescription')}
          action={
            <Button asChild colorPalette="brand" rounded="button">
              <Link href="/explore">{t('hero.explore')}</Link>
            </Button>
          }
        />
      )}
    </Stack>
  );
}

export async function HomeCollections(): Promise<ReactElement> {
  await connection();
  const t = await getTranslations('home');
  const title = t('sections.collections');
  let collections: CollectionCardDTO[] | null = null;
  try {
    const { getHomeCollectionCandidates } = await import('@/server/queries/collections');
    collections = selectHomeCollections(await getHomeCollectionCandidates(), new Date().getTime());
  } catch (error) {
    unstable_rethrow(error);
    console.error({ scope: 'home.collections', err: error });
  }
  return (
    <Stack as="section" gap="4">
      <Flex align="center" justify="space-between" gap="3">
        <Heading as="h2" textStyle="display.lg">
          {title}
        </Heading>
        <Button asChild variant="ghost" rounded="button" minH="11">
          <Link href="/collections">
            {t('sections.viewAll')}
            <Icon _rtl={{ transform: 'scaleX(-1)' }}>
              <ArrowUpRightIcon />
            </Icon>
          </Link>
        </Button>
      </Flex>
      {collections === null ? (
        <CatalogError />
      ) : collections.length ? (
        <HorizontalRail label={title}>
          {collections.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </HorizontalRail>
      ) : (
        <EmptyState
          title={t('empty.collectionsTitle')}
          description={t('empty.collectionsDescription')}
          action={
            <Button asChild variant="outline" rounded="button">
              <Link href="/explore">{t('hero.explore')}</Link>
            </Button>
          }
        />
      )}
    </Stack>
  );
}

export async function HomeStudioCta(): Promise<ReactElement> {
  const t = await getTranslations('home.cta');
  return (
    <FadeIn>
      <Flex
        as="section"
        gap="8"
        direction={{ base: 'column', md: 'row' }}
        align={{ base: 'start', md: 'center' }}
        justify="space-between"
        rounded="card"
        bgGradient="to-br"
        gradientFrom="brand.subtle"
        gradientTo="peach.subtle"
        p={{ base: '6', md: '10' }}
      >
        <Stack gap="3" maxW="2xl">
          <Text textStyle="caption" color="brand.fg">
            {t('eyebrow')}
          </Text>
          <Heading as="h2" textStyle="display.lg">
            {t('title')}
          </Heading>
          <Text textStyle="body.md" color="fg.muted">
            {t('description')}
          </Text>
        </Stack>
        <Button asChild colorPalette="brand" size="lg" rounded="button" flexShrink="0">
          <Link href="/studio">
            <Icon>
              <MagicWandIcon />
            </Icon>
            {t('action')}
          </Link>
        </Button>
      </Flex>
    </FadeIn>
  );
}
