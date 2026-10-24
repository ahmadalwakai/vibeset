'use client';

import { Box, Icon } from '@chakra-ui/react';
import { AppWindowIcon } from '@phosphor-icons/react/dist/csr/AppWindow';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { GearIcon } from '@phosphor-icons/react/dist/csr/Gear';
import { ImageIcon } from '@phosphor-icons/react/dist/csr/Image';
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { useReducedMotion } from 'motion/react';
import type { ReactElement } from 'react';
import { SETUP_MEDIA } from '@/content/setup-media';
import type { SetupMediaStep } from '@/content/setup-media';
import { cdnUrl } from '@/lib/utils/cdn';

const illustrations = {
  open: PlusIcon,
  action: AppWindowIcon,
  details: GearIcon,
  photo: ImageIcon,
  name: PencilSimpleIcon,
  finish: CheckCircleIcon,
};
export function StepMedia({ step, label }: { step: SetupMediaStep; label: string }): ReactElement {
  const reducedMotion = useReducedMotion();
  const asset = SETUP_MEDIA[step];
  const Illustration = illustrations[step];
  return asset && reducedMotion === false ? (
    <Box position="relative" aspectRatio={16 / 9} overflow="hidden" rounded="xl">
      <Box asChild position="absolute" inset="0" w="full" h="full">
        <video src={cdnUrl(asset)} muted playsInline loop autoPlay controls aria-label={label} />
      </Box>
    </Box>
  ) : (
    <Box
      display="grid"
      placeItems="center"
      minH="28"
      rounded="xl"
      bg="brand.subtle"
      aria-hidden="true"
    >
      <Icon boxSize="12" color="brand.fg">
        <Illustration weight="duotone" />
      </Icon>
    </Box>
  );
}
