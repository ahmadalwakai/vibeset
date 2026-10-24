import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { TextInput, View } from 'react-native';
import { REPORT_REASONS, submitReportSchema } from '../../lib/validation/reports';
import type { ReportReason } from '../../lib/validation/reports';
import { NativeReportError, submitThemeReport } from '../lib/reports';
import type { MessageKey } from '../lib/i18n';
import { Button, Copy, Panel, useUi } from './Ui';

const reasonKeys: Record<ReportReason, MessageKey> = {
  copyright: 'reportCopyright',
  inappropriate: 'reportInappropriate',
  broken: 'reportBroken',
  spam: 'reportSpam',
  other: 'reportOther',
};
export function ReportTheme({
  themeId,
  onClose,
}: {
  themeId: string;
  onClose: () => void;
}): ReactElement {
  const { t, colors, locale } = useUi();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [success, setSuccess] = useState(false);
  const flight = useRef<AbortController | null>(null);
  useEffect(() => () => flight.current?.abort(), []);
  const submit = async (): Promise<void> => {
    if (flight.current) return;
    const input = submitReportSchema.safeParse({ themeId, reason, details });
    if (!input.success) {
      setError('reportValidation');
      return;
    }
    const controller = new AbortController();
    flight.current = controller;
    setPending(true);
    setError(null);
    try {
      await submitThemeReport(input.data, controller.signal);
      if (!controller.signal.aborted) setSuccess(true);
    } catch (failure) {
      if (controller.signal.aborted) return;
      const code = failure instanceof NativeReportError ? failure.code : 'NETWORK';
      setError(
        code === 'RATE_LIMITED'
          ? 'reportRateLimited'
          : code === 'FEATURE_DISABLED'
            ? 'reportDisabled'
            : code === 'VALIDATION'
              ? 'reportValidation'
              : code === 'NOT_FOUND'
                ? 'errorNotFound'
                : code === 'CONFIG'
                  ? 'errorConfig'
                  : code === 'INVALID_RESPONSE'
                    ? 'errorResponse'
                    : code === 'FORBIDDEN' || code === 'UNAUTHENTICATED'
                      ? 'reportForbidden'
                      : code === 'NETWORK'
                        ? 'errorNetwork'
                        : 'errorHttp',
      );
    } finally {
      if (!controller.signal.aborted) setPending(false);
      if (flight.current === controller) flight.current = null;
    }
  };
  return (
    <Panel>
      <Copy heading accessibilityRole="header" style={{ fontSize: 22 }}>
        {t('reportTheme')}
      </Copy>
      {success ? (
        <Copy accessibilityLiveRegion="polite">{t('reportSuccess')}</Copy>
      ) : (
        <>
          <Copy>{t('reportDescription')}</Copy>
          <Copy accessibilityRole="header">{t('reportReason')}</Copy>
          <View style={{ gap: 8 }}>
            {REPORT_REASONS.map((value) => (
              <Button
                key={value}
                label={t(reasonKeys[value])}
                secondary={reason !== value}
                selected={reason === value}
                disabled={pending}
                onPress={() => setReason(value)}
              />
            ))}
          </View>
          <Copy>{t('reportDetails')}</Copy>
          <TextInput
            value={details}
            onChangeText={setDetails}
            editable={!pending}
            multiline
            maxLength={1000}
            accessibilityLabel={t('reportDetails')}
            textAlignVertical="top"
            style={{
              minHeight: 120,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 20,
              color: colors.ink,
              backgroundColor: colors.muted,
              fontFamily: 'VibesetBody',
              textAlign: locale === 'ar' ? 'right' : 'left',
              writingDirection: locale === 'ar' ? 'rtl' : 'ltr',
            }}
          />
          <Copy style={{ color: colors.secondary, fontSize: 12 }}>{t('reportDetailsHint')}</Copy>
          {error ? <Copy accessibilityRole="alert">{t(error)}</Copy> : null}
          <Button
            label={t(error ? 'retryReport' : 'submitReport')}
            busy={pending}
            onPress={() => void submit()}
          />
        </>
      )}
      <Button secondary label={t('close')} disabled={pending} onPress={onClose} />
    </Panel>
  );
}
