import { Box, Button, Flex, Heading, Icon, Stack, Text } from '@chakra-ui/react';
import { ArrowUpRightIcon, SparkleIcon } from '@phosphor-icons/react/ssr';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { FadeIn } from '@/components/common/motion';
import { Link } from '@/i18n/navigation';

export default async function HomePage(): Promise<ReactElement> {
  const t = await getTranslations('home.hero');

  return (
    <Flex
      as="section"
      align="center"
      gap={{ base: '10', lg: '16' }}
      direction={{ base: 'column', lg: 'row' }}
      py={{ base: '12', md: '20', lg: '24' }}
      minH={{ base: 'auto', md: 'xl' }}
    >
      <Box flex="1" maxW="2xl">
        <FadeIn>
          <Stack gap={{ base: '6', md: '8' }} align="start">
            <Flex align="center" gap="2" textStyle="caption" color="brand.fg">
              <SparkleIcon weight="fill" aria-hidden />
              <Text>{t('eyebrow')}</Text>
            </Flex>
            <Heading as="h1" textStyle="display.2xl" textWrap="balance">
              {t('title')}
            </Heading>
            <Text textStyle="body.md" color="fg.muted" maxW="xl" textWrap="pretty">
              {t('subtitle')}
            </Text>
            <Flex gap="3" wrap="wrap">
              <Button asChild size="lg" colorPalette="brand" rounded="button">
                <Link href="/explore">
                  {t('explore')}
                  <Icon _rtl={{ transform: 'scaleX(-1)' }}>
                    <ArrowUpRightIcon />
                  </Icon>
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" rounded="button">
                <Link href="/studio">{t('studio')}</Link>
              </Button>
            </Flex>
          </Stack>
        </FadeIn>
      </Box>
      <Flex
        aria-hidden="true"
        position="relative"
        align="center"
        justify="center"
        flexShrink="0"
        boxSize={{ base: '72', md: '96', lg: 'lg' }}
        maxW="full"
        rounded="full"
        bgGradient="to-br"
        gradientFrom="brand.subtle"
        gradientTo="peach.subtle"
      >
        <Box
          position="absolute"
          boxSize="72%"
          rounded="full"
          borderWidth="hairline"
          borderColor="brand.muted"
          transform="rotate(-20deg) scaleX(1.3)"
        />
        <Box color="brand.solid" transform="rotate(-12deg)" boxSize="3/5">
          <SparkleIcon weight="fill" size="100%" />
        </Box>
        <Box position="absolute" top="12" insetEnd="12" color="peach.solid">
          <Icon boxSize="8">
            <SparkleIcon weight="fill" />
          </Icon>
        </Box>
      </Flex>
    </Flex>
  );
}
