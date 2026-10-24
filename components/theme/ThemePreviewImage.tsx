'use client';

import { Box, Icon, Image, Stack, Text } from '@chakra-ui/react';
import { ImageBrokenIcon } from '@phosphor-icons/react/dist/csr/ImageBroken';
import { useState } from 'react';
import type { ReactElement } from 'react';

export interface ThemePreviewImageProps {
  src: string | null;
  alt: string;
  fallbackLabel: string;
  priority?: boolean;
  dominantColor?: string | null;
}

export function ThemePreviewImage({
  src,
  alt,
  fallbackLabel,
  priority = false,
  dominantColor,
}: ThemePreviewImageProps): ReactElement {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <Box
        position="absolute"
        inset="0"
        w="full"
        h="full"
        bg={dominantColor ?? 'bg.muted'}
        display="grid"
        placeItems="center"
      >
        <Stack gap="2" align="center" p="3" bg="bg.panel" rounded="input" maxW="full">
          <Icon asChild boxSize="6" color="fg.muted">
            <ImageBrokenIcon aria-hidden />
          </Icon>
          <Text textStyle="caption" color="fg.muted" textAlign="center">
            {fallbackLabel}
          </Text>
        </Stack>
      </Box>
    );
  return (
    <Image
      position="absolute"
      inset="0"
      src={src}
      alt={alt}
      width={360}
      height={780}
      w="full"
      h="full"
      objectFit="cover"
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      bg={dominantColor ?? 'bg.muted'}
      onError={() => setFailed(true)}
    />
  );
}
