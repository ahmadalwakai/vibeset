import {
  Box,
  Container,
  Flex,
  HStack,
  Icon,
  IconButton,
  Link as ChakraLink,
  Popover,
  Portal,
  Skeleton,
  SkeletonCircle,
  Stack,
  Text,
} from '@chakra-ui/react';
import { DotsThreeIcon } from '@phosphor-icons/react/dist/ssr/DotsThree';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/ssr/MagnifyingGlass';
import { getTranslations } from 'next-intl/server';
import { Suspense, type ReactElement } from 'react';
import { BrandWordmark } from '@/components/common/BrandWordmark';
import { SearchInput } from '@/components/explore/SearchInput';
import { ColorModeButton } from '@/components/ui/color-mode';
import { Link } from '@/i18n/navigation';
import { DesktopNav } from './BottomNav';
import { HideOnScroll } from './HideOnScroll';
import { LocaleSwitcher } from './LocaleSwitcher';
import { HeaderAccount } from './HeaderAccount';

export async function SiteHeader(): Promise<ReactElement> {
  const [common, nav] = await Promise.all([getTranslations('common'), getTranslations('nav')]);

  return (
    <HideOnScroll>
      <Box
        h="14"
        bg="chrome.bg"
        backdropFilter="saturate(180%) blur(16px)"
        borderBottomWidth="hairline"
        borderColor="border"
        css={{
          '@media (prefers-reduced-transparency: reduce)': {
            bg: 'bg.panel',
            backdropFilter: 'none',
          },
        }}
      >
        <Container h="full" maxW="container.xl" px={{ base: '4', md: '6', lg: '8' }}>
          <Flex h="full" gap={{ base: '3', md: '2', lg: '5' }} align="center">
            <ChakraLink
              asChild
              gap="1.5"
              minH="11"
              flexShrink="0"
              color="fg"
              rounded="button"
              _hover={{ textDecoration: 'none', color: 'brand.fg' }}
              focusRing="outside"
            >
              <Link href="/" aria-label={common('brandName')}>
                <BrandWordmark label={common('brandName')} />
              </Link>
            </ChakraLink>

            <Box display={{ base: 'none', md: 'block' }}>
              <DesktopNav />
            </Box>

            <Box display={{ base: 'none', lg: 'block' }} flex="1" minW="24" maxW="64">
              <Suspense fallback={<Skeleton h="11" rounded="full" w="full" />}>
                <SearchInput compact />
              </Suspense>
            </Box>

            <HStack ms="auto" gap={{ base: '1', md: '0', lg: '1' }} flexShrink="0">
              <IconButton
                asChild
                variant="ghost"
                size="lg"
                rounded="button"
                aria-label={common('search')}
                display={{ base: 'inline-flex', lg: 'none' }}
              >
                <Link href="/explore?focus=1">
                  <Icon asChild boxSize="5">
                    <MagnifyingGlassIcon aria-hidden />
                  </Icon>
                </Link>
              </IconButton>

              <HStack display={{ base: 'none', md: 'flex' }} gap={{ base: '0', lg: '1' }}>
                <LocaleSwitcher compact />
                <ColorModeButton rounded="button" />
                <Suspense fallback={<SkeletonCircle size="8" />}>
                  <HeaderAccount />
                </Suspense>
              </HStack>

              <Box display={{ base: 'block', md: 'none' }}>
                <Popover.Root lazyMount unmountOnExit positioning={{ placement: 'bottom-end' }}>
                  <Popover.Trigger asChild>
                    <IconButton variant="ghost" size="lg" rounded="button" aria-label={nav('more')}>
                      <Icon asChild boxSize="6">
                        <DotsThreeIcon aria-hidden weight="bold" />
                      </Icon>
                    </IconButton>
                  </Popover.Trigger>
                  <Portal>
                    <Popover.Positioner>
                      <Popover.Content w="64" rounded="card" shadow="float">
                        <Popover.Header pb="0">
                          <Popover.Title textStyle="heading.sm">{nav('more')}</Popover.Title>
                        </Popover.Header>
                        <Popover.Body>
                          <Stack gap="3">
                            <Flex align="center" justify="space-between" gap="2">
                              <Text textStyle="body.sm">{nav('language')}</Text>
                              <LocaleSwitcher />
                            </Flex>
                            <Flex align="center" justify="space-between" gap="2">
                              <Text textStyle="body.sm">{common('toggleColorMode')}</Text>
                              <ColorModeButton rounded="button" />
                            </Flex>
                            <Suspense fallback={<SkeletonCircle size="8" />}>
                              <HeaderAccount />
                            </Suspense>
                          </Stack>
                        </Popover.Body>
                      </Popover.Content>
                    </Popover.Positioner>
                  </Portal>
                </Popover.Root>
              </Box>
            </HStack>
          </Flex>
        </Container>
      </Box>
    </HideOnScroll>
  );
}
