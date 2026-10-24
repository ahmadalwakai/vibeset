import { Button, HStack, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { ViewStatisticsControl } from '@/components/common/ViewStatisticsControl';
import { Prose } from '@/components/ui/prose';
import { getLegalContent } from '@/content/legal';
import { Link } from '@/i18n/navigation';
import { LEGAL_IDENTITY, legalDocumentSchema, legalRouteSchema } from '@/lib/legal';
import { pageMetadata } from '@/lib/seo';

export function generateStaticParams(): { doc: string }[] {
  return legalDocumentSchema.options.map((doc) => ({ doc }));
}

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/legal/[doc]'>): Promise<Metadata> {
  const parsed = legalRouteSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { locale, doc } = parsed.data;
  const content = getLegalContent(locale, doc);
  return pageMetadata({
    locale,
    path: `/legal/${doc}`,
    title: content.title,
    description: content.description,
  });
}

export default async function LegalPage({
  params,
}: PageProps<'/[locale]/legal/[doc]'>): Promise<ReactElement> {
  const parsed = legalRouteSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { locale, doc } = parsed.data;
  const { title, description, Body } = getLegalContent(locale, doc);
  const t = await getTranslations({ locale, namespace: 'legal' });
  return (
    <Stack maxW="3xl" mx="auto" gap="8" py={{ base: '8', md: '12' }}>
      <PageHeader title={title} description={description} />
      <HStack as="nav" aria-label={title} gap="2" flexWrap="wrap">
        {legalDocumentSchema.options.map((document) => (
          <Button
            key={document}
            asChild
            minH="11"
            variant={document === doc ? 'subtle' : 'ghost'}
            colorPalette="brand"
          >
            <Link href={`/legal/${document}`} aria-current={document === doc ? 'page' : undefined}>
              {t(document)}
            </Link>
          </Button>
        ))}
      </HStack>
      <Prose size="lg" maxW="full" overflowWrap="anywhere">
        <Body {...LEGAL_IDENTITY} />
      </Prose>
      {doc === 'privacy' ? <ViewStatisticsControl /> : null}
    </Stack>
  );
}
