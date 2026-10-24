import { Box, Link as ChakraLink, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { PressScale } from '@/components/common/motion';
import { Link } from '@/i18n/navigation';
import type { CollectionCardDTO } from '@/lib/dto';
import { formatNumber } from '@/lib/utils/format';
import { localized } from '@/lib/utils/localized';
import { ThemePreviewImage } from './ThemePreviewImage';

export function CollectionCard({
  collection,
}: {
  collection: CollectionCardDTO;
}): ReactElement | null {
  const locale = useLocale();
  const t = useTranslations('explore.collections');
  const theme = useTranslations('theme');
  if (!collection.slug) return null;
  const title = localized(collection, locale, 'title');
  return (
    <PressScale>
      <ChakraLink
        asChild
        display="block"
        minW="0"
        rounded="card"
        bg="card.bg"
        shadow="card"
        color="fg"
        textDecoration="none"
        focusRing="outside"
        _hover={{ textDecoration: 'none' }}
      >
        <Link href={`/collections/${collection.slug}`}>
          <Box
            position="relative"
            aspectRatio={3 / 2}
            overflow="hidden"
            rounded="card"
            bg="bg.muted"
          >
            <ThemePreviewImage
              key={collection.coverThumbUrl}
              src={collection.coverThumbUrl}
              alt={title}
              fallbackLabel={theme('previewUnavailable')}
            />
          </Box>
          <Stack gap="2" p="4">
            <Text textStyle="heading.sm" lineClamp="2" overflowWrap="anywhere">
              {title}
            </Text>
            <Text textStyle="caption" color="fg.muted">
              {t('themeCount', {
                count: collection.itemCount,
                formattedCount: formatNumber(collection.itemCount, locale),
              })}
            </Text>
          </Stack>
        </Link>
      </ChakraLink>
    </PressScale>
  );
}
