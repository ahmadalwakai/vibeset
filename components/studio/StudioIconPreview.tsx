'use client';

import { SimpleGrid, Skeleton } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';
import type { ThemeSpec } from '@/lib/render/spec';

const IconPreview = dynamic(
  () => import('@/components/theme/IconPreview').then((module) => module.IconPreview),
  { loading: () => <Skeleton boxSize="16" rounded="input" /> },
);
export function StudioIconPreview({ spec }: { spec: ThemeSpec }): ReactElement {
  return (
    <SimpleGrid columns={4} gap="4" p="4" w="72" maxW="full" mx="auto" dir="ltr">
      {['phone', 'camera', 'heart', 'star', 'calendar', 'sun', 'music-note', 'flower'].map(
        (glyph) => (
          <IconPreview key={glyph} spec={spec} glyph={glyph} platform="shaped" label="" />
        ),
      )}
    </SimpleGrid>
  );
}
