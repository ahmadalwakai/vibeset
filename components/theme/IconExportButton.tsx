'use client';

import { Button, Flex, Icon, Spinner, Text } from '@chakra-ui/react';
import { SquaresFourIcon } from '@phosphor-icons/react/dist/csr/SquaresFour';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import type { ThemeDetailDTO } from '@/lib/dto';

function PreparingIcons(): ReactElement {
  const t = useTranslations('common');
  return (
    <Flex
      position="fixed"
      bottom="24"
      insetEnd="4"
      zIndex="modal"
      p="4"
      gap="3"
      align="center"
      bg="bg.panel"
      rounded="card"
      shadow="float"
      role="status"
      aria-live="polite"
    >
      <Spinner size="sm" color="brand.fg" />
      <Text textStyle="body.sm" color="fg.muted">
        {t('loading')}
      </Text>
    </Flex>
  );
}

const IconExportSheet = dynamic(
  () => import('./IconExportSheet').then((module) => module.IconExportSheet),
  { loading: PreparingIcons },
);

export function IconExportButton({ theme }: { theme: ThemeDetailDTO }): ReactElement {
  const t = useTranslations('theme.icons');
  const [opened, setOpened] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        colorPalette="brand"
        rounded="button"
        size="lg"
        flex="1"
        minW="32"
        px="3"
        onClick={() => {
          setOpened(true);
          setOpen(true);
        }}
      >
        <Icon asChild boxSize="5">
          <SquaresFourIcon aria-hidden />
        </Icon>
        {t('getIcons')}
      </Button>
      {opened ? <IconExportSheet theme={theme} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
