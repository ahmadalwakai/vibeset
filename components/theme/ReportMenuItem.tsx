'use client';

import { Icon, Menu } from '@chakra-ui/react';
import { FlagIcon } from '@phosphor-icons/react/dist/csr/Flag';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { useThemeMenuActions } from './ThemeMenuActions';

export function ReportMenuItem({ themeId }: { themeId: string }): ReactElement {
  const t = useTranslations('theme.reports');
  const actions = useThemeMenuActions();
  return (
    <Menu.Item value="report" minH="11" onSelect={() => actions.openReport(themeId)}>
      <Icon asChild boxSize="5">
        <FlagIcon aria-hidden />
      </Icon>
      {t('open')}
    </Menu.Item>
  );
}
