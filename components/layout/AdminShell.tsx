'use client';

import {
  Box,
  Button,
  Container,
  Flex,
  Grid,
  Icon,
  IconButton,
  Link as ChakraLink,
  Stack,
  Text,
} from '@chakra-ui/react';
import { ListIcon } from '@phosphor-icons/react/dist/csr/List';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { BrandWordmark } from '@/components/common/BrandWordmark';
import { PublishQueueIndicator } from '@/components/admin/PublishQueue';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import { ColorModeButton } from '@/components/ui/color-mode';
import { Link, usePathname } from '@/i18n/navigation';
import { LocaleSwitcher } from './LocaleSwitcher';

const routes = [
  'dashboard',
  'review',
  'publish',
  'themes',
  'generator',
  'collections',
  'tags',
  'apps',
  'reports',
  'users',
  'creators',
  'settings',
  'audit',
] as const;
export function AdminShell({
  children,
  badges,
}: {
  children: ReactNode;
  badges: ReactNode;
}): ReactElement {
  const t = useTranslations('admin.nav');
  const common = useTranslations('common');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navigation = (
    <Stack as="nav" aria-label={t('label')} gap="1">
      {routes.map((route) => {
        const href = route === 'dashboard' ? '/admin' : `/admin/${route}`;
        const active =
          pathname === href || (route !== 'dashboard' && pathname.startsWith(`${href}/`));
        return (
          <Button
            key={route}
            asChild
            minH="11"
            justifyContent="start"
            variant={active ? 'subtle' : 'ghost'}
            colorPalette="brand"
          >
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {t(route)}
            </Link>
          </Button>
        );
      })}
      <Button asChild minH="11" variant="outline" mt="4">
        <Link href="/" onClick={() => setOpen(false)}>
          {t('backSite')}
        </Link>
      </Button>
    </Stack>
  );
  return (
    <Box minH="100dvh" bg="bg">
      <ChakraLink
        href="#admin-main"
        position="fixed"
        insetStart="4"
        top="2"
        zIndex="skipNav"
        bg="brand.solid"
        color="brand.contrast"
        px="5"
        minH="11"
        rounded="button"
        transform="translateY(-200%)"
        _focusVisible={{ transform: 'translateY(0)', outline: 'auto' }}
      >
        {common('skipToContent')}
      </ChakraLink>
      <Box as="header" borderBottomWidth="hairline" borderColor="border" bg="bg.panel">
        <Container maxW="full" px={{ base: '4', md: '6' }}>
          <Flex minH="16" gap="2" align="center">
            <IconButton
              display={{ base: 'inline-flex', lg: 'none' }}
              minH="11"
              minW="11"
              variant="ghost"
              aria-label={t('menu')}
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Icon asChild boxSize="6">
                <ListIcon aria-hidden />
              </Icon>
            </IconButton>
            <Link href="/">
              <BrandWordmark label={common('brandName')} />
            </Link>
            <Text display={{ base: 'none', md: 'block' }} textStyle="body.sm" color="fg.muted">
              {t('title')}
            </Text>
            <Flex ms="auto" gap="1">
              <LocaleSwitcher />
              <ColorModeButton />
            </Flex>
          </Flex>
          {badges}
          <PublishQueueIndicator />
        </Container>
      </Box>
      <Grid
        templateColumns={{ base: 'minmax(0,1fr)', lg: '15.5rem minmax(0,1fr)' }}
        gap={{ base: '0', lg: '6' }}
        maxW="full"
        px={{ base: '4', md: '6' }}
        py="6"
      >
        <Box
          as="aside"
          display={{ base: 'none', lg: 'block' }}
          position="sticky"
          top="6"
          alignSelf="start"
          maxH="calc(100dvh - 3rem)"
          overflowY="auto"
        >
          {navigation}
        </Box>
        <Box as="main" id="admin-main" tabIndex={-1} minW="0">
          {children}
        </Box>
      </Grid>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title={t('label')}>
        {navigation}
      </ResponsiveSheet>
    </Box>
  );
}
