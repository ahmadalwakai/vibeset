import {
  Box,
  Button,
  Container,
  Heading,
  HStack,
  Link as ChakraLink,
  List,
  Stack,
  Text,
} from '@chakra-ui/react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { ClientMessages } from '@/components/common/ClientMessages';
import { PageHeader } from '@/components/common/PageHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { Link } from '@/i18n/navigation';
import { LEGAL_IDENTITY, legalLocaleSchema } from '@/lib/legal';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const parsed = legalLocaleSchema.safeParse((await params).locale);
  if (!parsed.success) notFound();
  const t = await getTranslations({ locale: parsed.data, namespace: 'legal.support' });
  return pageMetadata({
    locale: parsed.data,
    path: '/support',
    title: t('title'),
    description: t('description'),
  });
}

export default async function SupportPage({
  params,
}: PageProps<'/[locale]'>): Promise<ReactElement> {
  const parsed = legalLocaleSchema.safeParse((await params).locale);
  if (!parsed.success) notFound();
  const locale = parsed.data;
  const [t, messages] = await Promise.all([
    getTranslations({ locale, namespace: 'legal.support' }),
    getMessages({ locale }),
  ]);

  return (
    <>
      <Container
        as="main"
        id="main"
        maxW="3xl"
        px={{ base: '4', md: '6' }}
        py={{ base: '8', md: '12' }}
      >
        <Stack gap="8">
          <HStack as="nav" aria-label={t('navigation')} gap="2" flexWrap="wrap">
            <Button asChild variant="ghost" minH="11" colorPalette="brand">
              <Link href="/">{t('home')}</Link>
            </Button>
            <Button asChild variant="ghost" minH="11" colorPalette="brand">
              <Link
                href="/support"
                locale={locale === 'ar' ? 'en' : 'ar'}
                lang={locale === 'ar' ? 'en' : 'ar'}
              >
                {t('otherLanguage')}
              </Link>
            </Button>
          </HStack>
          <PageHeader title={t('title')} description={t('description')} />

          <Stack
            as="section"
            aria-labelledby="support-contact"
            gap="3"
            p={{ base: '5', md: '6' }}
            rounded="card"
            bg="bg.panel"
            borderWidth="hairline"
            borderColor="border"
          >
            <Heading as="h2" id="support-contact" textStyle="heading.md">
              {t('contact.title')}
            </Heading>
            <Text textStyle="body.md">
              {t('contact.description', { name: LEGAL_IDENTITY.operatorName })}
            </Text>
            <ChakraLink
              href={`mailto:${LEGAL_IDENTITY.publicEmail}`}
              alignSelf="start"
              minH="11"
              textStyle="body.md"
              color="brand.fg"
              rounded="button"
              focusRing="outside"
              overflowWrap="anywhere"
            >
              <bdi dir="ltr">{LEGAL_IDENTITY.publicEmail}</bdi>
            </ChakraLink>
            <Text textStyle="body.sm" color="fg.muted">
              {t('contact.include')}
            </Text>
            <Text textStyle="body.sm" color="fg.muted">
              {t('contact.safety')}
            </Text>
          </Stack>

          <Stack as="section" aria-labelledby="support-iphone" gap="3">
            <Heading as="h2" id="support-iphone" textStyle="heading.md">
              {t('iphone.title')}
            </Heading>
            <Text textStyle="body.md">{t('iphone.description')}</Text>
            <Text textStyle="body.sm" color="fg.muted">
              {t('iphone.availability')}
            </Text>
          </Stack>

          <Stack as="section" aria-labelledby="support-wallpaper" gap="3">
            <Heading as="h2" id="support-wallpaper" textStyle="heading.md">
              {t('wallpaper.title')}
            </Heading>
            <List.Root as="ol" gap="2" ps="5" textStyle="body.md" listStyleType="decimal">
              {(['choose', 'save', 'apply'] as const).map((step) => (
                <List.Item key={step}>{t(`wallpaper.${step}`)}</List.Item>
              ))}
            </List.Root>
            <Text textStyle="body.sm" color="fg.muted">
              {t('wallpaper.trouble')}
            </Text>
            <Text textStyle="body.sm" color="fg.muted">
              {t('wallpaper.scope')}
            </Text>
          </Stack>

          <Stack as="section" aria-labelledby="support-widget" gap="3">
            <Heading as="h2" id="support-widget" textStyle="heading.md">
              {t('widget.title')}
            </Heading>
            <List.Root as="ol" gap="2" ps="5" textStyle="body.md" listStyleType="decimal">
              {(['choose', 'add', 'size'] as const).map((step) => (
                <List.Item key={step}>{t(`widget.${step}`)}</List.Item>
              ))}
            </List.Root>
            <Text textStyle="body.sm" color="fg.muted">
              {t('widget.refresh')}
            </Text>
            <Text textStyle="body.sm" color="fg.muted">
              {t('widget.language')}
            </Text>
          </Stack>

          <Stack as="section" aria-labelledby="support-connection" gap="3">
            <Heading as="h2" id="support-connection" textStyle="heading.md">
              {t('connection.title')}
            </Heading>
            <Text textStyle="body.md">{t('connection.description')}</Text>
            <Text textStyle="body.md">{t('connection.storage')}</Text>
          </Stack>

          <Stack as="section" aria-labelledby="support-safety" gap="3">
            <Heading as="h2" id="support-safety" textStyle="heading.md">
              {t('safety.title')}
            </Heading>
            <Text textStyle="body.md">{t('safety.report')}</Text>
            <Text textStyle="body.md">{t('safety.hide')}</Text>
            <Text textStyle="body.sm" color="fg.muted">
              {t('safety.contact')}
            </Text>
          </Stack>

          <Stack as="section" aria-labelledby="support-web" gap="3">
            <Heading as="h2" id="support-web" textStyle="heading.md">
              {t('web.title')}
            </Heading>
            <Text textStyle="body.md">{t('web.description')}</Text>
            <HStack gap="2" flexWrap="wrap">
              {(['ios', 'android', 'desktop'] as const).map((platform) => (
                <Button key={platform} asChild variant="outline" minH="11" colorPalette="brand">
                  <Link href={`/setup/${platform}`}>{t(`web.${platform}`)}</Link>
                </Button>
              ))}
            </HStack>
            <Box>
              <ChakraLink
                asChild
                minH="11"
                textStyle="body.md"
                color="brand.fg"
                rounded="button"
                focusRing="outside"
              >
                <Link href="/legal/privacy">{t('privacy')}</Link>
              </ChakraLink>
            </Box>
          </Stack>
        </Stack>
      </Container>
      <ClientMessages messages={{ nav: messages.nav }}>
        <SiteFooter />
      </ClientMessages>
    </>
  );
}
