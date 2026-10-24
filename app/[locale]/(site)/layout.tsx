import { Box, Container, Link as ChakraLink } from '@chakra-ui/react';
import { getMessages, getTranslations } from 'next-intl/server';
import { Suspense, type ReactElement } from 'react';
import { BottomNav } from '@/components/layout/BottomNav';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteAnnouncement } from '@/components/layout/SiteAnnouncement';
import { FavoritesProvider } from '@/components/theme/FavoritesProvider';
import { ClientMessages } from '@/components/common/ClientMessages';
import { selectClientMessages } from '@/lib/client-messages';

export default async function SiteLayout({
  children,
}: LayoutProps<'/[locale]'>): Promise<ReactElement> {
  const [t, messages] = await Promise.all([getTranslations('common'), getMessages()]);

  return (
    <ClientMessages messages={selectClientMessages(messages, 'site')}>
      <FavoritesProvider>
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
          <Suspense fallback={null}>
            <SiteAnnouncement />
          </Suspense>
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
      </FavoritesProvider>
    </ClientMessages>
  );
}
