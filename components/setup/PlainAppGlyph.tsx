'use client';

import { Box, Icon, Image } from '@chakra-ui/react';
import { AppWindowIcon } from '@phosphor-icons/react/dist/csr/AppWindow';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

export function PlainAppGlyph({ glyph, label }: { glyph: string; label: string }): ReactElement {
  const [image, setImage] = useState<{ glyph: string; src: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void import('@/lib/client/glyphs')
      .then(({ loadGlyphs }) => loadGlyphs('regular', controller.signal))
      .then((source) => {
        const markup = source.get(glyph, 'regular');
        if (!markup || controller.signal.aborted) return;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor">${markup}</svg>`;
        setImage({ glyph, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
      })
      .catch(() => {
        /* The labelled fallback remains visible if glyph loading fails. */
      });
    return () => controller.abort();
  }, [glyph]);
  return image?.glyph === glyph ? (
    <Image
      src={image.src}
      alt={label}
      width={256}
      height={256}
      boxSize="12"
      decoding="async"
      _dark={{ filter: 'invert(1)' }}
    />
  ) : (
    <Box boxSize="12" display="grid" placeItems="center" aria-label={label} role="img">
      <Icon boxSize="8" color="brand.fg">
        <AppWindowIcon weight="duotone" />
      </Icon>
    </Box>
  );
}
