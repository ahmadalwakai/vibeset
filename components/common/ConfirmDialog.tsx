'use client';

import { Button, CloseButton, Dialog, Field, Input, Portal, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement, RefObject } from 'react';
import type { ErrorMessageCode } from '@/lib/result';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmationText?: string;
  danger?: boolean;
  pending?: boolean;
  errorCode?: ErrorMessageCode | null;
  /** Return false to keep the dialog open after a handled failure. */
  onConfirm: () => void | boolean | Promise<void | boolean>;
}

interface ConfirmationFormProps extends Omit<ConfirmDialogProps, 'open'> {
  cancelRef: RefObject<HTMLButtonElement | null>;
  onBusyChange: (busy: boolean) => void;
}

function ConfirmationForm({
  title,
  description,
  confirmLabel,
  confirmationText,
  danger = true,
  pending = false,
  errorCode,
  onConfirm,
  onOpenChange,
  cancelRef,
  onBusyChange,
}: ConfirmationFormProps): ReactElement {
  const t = useTranslations('common');
  const errors = useTranslations('errors');
  const [value, setValue] = useState('');
  const [failure, setFailure] = useState<ErrorMessageCode | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const matches = confirmationText === undefined || value === confirmationText;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function confirm(): Promise<void> {
    if (inFlight.current || pending || !matches) return;
    inFlight.current = true;
    setFailure(null);
    onBusyChange(true);
    try {
      const result = await onConfirm();
      if (mounted.current && result !== false) onOpenChange(false);
    } catch {
      if (mounted.current) setFailure('INTERNAL');
    } finally {
      inFlight.current = false;
      onBusyChange(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void confirm();
      }}
    >
      <Dialog.Header pe="14">
        <Dialog.Title textStyle="heading.md">{title}</Dialog.Title>
        {description ? (
          <Dialog.Description textStyle="body.sm">{description}</Dialog.Description>
        ) : null}
      </Dialog.Header>
      <Dialog.Body>
        {confirmationText !== undefined ? (
          <Field.Root invalid={value.length > 0 && !matches} disabled={pending}>
            <Field.Label>{t('confirmationLabel')}</Field.Label>
            <Input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              size="lg"
              rounded="input"
            />
            <Field.HelperText>
              {t('confirmationHint', { value: confirmationText })}
            </Field.HelperText>
            <Field.ErrorText>{t('confirmationMismatch')}</Field.ErrorText>
          </Field.Root>
        ) : null}
        {errorCode || failure ? (
          <Text role="alert" color="red.fg" textStyle="body.sm" mt="4">
            {errors(errorCode ?? failure ?? 'INTERNAL')}
          </Text>
        ) : null}
        {pending ? (
          <Text role="status" textStyle="body.sm" color="fg.muted" mt="3">
            {t('confirmationPending')}
          </Text>
        ) : null}
      </Dialog.Body>
      <Dialog.Footer flexWrap="wrap">
        <Button
          ref={cancelRef}
          variant="outline"
          size="lg"
          disabled={pending}
          onClick={() => onOpenChange(false)}
        >
          {t('cancel')}
        </Button>
        <Button
          type="submit"
          colorPalette={danger ? 'red' : 'brand'}
          size="lg"
          loading={pending}
          disabled={pending || !matches}
        >
          {confirmLabel ?? t('confirm')}
        </Button>
      </Dialog.Footer>
    </form>
  );
}

export function ConfirmDialog(props: ConfirmDialogProps): ReactElement {
  const t = useTranslations('common');
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const pending = busy || props.pending === true;

  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={({ open }) => {
        if (!pending) props.onOpenChange(open);
      }}
      role="alertdialog"
      initialFocusEl={() => cancelRef.current}
      closeOnEscape={!pending}
      closeOnInteractOutside={!pending}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop bg="overlay.scrim" _motionReduce={{ animationDuration: 'instant' }} />
        <Dialog.Positioner px="4">
          <Dialog.Content
            rounded="card"
            shadow="float"
            bg="bg.panel"
            _motionReduce={{ animationName: 'none' }}
          >
            <ConfirmationForm
              key={`${props.open}:${props.confirmationText ?? ''}`}
              {...props}
              pending={pending}
              cancelRef={cancelRef}
              onBusyChange={setBusy}
            />
            <Dialog.CloseTrigger asChild>
              <CloseButton size="lg" aria-label={t('close')} disabled={pending} />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
