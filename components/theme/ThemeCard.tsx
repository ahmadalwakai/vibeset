import { Box, Link as ChakraLink, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { PressScale } from '@/components/common/motion';
import { TagChip } from '@/components/common/TagChip';
import { Link } from '@/i18n/navigation';
import type { ThemeCardDTO } from '@/lib/dto';
import { localized } from '@/lib/utils/localized';
import { ThemePreviewImage } from './ThemePreviewImage';
import { ThemeCardActions } from './ThemeCardActions';
import { ThemeCardInteraction } from './ThemeCardInteraction';

export interface ThemeCardProps {
  theme: ThemeCardDTO;
  priority?: boolean;
  actions?: ReactNode;
}

export function ThemeCard({ theme, priority = false, actions }: ThemeCardProps): ReactElement {
  const locale = useLocale();
  const t = useTranslations('theme');
  const name = localized(theme, locale);
  const tags = [
    ...theme.tags.filter((tag) => tag.kind === 'aesthetic'),
    ...theme.tags.filter((tag) => tag.kind !== 'aesthetic'),
  ].slice(0, 2);
  return (
    <ThemeCardInteraction themeId={theme.id}>
      <Box
        position="relative"
        h="full"
        minW="0"
        bg="card.bg"
        rounded="card"
        shadow="card"
        contentVisibility="auto"
        containIntrinsicSize="auto {sizes.xl}"
        transitionProperty="transform"
        transitionDuration="moderate"
        transitionTimingFunction="standard"
        css={{
          '@media (hover: hover) and (prefers-reduced-motion: no-preference)': {
            '&:hover': { transform: 'translateY(calc(-1 * {spacing.1}))', shadow: 'float' },
          },
        }}
      >
        <PressScale>
          <ChakraLink
            asChild
            display="block"
            color="fg"
            rounded="card"
            textDecoration="none"
            focusRing="outside"
            _hover={{ textDecoration: 'none' }}
          >
            <Link href={`/t/${theme.slug}`}>
              <Box
                position="relative"
                aspectRatio={9 / 19.5}
                overflow="hidden"
                rounded="card"
                bg={theme.dominantColor ?? 'bg.muted'}
              >
                <ThemePreviewImage
                  key={theme.thumbUrl}
                  src={theme.thumbUrl}
                  alt={t('previewAlt', { name })}
                  fallbackLabel={t('previewUnavailable')}
                  priority={priority}
                  dominantColor={theme.dominantColor}
                />
              </Box>
              <Stack gap="2" p={{ base: '3', md: '4' }}>
                <Text
                  textStyle="body.sm"
                  fontWeight="semibold"
                  lineClamp="2"
                  overflowWrap="anywhere"
                >
                  {name}
                </Text>
                <Box display="flex" gap="1.5" flexWrap="wrap" minW="0">
                  {tags.map((tag) => (
                    <TagChip key={tag.slug} tag={tag} />
                  ))}
                </Box>
                {theme.creator ? (
                  <Text textStyle="caption" color="fg.muted" truncate>
                    {t('by')} <bdi>@{theme.creator.handle}</bdi>
                  </Text>
                ) : null}
              </Stack>
            </Link>
          </ChakraLink>
        </PressScale>
        {(actions ?? <ThemeCardActions themeId={theme.id} name={name} />) ? (
          <Box position="absolute" top="3" insetEnd="3" zIndex="1">
            {actions ?? <ThemeCardActions themeId={theme.id} name={name} />}
          </Box>
        ) : null}
      </Box>
    </ThemeCardInteraction>
  );
}
