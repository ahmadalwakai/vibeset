import type { ReactElement } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import credits from '../assets/font-credits.json';
import { Button, Copy, Panel, styles, useUi } from './Ui';

export function FontNotices({ onClose }: { onClose: () => void }): ReactElement {
  const { t, colors, row } = useUi();
  return (
    <Modal visible presentationStyle="fullScreen" animationType="none" onRequestClose={onClose}>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.bg, direction: 'ltr' }}
        edges={['top', 'bottom']}
        onAccessibilityEscape={onClose}
      >
        <View
          style={{
            paddingHorizontal: 20,
            paddingVertical: 12,
            flexDirection: row,
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            borderBottomWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Copy heading accessibilityRole="header" style={{ flex: 1, fontSize: 23 }}>
            {t('fontLicencesTitle')}
          </Copy>
          <Button secondary label={t('close')} onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.page}>
          <Copy>{t('fontLicencesDescription')}</Copy>
          {credits.fonts.map((font) => (
            <Panel key={font.id}>
              <Copy
                heading
                accessibilityRole="header"
                style={{ fontSize: 23, writingDirection: 'ltr', textAlign: 'left' }}
              >
                {font.name}
              </Copy>
              <Copy accessibilityRole="header">{t('fontEmbeddedCopyright')}</Copy>
              {font.copyrightNotices.map((notice) => (
                <Copy
                  key={notice}
                  selectable
                  style={{
                    fontSize: 14,
                    lineHeight: 22,
                    writingDirection: 'ltr',
                    textAlign: 'left',
                  }}
                >
                  {notice}
                </Copy>
              ))}
              <Copy accessibilityRole="header">{t('fontCompleteLicence')}</Copy>
              <Copy
                selectable
                style={{ fontSize: 14, lineHeight: 22, writingDirection: 'ltr', textAlign: 'left' }}
              >
                {font.licenseText}
              </Copy>
            </Panel>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
