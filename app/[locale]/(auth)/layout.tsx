import {
  Box,
  Container,
  HStack,
  Icon,
  Image,
  Link as ChakraLink,
  Stack,
  Text,
} from '@chakra-ui/react';
import { ArrowLeftIcon } from '@phosphor-icons/react/ssr';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { BrandWordmark } from '@/components/common/BrandWordmark';
import { Link } from '@/i18n/navigation';

export default async function AuthLayout({
  children,
}: LayoutProps<'/[locale]'>): Promise<ReactElement> {
  const common = await getTranslations('common');

  return (
    <Container as="main" minH="100dvh" maxW="lg" px="4" py={{ base: '6', md: '12' }}>
      <Stack gap="8" minH="full">
        <ChakraLink
          asChild
          alignSelf="start"
          minH="11"
          rounded="button"
          px="2"
          color="fg.muted"
          focusRing="outside"
        >
          <Link href="/">
            <Icon asChild boxSize="5" _rtl={{ transform: 'scaleX(-1)' }}>
              <ArrowLeftIcon aria-hidden />
            </Icon>
            {common('back')}
          </Link>
        </ChakraLink>
        <Stack align="center" gap="3">
          <Image
            src="/brand/app-icon.svg"
            alt=""
            width="64"
            height="64"
            boxSize="16"
            rounded="input"
          />
          <BrandWordmark label={common('brandName')} size="display" />
        </Stack>
        <Box
          bg="card.bg"
          borderWidth="hairline"
          borderColor="border"
          rounded="card"
          shadow="card"
          overflow="hidden"
        >
          <Box
            h="1.5"
            bgGradient="to-r"
            gradientFrom="brand.500"
            gradientTo="peach.400"
            aria-hidden="true"
          />
          <Box p={{ base: '6', md: '8' }}>{children}</Box>
        </Box>
        <HStack justify="center">
          <Text textStyle="caption" color="fg.muted">
            {common('footer.description')}
          </Text>
        </HStack>
      </Stack>
    </Container>
  );
}
