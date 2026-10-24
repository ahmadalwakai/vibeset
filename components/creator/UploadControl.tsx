'use client';

import { Box, Button, Checkbox, FileUpload, Image, Progress, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { prepareUpload } from '@/lib/client/prepare-upload';
import { putUpload } from '@/lib/client/upload';
import { UploadPreparationError } from '@/lib/uploads';
import type {
  FinalizedWallpaperUpload,
  UploadedAsset,
  UploadKind,
  UploadInvalidReason,
} from '@/lib/uploads';
import {
  finalizedWallpaperUploadSchema,
  uploadedAssetSchema,
  uploadInvalidReasonSchema,
  uploadReservationSchema,
} from '@/lib/validation/uploads';
import {
  createAvatarUpload,
  createWallpaperUpload,
  finalizeAvatarUpload,
  finalizeWallpaperUpload,
} from '@/server/actions/uploads';
import type { ErrorMessageCode } from '@/lib/result';

export interface UploadControlProps {
  kind: UploadKind;
  onUploaded: (data: FinalizedWallpaperUpload | UploadedAsset) => void;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
}
export function UploadControl({
  kind,
  onUploaded,
  disabled = false,
  onPendingChange,
}: UploadControlProps): ReactElement {
  const t = useTranslations('creator.uploads'),
    errors = useTranslations('errors'),
    id = useId();
  const [owns, setOwns] = useState(false),
    [stage, setStage] = useState<'idle' | 'prepare' | 'uploading' | 'finalizing' | 'ready'>('idle'),
    [percent, setPercent] = useState(0),
    [failure, setFailure] = useState<{
      reason?: UploadInvalidReason;
      code?: ErrorMessageCode;
    } | null>(null),
    [ready, setReady] = useState<UploadedAsset | FinalizedWallpaperUpload | null>(null);
  const lastFile = useRef<File | null>(null);
  const active = useRef<AbortController | null>(null),
    epoch = useRef(0),
    callbacks = useRef({ onUploaded, onPendingChange });
  useEffect(() => {
    callbacks.current = { onUploaded, onPendingChange };
  }, [onUploaded, onPendingChange]);
  useEffect(
    () => () => {
      epoch.current += 1;
      active.current?.abort();
      callbacks.current.onPendingChange?.(false);
    },
    [],
  );
  function cancel(): void {
    epoch.current += 1;
    active.current?.abort();
    active.current = null;
    setStage('idle');
    callbacks.current.onPendingChange?.(false);
  }
  async function upload(file: File): Promise<void> {
    if (active.current || disabled || !owns) return;
    lastFile.current = file;
    const controller = new AbortController(),
      sequence = ++epoch.current;
    active.current = controller;
    const current = (): boolean => !controller.signal.aborted && epoch.current === sequence;
    setFailure(null);
    setReady(null);
    setStage('prepare');
    setPercent(0);
    callbacks.current.onPendingChange?.(true);
    try {
      const prepared = await prepareUpload(file, { kind, signal: controller.signal });
      const reservation = await (kind === 'avatar' ? createAvatarUpload : createWallpaperUpload)({
        contentType: 'image/jpeg',
        bytes: prepared.blob.size,
      });
      if (!current()) return;
      if (!reservation.ok) {
        setFailure({ code: reservation.error.code });
        return;
      }
      const data = uploadReservationSchema.parse(reservation.data);
      setStage('uploading');
      await putUpload(prepared.blob, data, controller.signal, (progress) => {
        if (current()) setPercent(progress);
      });
      if (!current()) return;
      setStage('finalizing');
      const finalized = await (kind === 'avatar' ? finalizeAvatarUpload : finalizeWallpaperUpload)({
        uploadId: data.uploadId,
      });
      if (!current()) return;
      if (!finalized.ok) {
        const reason = uploadInvalidReasonSchema.safeParse(
          finalized.error.fieldErrors?.reason?.[0],
        );
        setFailure(reason.success ? { reason: reason.data } : { code: finalized.error.code });
        return;
      }
      const uploaded =
        kind === 'wallpaper'
          ? finalizedWallpaperUploadSchema.parse(finalized.data)
          : uploadedAssetSchema.parse(finalized.data);
      lastFile.current = null;
      setReady(uploaded);
      setStage('ready');
      callbacks.current.onUploaded(uploaded);
    } catch (error) {
      if (current())
        setFailure(
          error instanceof UploadPreparationError ? { reason: error.reason } : { code: 'NETWORK' },
        );
    } finally {
      if (current()) {
        active.current = null;
        callbacks.current.onPendingChange?.(false);
        setStage((value) => (value === 'ready' ? 'ready' : 'idle'));
      }
    }
  }
  const pending = stage === 'prepare' || stage === 'uploading' || stage === 'finalizing';
  const reason =
    failure?.reason === 'too_small' && kind === 'avatar' ? 'avatar_too_small' : failure?.reason;
  return (
    <Stack gap="4">
      <Text as="h3" textStyle="heading.sm">
        {t(kind === 'avatar' ? 'avatarTitle' : 'wallpaperTitle')}
      </Text>
      <Checkbox.Root
        checked={owns}
        disabled={pending || disabled}
        onCheckedChange={({ checked }) => setOwns(checked === true)}
        minH="11"
        colorPalette="brand"
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Label>{t('ownershipLabel')}</Checkbox.Label>
      </Checkbox.Root>
      <FileUpload.Root
        key={`${id}:${owns}:${pending}`}
        accept={['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']}
        maxFiles={1}
        disabled={disabled || pending || !owns}
        onFileChange={({ acceptedFiles }) => {
          const file = acceptedFiles[0];
          if (file) void upload(file);
        }}
        onFileReject={() => setFailure({ reason: 'unsupported' })}
      >
        <FileUpload.HiddenInput />
        <FileUpload.Trigger asChild>
          <Button size="lg" variant="outline" disabled={disabled || pending || !owns}>
            {t(kind === 'avatar' ? 'chooseAvatar' : 'chooseWallpaper')}
          </Button>
        </FileUpload.Trigger>
      </FileUpload.Root>
      {pending ? (
        <Stack gap="3" role="status" aria-live="polite" aria-busy="true">
          <Text textStyle="body.sm">
            {stage === 'uploading'
              ? t('uploading', { progress: percent })
              : t(stage === 'prepare' ? 'prepare' : 'finalizing')}
          </Text>
          <Progress.Root
            value={stage === 'uploading' ? percent : null}
            colorPalette="brand"
            size="sm"
          >
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
          <Button size="lg" variant="outline" onClick={cancel}>
            {t('cancel')}
          </Button>
        </Stack>
      ) : null}
      {failure ? (
        <Stack role="alert" gap="3">
          <Text textStyle="body.sm" color="red.fg">
            {reason ? t(`errors.${reason}`) : errors(failure.code ?? 'NETWORK')}
          </Text>
          <Button
            size="lg"
            variant="outline"
            disabled={disabled || !owns}
            onClick={() => {
              const file = lastFile.current;
              if (file) void upload(file);
            }}
          >
            {t('retry')}
          </Button>
        </Stack>
      ) : null}
      {ready ? (
        <Stack gap="3" role="status">
          <Text textStyle="body.sm">{t('ready')}</Text>
          <Image
            src={ready.previewUrl}
            alt={t('previewAlt')}
            width={ready.width}
            height={ready.height}
            maxH="64"
            w="auto"
            alignSelf="start"
            rounded="input"
            objectFit="contain"
          />
          {'palette' in ready ? (
            <Box display="flex" gap="2" role="img" aria-label={t('paletteLabel')}>
              {ready.palette.map((color) => (
                <Box
                  key={color}
                  boxSize="8"
                  rounded="full"
                  bg={color}
                  borderWidth="hairline"
                  borderColor="border"
                />
              ))}
            </Box>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
