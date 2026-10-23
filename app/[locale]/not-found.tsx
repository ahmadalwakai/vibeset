import { Button, Container, Heading, Stack, Text } from '@chakra-ui/react';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { Link } from '@/i18n/navigation';

export default async function NotFound(): Promise<ReactElement> {
  const t = await getTranslations('common.notFound');
  return (
    <Container as="main" id="main" tabIndex={-1} maxW="container.xl" px="4" py="20">
      <Stack align="center" gap="6" textAlign="center">
        <Text color="brand.fg" textStyle="display.lg" aria-hidden="true">
          404
        </Text>
        <Heading as="h1" textStyle="display.lg">
          {t('title')}
        </Heading>
        <Text color="fg.muted" maxW="lg">
          {t('description')}
        </Text>
        <Button asChild colorPalette="brand" size="lg" rounded="button">
          <Link href="/">{t('home')}</Link>
        </Button>
      </Stack>
    </Container>
  );
}
