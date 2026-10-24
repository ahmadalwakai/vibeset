import {
  Avatar,
  Box,
  Button,
  HStack,
  Link as ChakraLink,
  Skeleton,
  SkeletonCircle,
  Stack,
  Text,
} from '@chakra-ui/react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense, type ReactElement } from 'react';
import { CatalogError } from '@/components/common/CatalogError';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { ThemeGrid } from '@/components/theme/ThemeGrid';
import { ThemeGridSkeleton } from '@/components/theme/ThemeGridSkeleton';
import { Link, redirect } from '@/i18n/navigation';
import type { CreatorPublicDTO } from '@/lib/dto';
import { creatorHandleSchema, themeListQuerySchema } from '@/lib/validation/themes';

type Props = PageProps<'/[locale]/c/[handle]'>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('creator.public');
  return { title: t('metadataTitle'), description: t('metadataDescription') };
}

async function CreatorContent({ params, searchParams }: Props): Promise<ReactElement> {
  await connection();
  const [{ handle }, raw, locale, t, common] = await Promise.all([
    params,
    searchParams,
    getLocale(),
    getTranslations('creator.public'),
    getTranslations('common.pagination'),
  ]);
  if (!creatorHandleSchema.safeParse(handle).success) notFound();
  const href = `/c/${handle}`;
  const parsed = themeListQuerySchema.safeParse({ sort: 'new', cursor: raw.cursor, limit: 24 });
  if (!parsed.success) return redirect({ href, locale });
  let creator: CreatorPublicDTO | null;
  try {
    const { getCreatorPublic } = await import('@/server/queries/creators');
    creator = await getCreatorPublic(handle, parsed.data.cursor);
  } catch {
    return <CatalogError />;
  }
  if (!creator) notFound();
  return (
    <Stack gap="8">
      <Stack gap="5">
        <Avatar.Root size="2xl">
          <Avatar.Fallback name={creator.displayName} />
          <Avatar.Image src={creator.avatarUrl ?? undefined} alt={creator.displayName} />
        </Avatar.Root>
        <PageHeader
          eyebrow={t('eyebrow')}
          title={creator.displayName}
          description={creator.bio ?? undefined}
        />
        <Text textStyle="body.sm" color="fg.muted">
          <bdi>@{creator.handle}</bdi>
        </Text>
        {creator.links.length ? (
          <HStack gap="3" flexWrap="wrap">
            {creator.links.map((link) => (
              <ChakraLink
                key={link.url}
                href={link.url}
                target="_blank"
                rel="nofollow ugc noopener"
                minH="11"
                px="4"
                rounded="button"
                borderWidth="hairline"
                borderColor="border"
                color="brand.fg"
                focusRing="outside"
              >
                {link.label}
              </ChakraLink>
            ))}
          </HStack>
        ) : null}
      </Stack>
      <Text as="h2" textStyle="heading.md">
        {t('themes')}
      </Text>
      {creator.themes.items.length ? (
        <ThemeGrid themes={creator.themes.items} priority />
      ) : (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Button asChild size="lg" colorPalette="brand">
              <Link href="/explore">{t('browse')}</Link>
            </Button>
          }
        />
      )}
      <HStack justify="space-between" gap="3" flexWrap="wrap">
        {parsed.data.cursor ? (
          <Button asChild variant="outline" size="lg">
            <Link href={href}>{common('first')}</Link>
          </Button>
        ) : (
          <Box />
        )}
        {creator.themes.nextCursor ? (
          <Button asChild colorPalette="brand" size="lg">
            <Link href={{ pathname: href, query: { cursor: creator.themes.nextCursor } }}>
              {common('next')}
            </Link>
          </Button>
        ) : null}
      </HStack>
    </Stack>
  );
}

export default function CreatorPage(props: Props): ReactElement {
  return (
    <Box py={{ base: '8', md: '12' }}>
      <Suspense
        fallback={
          <Stack gap="6">
            <SkeletonCircle boxSize="20" />
            <Skeleton h="10" w="2/3" maxW="xl" />
            <Skeleton h="6" w="full" maxW="2xl" />
            <ThemeGridSkeleton />
          </Stack>
        }
      >
        <CreatorContent {...props} />
      </Suspense>
    </Box>
  );
}
