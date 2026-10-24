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
  Skeleton,
  Stack,
  Text,
} from '@chakra-ui/react';
import { ListIcon } from '@phosphor-icons/react/dist/csr/List';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { BrandWordmark } from '@/components/common/BrandWordmark';
import { ErrorState } from '@/components/common/ErrorState';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import { ColorModeButton } from '@/components/ui/color-mode';
import { Link, usePathname } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { sessionErrorCode } from '@/lib/client/session-error';
import { LocaleSwitcher } from './LocaleSwitcher';

const links = [
  { key: 'dashboard', href: '/creator' },
  { key: 'themes', href: '/creator/themes' },
  { key: 'newTheme', href: '/creator/themes/new' },
  { key: 'profile', href: '/creator/profile' },
] as const;

export function CreatorShell({
  ownerId,
  children,
  handle,
  isApproved,
}: {
  ownerId: string;
  children: ReactNode;
  handle: string | null;
  isApproved: boolean;
}): ReactElement {
  const session = authClient.useSession();
  if (session.isPending)
    return (
      <Stack gap="6" p="6">
        <Skeleton h="16" />
        <Skeleton h="96" />
      </Stack>
    );
  if (!session.data && session.error)
    return (
      <ErrorState
        code={sessionErrorCode(session.error)}
        onRetry={() => void session.refetch()}
        retrying={session.isRefetching}
      />
    );
  if (session.data?.user.id !== ownerId) return <ErrorState code="UNAUTHENTICATED" />;
  return (
    <CreatorShellContent key={ownerId} handle={handle} isApproved={isApproved}>
      {children}
    </CreatorShellContent>
  );
}

function CreatorShellContent({
  children,
  handle,
  isApproved,
}: {
  children: ReactNode;
  handle: string | null;
  isApproved: boolean;
}): ReactElement {
  const t = useTranslations('creator.nav');
  const common = useTranslations('common');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navigation = (
    <Stack as="nav" aria-label={t('label')} gap="2">
      {links.map(({ key, href }) => {
        const active =
          pathname === href ||
          (key === 'themes' &&
            pathname.startsWith('/creator/themes/') &&
            pathname !== '/creator/themes/new');
        return (
          <Button
            key={key}
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
              {t(key)}
            </Link>
          </Button>
        );
      })}
      {handle && isApproved ? (
        <Button asChild minH="11" variant="outline" mt="4">
          <Link href={`/c/${handle}`} onClick={() => setOpen(false)}>
            {t('publicPage')}
          </Link>
        </Button>
      ) : null}
      <Button asChild minH="11" variant="ghost">
        <Link href="/" onClick={() => setOpen(false)}>
          {t('backSite')}
        </Link>
      </Button>
    </Stack>
  );
  return (
    <Box minH="100dvh" bg="bg">
      <ChakraLink
        href="#creator-main"
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
        <Container maxW="container.xl" px={{ base: '4', md: '6' }}>
          <Flex minH="16" align="center" gap="2">
            <IconButton
              display={{ base: 'inline-flex', lg: 'none' }}
              aria-label={t('menu')}
              aria-haspopup="dialog"
              aria-expanded={open}
              variant="ghost"
              minH="11"
              minW="11"
              onClick={() => setOpen(true)}
            >
              <Icon asChild boxSize="6">
                <ListIcon aria-hidden />
              </Icon>
            </IconButton>
            <ChakraLink asChild minH="11" color="fg" _hover={{ textDecoration: 'none' }}>
              <Link href="/">
                <BrandWordmark label={common('brandName')} />
              </Link>
            </ChakraLink>
            <Text display={{ base: 'none', sm: 'block' }} textStyle="caption" color="fg.muted">
              {t('label')}
            </Text>
            <Flex ms="auto" gap="1" align="center">
              <LocaleSwitcher compact />
              <ColorModeButton />
            </Flex>
          </Flex>
        </Container>
      </Box>
      <Container maxW="container.xl" px={{ base: '4', md: '6' }}>
        <Grid
          templateColumns={{
            base: 'minmax(0, 1fr)',
            lg: 'calc({sizes.60} + {sizes.2}) minmax(0, 1fr)',
          }}
          gap={{ base: '0', lg: '8' }}
        >
          <Box
            as="aside"
            display={{ base: 'none', lg: 'block' }}
            py="8"
            borderEndWidth="hairline"
            borderColor="border"
            pe="5"
          >
            {navigation}
          </Box>
          <Box as="main" id="creator-main" tabIndex={-1} minW="0" py={{ base: '6', lg: '8' }}>
            {children}
          </Box>
        </Grid>
      </Container>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title={t('label')}>
        {navigation}
      </ResponsiveSheet>
    </Box>
  );
}
