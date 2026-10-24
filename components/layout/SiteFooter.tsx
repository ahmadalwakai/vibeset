import { Box, Container, Flex, HStack, Link as ChakraLink, Stack, Text } from '@chakra-ui/react';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from './LocaleSwitcher';

const legalLinks = [
  { key: 'terms', href: '/legal/terms' },
  { key: 'privacy', href: '/legal/privacy' },
  { key: 'copyright', href: '/legal/copyright' },
] as const;

export async function SiteFooter(): Promise<ReactElement> {
  const [common, nav, legal] = await Promise.all([
    getTranslations('common'),
    getTranslations('nav'),
    getTranslations('legal'),
  ]);

  return (
    <Box as="footer" borderTopWidth="hairline" borderColor="border" mt="12">
      <Container
        maxW="container.xl"
        px={{ base: '4', md: '6', lg: '8' }}
        py={{ base: '6', md: '8' }}
      >
        <Flex
          direction={{ base: 'column', md: 'row' }}
          justify="space-between"
          gap="5"
          align="start"
        >
          <Stack gap="2" maxW="sm">
            <Text fontFamily="heading" fontSize="xl" fontWeight="semibold">
              {common('brandName')}
            </Text>
            <Text textStyle="body.sm" color="fg.muted">
              {common('footer.description')}
            </Text>
            <Text textStyle="caption" color="fg.muted">
              {common('footer.copyright')}
            </Text>
          </Stack>
          <Stack gap="2" align={{ base: 'start', md: 'end' }}>
            <HStack as="nav" aria-label={nav('label')} gap="4" flexWrap="wrap">
              {legalLinks.map(({ key, href }) => (
                <ChakraLink
                  key={key}
                  asChild
                  minH="11"
                  textStyle="body.sm"
                  color="fg.muted"
                  rounded="button"
                  focusRing="outside"
                >
                  <Link href={href}>{legal(key)}</Link>
                </ChakraLink>
              ))}
              <ChakraLink
                asChild
                minH="11"
                textStyle="body.sm"
                color="fg.muted"
                rounded="button"
                focusRing="outside"
              >
                <Link href="/support">{legal('support.title')}</Link>
              </ChakraLink>
            </HStack>
            <LocaleSwitcher />
          </Stack>
        </Flex>
      </Container>
    </Box>
  );
}
