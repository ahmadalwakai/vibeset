import { Box, Container, Link as ChakraLink } from '@chakra-ui/react';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { BottomNav } from '@/components/layout/BottomNav';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';

export default async function SiteLayout({
  children,
}: LayoutProps<'/[locale]'>): Promise<ReactElement> {
  const t = await getTranslations('common');

  return (
    <Box pb={{ base: 'calc({spacing.16} + env(safe-area-inset-bottom))', md: '0' }}>
      <ChakraLink
        href="#main"
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
        {t('skipToContent')}
      </ChakraLink>
      <SiteHeader />
      <Container
        as="main"
        id="main"
        tabIndex={-1}
        maxW="container.xl"
        px={{ base: '4', md: '6', lg: '8' }}
      >
        {children}
      </Container>
      <SiteFooter />
      <BottomNav />
    </Box>
  );
}
