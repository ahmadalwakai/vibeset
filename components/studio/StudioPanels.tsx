'use client';

import { Box, Skeleton, Stack, Tabs } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { STUDIO_PANELS } from '@/lib/studio';
import type { StudioPanel, StudioPanelProps } from '@/lib/studio';

function PanelSkeleton(): ReactElement {
  return (
    <Stack gap="4" py="4">
      <Skeleton h="11" />
      <Skeleton h="24" />
      <Skeleton h="11" />
    </Stack>
  );
}
const ColorsPanel = dynamic<StudioPanelProps>(
  () => import('./ColorsPanel').then((m) => m.ColorsPanel),
  { loading: PanelSkeleton },
);
const WallpaperPanel = dynamic<StudioPanelProps>(
  () => import('./WallpaperPanel').then((m) => m.WallpaperPanel),
  { loading: PanelSkeleton },
);
const IconsPanel = dynamic<StudioPanelProps>(
  () => import('./IconsPanel').then((m) => m.IconsPanel),
  { loading: PanelSkeleton },
);
const WidgetsPanel = dynamic<StudioPanelProps>(
  () => import('./WidgetsPanel').then((m) => m.WidgetsPanel),
  { loading: PanelSkeleton },
);
const TypePanel = dynamic<StudioPanelProps>(() => import('./TypePanel').then((m) => m.TypePanel), {
  loading: PanelSkeleton,
});

export function StudioPanels({
  spec,
  onChange,
  panel,
  onPanelChange,
}: StudioPanelProps & {
  panel: StudioPanel;
  onPanelChange: (panel: StudioPanel) => void;
}): ReactElement {
  const t = useTranslations('studio.panels');
  return (
    <Tabs.Root
      value={panel}
      onValueChange={({ value }) => {
        if (STUDIO_PANELS.includes(value as StudioPanel)) onPanelChange(value as StudioPanel);
      }}
      lazyMount
      unmountOnExit
      variant="line"
      colorPalette="brand"
    >
      <Tabs.List overflowX="auto" px="2">
        {STUDIO_PANELS.map((value) => (
          <Tabs.Trigger key={value} value={value} minH="11" flexShrink="0" px="3">
            {t(value)}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Box maxH={{ base: '36dvh', lg: 'calc(100dvh - 12rem)' }} overflowY="auto" p="4">
        <Tabs.Content value="colors">
          <ColorsPanel spec={spec} onChange={onChange} />
        </Tabs.Content>
        <Tabs.Content value="wallpaper">
          <WallpaperPanel spec={spec} onChange={onChange} />
        </Tabs.Content>
        <Tabs.Content value="icons">
          <IconsPanel spec={spec} onChange={onChange} />
        </Tabs.Content>
        <Tabs.Content value="widgets">
          <WidgetsPanel spec={spec} onChange={onChange} />
        </Tabs.Content>
        <Tabs.Content value="type">
          <TypePanel spec={spec} onChange={onChange} />
        </Tabs.Content>
      </Box>
    </Tabs.Root>
  );
}
