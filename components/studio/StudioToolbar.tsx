'use client';

import { Box, Button, Flex, Icon, IconButton, Menu, Portal } from '@chakra-ui/react';
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise';
import { ShuffleIcon } from '@phosphor-icons/react/dist/csr/Shuffle';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { ThemeEditor } from '@/lib/studio';
import { Tooltip } from '@/components/ui/tooltip';

export function StudioToolbar({
  editor,
  onShare,
  onCopy,
  onSave,
  onDownload,
  onIcons,
  onReset,
  sharingReady,
  savePending = false,
  saveDisabled = false,
  saveLabel,
}: {
  editor: ThemeEditor;
  onShare: () => void;
  onCopy: () => void;
  onSave: () => void;
  onDownload: () => void;
  onIcons: () => void;
  onReset: () => void;
  sharingReady: boolean;
  savePending?: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
}): ReactElement {
  const t = useTranslations('studio.toolbar');
  const share = useTranslations('studio.share');
  const reduced = useReducedMotion();
  const [turn, setTurn] = useState(0);
  const shuffleUnavailable = !('seed' in editor.spec.wallpaper);
  return (
    <Flex gap="2" wrap="wrap" align="center" role="toolbar" aria-label={t('save')}>
      <IconButton
        aria-label={t('undo')}
        variant="outline"
        minH="11"
        minW="11"
        disabled={!editor.canUndo}
        onClick={() => editor.dispatch({ type: 'undo' })}
      >
        <Icon asChild boxSize="5">
          <ArrowCounterClockwiseIcon />
        </Icon>
      </IconButton>
      <IconButton
        aria-label={t('redo')}
        variant="outline"
        minH="11"
        minW="11"
        disabled={!editor.canRedo}
        onClick={() => editor.dispatch({ type: 'redo' })}
      >
        <Icon asChild boxSize="5">
          <ArrowClockwiseIcon />
        </Icon>
      </IconButton>
      <Tooltip content={t(shuffleUnavailable ? 'shuffleUnavailable' : 'shuffle')}>
        <Box
          as="span"
          display="inline-flex"
          tabIndex={shuffleUnavailable ? 0 : undefined}
          aria-label={shuffleUnavailable ? t('shuffleUnavailable') : undefined}
        >
          <IconButton
            aria-label={t('shuffle')}
            disabled={shuffleUnavailable}
            variant="outline"
            minH="11"
            minW="11"
            onClick={() => {
              setTurn((value) => value + 1);
              editor.dispatch({ type: 'shuffleSeed' });
            }}
          >
            <motion.span
              animate={{ rotate: reduced ? 0 : turn * 180 }}
              transition={{ duration: 0.16 }}
            >
              <Icon asChild boxSize="5">
                <ShuffleIcon />
              </Icon>
            </motion.span>
          </IconButton>
        </Box>
      </Tooltip>
      <Menu.Root>
        <Menu.Trigger asChild>
          <Button variant="outline" minH="11" disabled={!sharingReady}>
            {t('share')}
          </Button>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content aria-label={share('menu')}>
              <Menu.Item value="copy" minH="11" onSelect={onCopy}>
                {share('copyLink')}
              </Menu.Item>
              <Menu.Item value="share" minH="11" onSelect={onShare}>
                {share('native')}
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
      <Button
        variant="outline"
        minH="11"
        onClick={onSave}
        loading={savePending}
        disabled={saveDisabled}
      >
        {saveLabel ?? t('save')}
      </Button>
      <Button colorPalette="brand" minH="11" onClick={onDownload}>
        {t('download')}
      </Button>
      <Button variant="outline" minH="11" onClick={onIcons}>
        {t('icons')}
      </Button>
      <Button variant="ghost" minH="11" onClick={onReset}>
        {t('reset')}
      </Button>
    </Flex>
  );
}
