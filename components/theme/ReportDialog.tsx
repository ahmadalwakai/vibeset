'use client';

import {
  Button,
  CloseButton,
  Dialog,
  Field,
  Icon,
  Portal,
  RadioGroup,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { ErrorMessageCode } from '@/lib/result';
import { REPORT_REASONS, reportReasonSchema, submitReportSchema } from '@/lib/validation/reports';
import type { ReportReason } from '@/lib/validation/reports';
import { submitReport } from '@/server/actions/reports';

export function ReportDialog({
  themeId,
  open,
  onOpenChange,
}: {
  themeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations('theme.reports');
  const common = useTranslations('common');
  const errors = useTranslations('errors');
  const detailsId = useId();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [invalid, setInvalid] = useState<'reason' | 'details' | null>(null);
  const [error, setError] = useState<ErrorMessageCode | null>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (inFlight.current) return;
    const parsed = submitReportSchema.safeParse({ themeId, reason, details });
    if (!parsed.success) {
      setInvalid(reportReasonSchema.safeParse(reason).success ? 'details' : 'reason');
      return;
    }
    inFlight.current = true;
    setPending(true);
    setInvalid(null);
    setError(null);
    try {
      const result = await submitReport(parsed.data);
      if (!mounted.current) return;
      if (result.ok) setSuccess(true);
      else setError(result.error.code);
    } catch {
      if (mounted.current) setError('NETWORK');
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={({ open: next }) => {
        if (!inFlight.current) onOpenChange(next);
      }}
      placement="center"
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner p="4">
          <Dialog.Content rounded="sheet" maxW="lg" maxH="90dvh" overflowY="auto">
            <Dialog.Header pe="14">
              <Dialog.Title textStyle="heading.md">
                {success ? t('successTitle') : t('title')}
              </Dialog.Title>
              {!success ? (
                <Dialog.Description textStyle="body.sm" color="fg.muted">
                  {t('description')}
                </Dialog.Description>
              ) : null}
            </Dialog.Header>
            {success ? (
              <>
                <Dialog.Body>
                  <Stack align="center" py="4" role="status">
                    <Icon asChild boxSize="12" color="brand.fg">
                      <CheckCircleIcon aria-hidden />
                    </Icon>
                    <Dialog.Description textAlign="center">{t('successBody')}</Dialog.Description>
                  </Stack>
                </Dialog.Body>
                <Dialog.Footer>
                  <Button minH="11" colorPalette="brand" onClick={() => onOpenChange(false)}>
                    {t('done')}
                  </Button>
                </Dialog.Footer>
              </>
            ) : (
              <form onSubmit={(event) => void submit(event)}>
                <Dialog.Body>
                  <Stack gap="5">
                    <Field.Root invalid={invalid === 'reason'} disabled={pending}>
                      <RadioGroup.Root
                        value={reason}
                        disabled={pending}
                        onValueChange={({ value }) => {
                          const parsed = reportReasonSchema.safeParse(value);
                          if (parsed.success) {
                            setReason(parsed.data);
                            setInvalid(null);
                          }
                        }}
                        colorPalette="brand"
                      >
                        <RadioGroup.Label textStyle="body.sm">{t('reason')}</RadioGroup.Label>
                        <Stack gap="1" mt="2">
                          {REPORT_REASONS.map((value) => (
                            <RadioGroup.Item key={value} value={value} minH="11" gap="3">
                              <RadioGroup.ItemHiddenInput />
                              <RadioGroup.ItemIndicator />
                              <RadioGroup.ItemText>{t(`reasons.${value}`)}</RadioGroup.ItemText>
                            </RadioGroup.Item>
                          ))}
                        </Stack>
                      </RadioGroup.Root>
                      {invalid === 'reason' ? (
                        <Field.ErrorText>{t('invalidReason')}</Field.ErrorText>
                      ) : null}
                    </Field.Root>
                    <Field.Root invalid={invalid === 'details'} disabled={pending}>
                      <Field.Label htmlFor={detailsId}>{t('details')}</Field.Label>
                      <Textarea
                        id={detailsId}
                        value={details}
                        disabled={pending}
                        maxLength={1_000}
                        minH="32"
                        onChange={(event) => {
                          setDetails(event.target.value);
                          setInvalid(null);
                        }}
                      />
                      <Field.HelperText>{t('detailsHint')}</Field.HelperText>
                      <Text
                        textStyle="caption"
                        color="fg.muted"
                        alignSelf="end"
                        fontVariantNumeric="tabular-nums"
                      >
                        {t('counter', { count: details.length, max: 1_000 })}
                      </Text>
                      {invalid === 'details' ? (
                        <Field.ErrorText>{t('invalidDetails')}</Field.ErrorText>
                      ) : null}
                    </Field.Root>
                    {error ? (
                      <Text role="alert" textStyle="body.sm" color="red.fg">
                        {errors(error)}
                      </Text>
                    ) : null}
                  </Stack>
                </Dialog.Body>
                <Dialog.Footer flexWrap="wrap">
                  <Button
                    type="button"
                    variant="ghost"
                    minH="11"
                    disabled={pending}
                    onClick={() => onOpenChange(false)}
                  >
                    {common('cancel')}
                  </Button>
                  <Button
                    type="submit"
                    colorPalette="brand"
                    minH="11"
                    loading={pending}
                    loadingText={t('submitting')}
                  >
                    {t('submit')}
                  </Button>
                </Dialog.Footer>
              </form>
            )}
            <Dialog.CloseTrigger asChild>
              <CloseButton minW="11" minH="11" disabled={pending} aria-label={common('close')} />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
