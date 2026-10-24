'use client';

import { Badge, Button, Flex, Link as ChakraLink, Skeleton, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { ReactElement, RefObject } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorState } from '@/components/common/ErrorState';
import { StudioPreview } from '@/components/studio/StudioPreview';
import { StudioWorkspace } from '@/components/studio/StudioShell';
import { toaster } from '@/components/ui/toaster';
import { useThemeEditor } from '@/hooks/useThemeEditor';
import { Link, useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { sessionErrorCode } from '@/lib/client/session-error';
import type { CreatorThemeEditorDTO } from '@/lib/creator';
import type { CreatorThemeDetails } from '@/lib/creator-studio';
import { creatorDetailsFromTheme } from '@/lib/creator-studio';
import type { TagDTO } from '@/lib/dto';
import type { ThemeSpec } from '@/lib/render/spec';
import type { ErrorMessageCode } from '@/lib/result';
import type { ThemeStatus } from '@/lib/theme-status';
import { createCreatorThemeSchema, updateCreatorThemeSchema } from '@/lib/validation/creator';
import {
  createCreatorTheme,
  deleteCreatorTheme,
  submitTheme,
  updateCreatorTheme,
  withdrawTheme,
} from '@/server/actions/creator';
import { CreatorDetailsPanel } from './CreatorDetailsPanel';
import { CreatorPhotoTools } from './CreatorPhotoTools';

interface CreatorThemeEditorProps {
  initialSpec: ThemeSpec;
  theme?: CreatorThemeEditorDTO;
  ownerId: string;
  canSubmit: boolean;
  tags: readonly TagDTO[];
}

/** Mask stale private props immediately when the session changes. */
export function CreatorThemeEditor(props: CreatorThemeEditorProps): ReactElement {
  const session = authClient.useSession();
  const currentOwner = useRef<string | null>(props.ownerId);
  useEffect(() => {
    if (!session.isPending) currentOwner.current = session.data?.user.id ?? null;
  }, [session.isPending, session.data?.user.id]);
  if (session.isPending) return <Skeleton h="96" rounded="card" />;
  if (!session.data && session.error)
    return (
      <ErrorState
        code={sessionErrorCode(session.error)}
        onRetry={() => void session.refetch()}
        retrying={session.isRefetching}
      />
    );
  if (session.data?.user.id !== props.ownerId) return <ErrorState code="UNAUTHENTICATED" />;
  return (
    <CreatorEditorForm
      key={`${props.ownerId}:${props.theme?.id ?? 'new'}:${props.theme?.updatedAt ?? ''}`}
      {...props}
      currentOwner={currentOwner}
    />
  );
}

function CreatorEditorForm({
  initialSpec,
  theme,
  ownerId,
  canSubmit,
  tags,
  currentOwner,
}: CreatorThemeEditorProps & {
  currentOwner: RefObject<string | null>;
}): ReactElement {
  const t = useTranslations('creator.editor');
  const themes = useTranslations('creator.themes');
  const statusLabel = useTranslations('creator.status');
  const errors = useTranslations('errors');
  const router = useRouter();
  const [mutating, setBusy] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const busy = mutating || navigating;
  const [uploading, setUploading] = useState(false);
  const [id, setId] = useState(theme?.id ?? null);
  const [status, setStatus] = useState<ThemeStatus>(theme?.status ?? 'draft');
  const [details, setDetails] = useState<CreatorThemeDetails>(() =>
    creatorDetailsFromTheme(theme, tags),
  );
  const editor = useThemeEditor(initialSpec, null, false, busy);
  const payload = {
    spec: editor.spec,
    nameEn: details.nameEn,
    nameAr: details.nameAr,
    descriptionEn: details.descriptionEn,
    descriptionAr: details.descriptionAr,
    tagSlugs: [details.aesthetic, ...details.tags].filter(Boolean),
  };
  const parsed = createCreatorThemeSchema.safeParse(payload);
  const signature = parsed.success ? JSON.stringify(parsed.data) : null;
  const [saved, setSaved] = useState<string | null>(
    theme && payload.tagSlugs.length === theme.tagSlugs.length ? signature : null,
  );
  const [invalid, setInvalid] = useState(false);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [failure, setFailure] = useState<ErrorMessageCode | null>(null);
  const [confirm, setConfirm] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const editable = status === 'draft' || status === 'rejected';
  const unchanged = signature !== null && signature === saved;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const active = (): boolean => mounted.current && currentOwner.current === ownerId;

  async function save(): Promise<void> {
    if (inFlight.current || navigating || uploading || !editable || !active()) return;
    const input = id ? updateCreatorThemeSchema.safeParse({ id, ...payload }) : parsed;
    setInvalid(!input.success || !details.aesthetic);
    setInvalidFields(
      input.success
        ? []
        : [...new Set(input.error.issues.map((issue) => String(issue.path[0] ?? '')))],
    );
    if (!input.success || !details.aesthetic) {
      setFailure('VALIDATION');
      toaster.create({ type: 'error', title: errors('VALIDATION') });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const result = id
        ? await updateCreatorTheme(input.data)
        : await createCreatorTheme(input.data);
      if (!active()) return;
      if (!result.ok) {
        setFailure(result.error.code);
        setInvalidFields(Object.keys(result.error.fieldErrors ?? {}));
        return;
      }
      setId(result.data.id);
      setSaved(signature);
      setStatus('draft');
      toaster.create({ type: 'success', title: t('saved') });
      startNavigation(() => {
        if (!id) router.replace(`/creator/themes/${result.data.id}`);
        else router.refresh();
      });
    } catch {
      if (active()) setFailure('NETWORK');
    } finally {
      inFlight.current = false;
      if (active()) setBusy(false);
    }
  }

  async function mutate(kind: 'submit' | 'withdraw' | 'delete'): Promise<boolean> {
    if (!id || inFlight.current || navigating || uploading || !active()) return false;
    if (kind === 'submit' && (!unchanged || !canSubmit || status !== 'draft')) return false;
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const action =
        kind === 'submit' ? submitTheme : kind === 'withdraw' ? withdrawTheme : deleteCreatorTheme;
      const result = await action({ id });
      if (!active()) return false;
      if (!result.ok) {
        setFailure(result.error.code);
        return false;
      }
      toaster.create({
        type: 'success',
        title:
          kind === 'delete' ? themes('deleted') : t(kind === 'submit' ? 'submitted' : 'withdrawn'),
      });
      if (kind !== 'delete') {
        setStatus(kind === 'submit' ? 'pending_review' : 'draft');
      }
      startNavigation(() => {
        if (kind === 'delete') router.replace('/creator/themes');
        else router.refresh();
      });
      return true;
    } catch {
      if (active()) setFailure('NETWORK');
      return false;
    } finally {
      inFlight.current = false;
      if (active()) setBusy(false);
    }
  }

  const actions = (
    <Stack gap="3">
      {status === 'draft' ? (
        <Text textStyle="body.sm" color="fg.muted">
          {t.rich('submissionTerms', {
            terms: (chunks) => (
              <ChakraLink asChild variant="underline">
                <Link href="/legal/terms#terms-creator-content">{chunks}</Link>
              </ChakraLink>
            ),
          })}
        </Text>
      ) : null}
      <Flex gap="2" flexWrap="wrap" align="center">
        <Badge>{statusLabel(status)}</Badge>
        {status === 'draft' ? (
          <Button
            colorPalette="brand"
            minH="11"
            loading={busy}
            disabled={!id || !unchanged || !details.aesthetic || !canSubmit || uploading}
            onClick={() => void mutate('submit')}
          >
            {t('submit')}
          </Button>
        ) : null}
        {status === 'pending_review' ? (
          <Button
            variant="outline"
            minH="11"
            loading={busy}
            onClick={() => void mutate('withdraw')}
          >
            {t('withdraw')}
          </Button>
        ) : null}
        {editable && id ? (
          <Button
            variant="ghost"
            colorPalette="red"
            minH="11"
            disabled={busy || uploading}
            onClick={() => {
              setFailure(null);
              setConfirm(true);
            }}
          >
            {t('delete')}
          </Button>
        ) : null}
      </Flex>
      {editable ? (
        <Text textStyle="body.sm" color="fg.muted">
          {uploading
            ? t('uploadsPending')
            : !canSubmit
              ? t('submitNeedsProfile')
              : !id || !unchanged
                ? t('saveFirst')
                : t('submitReadyHint')}
        </Text>
      ) : (
        <Text textStyle="body.sm" color="fg.muted">
          {t('unsupportedState')}
        </Text>
      )}
      {!canSubmit && editable ? (
        <Button asChild variant="outline" minH="11" alignSelf="start">
          <Link href="/become-creator">{t('submitNeedsProfile')}</Link>
        </Button>
      ) : null}
      {theme?.rejectionReason && status === 'rejected' ? (
        <Text textStyle="body.sm" color="red.fg" overflowWrap="anywhere">
          {theme.rejectionReason}
        </Text>
      ) : null}
      {failure && !confirm ? (
        <Text role="alert" textStyle="body.sm" color="red.fg">
          {errors(failure)}
        </Text>
      ) : null}
    </Stack>
  );
  return (
    <Stack gap="5">
      <Button asChild variant="ghost" minH="11" alignSelf="start" disabled={busy}>
        <Link href="/creator/themes">{t('backThemes')}</Link>
      </Button>
      {editable ? (
        <StudioWorkspace
          editor={editor}
          sourceSlug={null}
          initialSource={null}
          initialRemix={null}
          entryError={null}
          restored={false}
          creator={{
            details: (
              <CreatorDetailsPanel
                value={details}
                onChange={setDetails}
                tags={tags}
                invalid={invalid}
                invalidFields={invalidFields}
              />
            ),
            wallpaperTools: (target) => (
              <CreatorPhotoTools target={target} editor={editor} onPendingChange={setUploading} />
            ),
            onSave: () => void save(),
            busy,
            saveDisabled: uploading,
            actions,
          }}
        />
      ) : (
        <Stack gap="5">
          {actions}
          <StudioPreview spec={editor.spec} />
        </Stack>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('deleteTitle')}
        description={t('deleteBody')}
        confirmLabel={t('delete')}
        errorCode={failure}
        onConfirm={() => mutate('delete')}
      />
    </Stack>
  );
}
