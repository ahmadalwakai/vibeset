import { Box, Button, Container, Heading, Stack, Text } from '@chakra-ui/react';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { EmotionRegistry } from '@/components/ui/emotion-registry';
import { Provider } from '@/components/ui/provider';
import { fontVariables } from '@/design/fonts';
import ar from '@/messages/ar.json';
import en from '@/messages/en.json';

export default function GlobalNotFound(): ReactElement {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body>
        <EmotionRegistry>
          <Provider>
            <Container as="main" maxW="2xl" px="4" py="20">
              <Stack gap="10" align="center" textAlign="center">
                <Text color="brand.fg" textStyle="display.lg" aria-hidden="true">
                  404
                </Text>
                <Box lang="en" dir="ltr">
                  <Heading as="h1" textStyle="display.lg">
                    {en.common.notFound.title}
                  </Heading>
                  <Text color="fg.muted" mt="3">
                    {en.common.notFound.description}
                  </Text>
                </Box>
                <Box lang="ar" dir="rtl">
                  <Heading as="h2" textStyle="display.lg">
                    {ar.common.notFound.title}
                  </Heading>
                  <Text color="fg.muted" mt="3">
                    {ar.common.notFound.description}
                  </Text>
                </Box>
                <Stack direction={{ base: 'column', sm: 'row' }} gap="3">
                  <Button asChild colorPalette="brand" rounded="button" size="lg">
                    <Link href="/" lang="en">
                      {en.common.notFound.home}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" rounded="button" size="lg">
                    <Link href="/ar" lang="ar" dir="rtl">
                      {ar.common.notFound.home}
                    </Link>
                  </Button>
                </Stack>
              </Stack>
            </Container>
          </Provider>
        </EmotionRegistry>
      </body>
    </html>
  );
}
