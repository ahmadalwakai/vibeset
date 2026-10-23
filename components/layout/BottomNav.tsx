'use client';

import { Box, Flex, HStack, Icon, Link as ChakraLink, Skeleton, Text } from '@chakra-ui/react';
import { HeartIcon } from '@phosphor-icons/react/dist/csr/Heart';
import { HouseIcon } from '@phosphor-icons/react/dist/csr/House';
import { MagicWandIcon } from '@phosphor-icons/react/dist/csr/MagicWand';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { UserCircleIcon } from '@phosphor-icons/react/dist/csr/UserCircle';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { Suspense, useId } from 'react';
import type { ReactElement } from 'react';
import { springs } from '@/design/motion';
import { Link, usePathname } from '@/i18n/navigation';

const navItems = [
  { key: 'home', href: '/', icon: HouseIcon },
  { key: 'explore', href: '/explore', icon: MagnifyingGlassIcon },
  { key: 'studio', href: '/studio', icon: MagicWandIcon },
  { key: 'saved', href: '/saved', icon: HeartIcon },
  { key: 'account', href: '/account', icon: UserCircleIcon },
] as const;

function isActivePath(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function DesktopNavContent(): ReactElement {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <HStack as="nav" aria-label={t('primary')} gap="1">
      {navItems.slice(0, 4).map(({ key, href }) => {
        const active = isActivePath(pathname, href);

        return (
          <ChakraLink
            key={key}
            asChild
            minH="11"
            px="2"
            rounded="button"
            textStyle="body.sm"
            fontWeight="medium"
            color={active ? 'brand.fg' : 'fg.muted'}
            bg={active ? 'brand.subtle' : 'transparent'}
            _hover={{ bg: 'bg.subtle', color: 'fg', textDecoration: 'none' }}
            focusRing="outside"
          >
            <Link href={href} aria-current={active ? 'page' : undefined}>
              {t(key)}
            </Link>
          </ChakraLink>
        );
      })}
    </HStack>
  );
}

export function DesktopNav(): ReactElement {
  return (
    <Suspense fallback={<Skeleton h="11" w="64" rounded="button" />}>
      <DesktopNavContent />
    </Suspense>
  );
}

function BottomNavContent(): ReactElement {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const groupId = useId();

  return (
    <Box
      as="nav"
      aria-label={t('mobile')}
      display={{ base: 'block', md: 'none' }}
      position="fixed"
      insetInline="0"
      bottom="0"
      zIndex="sticky"
      bg="chrome.bg"
      backdropFilter="saturate(180%) blur(16px)"
      borderTopWidth="hairline"
      borderColor="border"
      h="calc({sizes.16} + env(safe-area-inset-bottom))"
      pb="env(safe-area-inset-bottom)"
      css={{
        '@media (prefers-reduced-transparency: reduce)': {
          bg: 'bg.panel',
          backdropFilter: 'none',
        },
      }}
    >
      <LayoutGroup id={groupId}>
        <Flex h="full" px="2" align="stretch">
          {navItems.map(({ key, href, icon: TabIcon }) => {
            const active = isActivePath(pathname, href);

            return (
              <ChakraLink
                key={key}
                asChild
                flex="1"
                minW="0"
                minH="11"
                flexDirection="column"
                justifyContent="center"
                gap="0.5"
                px="1"
                rounded="button"
                color={active ? 'brand.fg' : 'fg.muted'}
                textDecoration="none"
                _hover={{ textDecoration: 'none', color: 'brand.fg' }}
                focusRing="inside"
              >
                <Link href={href} aria-current={active ? 'page' : undefined}>
                  <Box position="relative" w="12" h="7" display="grid" placeItems="center">
                    {active ? (
                      reducedMotion ? (
                        <Box position="absolute" inset="0" rounded="full" bg="brand.muted" />
                      ) : (
                        <Box asChild position="absolute" inset="0" rounded="full" bg="brand.muted">
                          <motion.div layoutId="active-pill" transition={springs.layout} />
                        </Box>
                      )
                    ) : null}
                    <Icon asChild boxSize="6" position="relative">
                      <TabIcon aria-hidden weight={active ? 'fill' : 'regular'} />
                    </Icon>
                  </Box>
                  <Text as="span" textStyle="caption" maxW="full" lineClamp="1">
                    {t(key)}
                  </Text>
                </Link>
              </ChakraLink>
            );
          })}
        </Flex>
      </LayoutGroup>
    </Box>
  );
}

export function BottomNav(): ReactElement {
  return (
    <Suspense
      fallback={
        <Box
          display={{ base: 'block', md: 'none' }}
          position="fixed"
          insetInline="0"
          bottom="0"
          zIndex="sticky"
          h="calc({sizes.16} + env(safe-area-inset-bottom))"
          bg="bg.panel"
        />
      }
    >
      <BottomNavContent />
    </Suspense>
  );
}
