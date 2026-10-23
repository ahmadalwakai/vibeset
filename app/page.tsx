import {
  Box,
  Container,
  Flex,
  Heading,
  HStack,
  Link,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import { SparkleIcon } from '@phosphor-icons/react/ssr';
import type { ReactElement } from 'react';
import { BootstrapActions } from '@/components/common/bootstrap-actions';
import { FadeIn, PopIn } from '@/components/common/motion';
import { ColorModeButton } from '@/components/ui/color-mode';
import ar from '@/messages/ar.json';
import en from '@/messages/en.json';

const copy = en.common.bootstrap;
const textSamples = [
  ['display.2xl', copy.display2xl],
  ['display.xl', copy.displayXl],
  ['display.lg', copy.displayLg],
  ['heading.md', copy.headingMd],
  ['heading.sm', copy.headingSm],
  ['body.md', copy.bodyMd],
  ['body.sm', copy.bodySm],
  ['caption', copy.caption],
] as const;
const palettes = [
  { label: copy.brandLabel, colors: ['brand.100', 'brand.300', 'brand.500', 'brand.600'] },
  { label: copy.peachLabel, colors: ['peach.100', 'peach.300', 'peach.400', 'peach.500'] },
  {
    label: copy.neutralLabel,
    colors: ['neutral.100', 'neutral.300', 'neutral.600', 'neutral.900'],
  },
] as const;

export default function BootstrapPage(): ReactElement {
  return (
    <Container maxW="container.xl" px={{ base: '4', md: '6', lg: '8' }}>
      <Link
        href="#main"
        position="absolute"
        insetStart="4"
        top="4"
        transform="translateY(-200%)"
        _focus={{ transform: 'translateY(0)' }}
        zIndex="skipNav"
        bg="bg.panel"
        p="3"
        rounded="input"
      >
        {copy.skipLink}
      </Link>
      <Flex
        as="header"
        align="center"
        justify="space-between"
        py="6"
        borderBottomWidth="hairline"
        borderColor="border"
      >
        <HStack gap="2" color="brand.fg">
          <Box asChild boxSize="6">
            <SparkleIcon weight="fill" aria-hidden />
          </Box>
          <Text fontFamily="heading" textStyle="display.lg">
            {copy.brandName}
          </Text>
        </HStack>
        <ColorModeButton size="lg" aria-label={copy.toggleColorMode} />
      </Flex>
      <Box as="main" id="main" tabIndex={-1} py={{ base: '10', md: '16' }}>
        <Stack gap={{ base: '10', md: '14' }}>
          <FadeIn>
            <Stack gap="5" maxW="3xl">
              <Text textStyle="caption" color="brand.fg">
                {copy.stage}
              </Text>
              <Heading as="h1" textStyle="display.2xl">
                {copy.title}
              </Heading>
              <Text textStyle="body.md" color="fg.muted" maxW="2xl">
                {copy.description}
              </Text>
            </Stack>
          </FadeIn>
          <SimpleGrid columns={{ base: 1, lg: 2 }} gap="6" alignItems="start">
            <PopIn>
              <Stack
                as="section"
                aria-labelledby="palette-title"
                gap="6"
                bg="card.bg"
                borderWidth="hairline"
                borderColor="border"
                rounded="card"
                p={{ base: '6', md: '8' }}
                shadow="card"
              >
                <Stack gap="2">
                  <Heading id="palette-title" as="h2" textStyle="heading.md">
                    {copy.paletteTitle}
                  </Heading>
                  <Text color="fg.muted" textStyle="body.sm">
                    {copy.paletteDescription}
                  </Text>
                </Stack>
                {palettes.map((palette) => (
                  <Stack key={palette.label} gap="3">
                    <Text textStyle="caption" color="fg.muted">
                      {palette.label}
                    </Text>
                    <Flex gap="2" aria-hidden>
                      {palette.colors.map((color) => (
                        <Box key={color} bg={color} flex="1" h="12" rounded="input" />
                      ))}
                    </Flex>
                  </Stack>
                ))}
                <BootstrapActions
                  brandLabel={copy.brandButton}
                  peachLabel={copy.peachButton}
                  successTitle={copy.successTitle}
                  successDescription={copy.successDescription}
                />
                <Text textStyle="caption" color="fg.muted">
                  {copy.buttonHint}
                </Text>
              </Stack>
            </PopIn>
            <Stack gap="6">
              <Box
                as="section"
                aria-labelledby="typography-title"
                bg="card.bg"
                borderWidth="hairline"
                borderColor="border"
                rounded="card"
                p={{ base: '6', md: '8' }}
                shadow="card"
              >
                <Stack gap="6">
                  <Heading id="typography-title" as="h2" textStyle="heading.md" color="brand.fg">
                    {copy.typographyTitle}
                  </Heading>
                  {textSamples.map(([textStyle, sample]) => (
                    <Text key={textStyle} textStyle={textStyle} data-text-style={textStyle}>
                      {sample}
                    </Text>
                  ))}
                </Stack>
              </Box>
              <Stack
                as="section"
                aria-labelledby="arabic-title"
                gap="4"
                bg="brand.subtle"
                borderWidth="hairline"
                borderColor="brand.muted"
                rounded="card"
                p={{ base: '6', md: '8' }}
              >
                <Heading id="arabic-title" as="h2" textStyle="heading.sm">
                  {copy.arabicTitle}
                </Heading>
                <Box dir="rtl" lang="ar">
                  <Text textStyle="display.lg">{ar.common.bootstrap.arabicSample}</Text>
                </Box>
                <Text color="fg.muted" textStyle="body.sm">
                  {copy.arabicDescription}
                </Text>
              </Stack>
            </Stack>
          </SimpleGrid>
        </Stack>
      </Box>
      <Box as="footer" py="6" borderTopWidth="hairline" borderColor="border">
        <Text textStyle="caption" color="fg.muted">
          {copy.footer}
        </Text>
      </Box>
    </Container>
  );
}
