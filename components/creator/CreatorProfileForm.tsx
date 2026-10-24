'use client';

import { Avatar, Button, Skeleton, Stack, Text } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { toaster } from '@/components/ui/toaster';
import { useRouter } from '@/i18n/navigation';
import type { CreatorContext, CreatorLink } from '@/lib/creator';
import type { ErrorMessageCode } from '@/lib/result';
import type { UploadedAsset } from '@/lib/uploads';
import { updateCreatorProfileSchema } from '@/lib/validation/creator';
import { updateCreatorProfile } from '@/server/actions/creator';
import { CreatorProfileFields } from './CreatorProfileFields';

const AvatarUploader = dynamic(
  () => import('./AvatarUploader').then((module) => module.AvatarUploader),
  { loading: (): ReactElement => <Skeleton h="32" rounded="card" /> },
);

export function CreatorProfileForm({ profile }: { profile: CreatorContext }): ReactElement {
  const t = useTranslations('creator.profile'),
    errors = useTranslations('errors');
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.displayName),
    [bio, setBio] = useState(profile.bio ?? ''),
    [links, setLinks] = useState<CreatorLink[]>(profile.links);
  const [avatar, setAvatar] = useState<UploadedAsset | null>(null),
    [uploading, setUploading] = useState(false),
    [pending, setPending] = useState(false),
    [invalid, setInvalid] = useState<string[]>([]),
    [error, setError] = useState<ErrorMessageCode | null>(null);
  const busy = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy.current || uploading) return;
    const parsed = updateCreatorProfileSchema.safeParse({
      displayName,
      bio,
      links,
      ...(avatar ? { avatarUploadId: avatar.uploadId } : {}),
    });
    if (!parsed.success) {
      setInvalid([...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]);
      return;
    }
    busy.current = true;
    setPending(true);
    setInvalid([]);
    setError(null);
    try {
      const result = await updateCreatorProfile(parsed.data);
      if (!mounted.current) return;
      if (!result.ok) {
        setError(result.error.code);
        setInvalid(Object.keys(result.error.fieldErrors ?? {}));
        return;
      }
      toaster.create({ type: 'success', title: t('saved') });
      router.refresh();
    } catch {
      if (mounted.current) setError('NETWORK');
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return (
    <Stack gap="6" maxW="3xl">
      <Stack gap="3" align="start">
        <Avatar.Root size="2xl" colorPalette="brand">
          <Avatar.Fallback name={displayName} />
          {avatar?.previewUrl || profile.avatarUrl ? (
            <Avatar.Image src={avatar?.previewUrl ?? profile.avatarUrl ?? undefined} alt="" />
          ) : null}
        </Avatar.Root>
        <Text textStyle="body.sm" fontWeight="semibold">
          <bdi>@{profile.handle}</bdi>
        </Text>
        <Text textStyle="caption" color="fg.muted">
          {t('immutableHandle')}
        </Text>
      </Stack>
      <AvatarUploader onUploaded={setAvatar} disabled={pending} onPendingChange={setUploading} />
      <form onSubmit={(event) => void submit(event)}>
        <Stack
          gap="5"
          p={{ base: '4', md: '6' }}
          rounded="card"
          bg="bg.panel"
          borderWidth="hairline"
          borderColor="border"
        >
          <CreatorProfileFields
            displayName={displayName}
            bio={bio}
            links={links}
            onDisplayName={setDisplayName}
            onBio={setBio}
            onLinks={setLinks}
            disabled={pending}
            invalid={invalid}
          />
          {uploading ? (
            <Text textStyle="body.sm" color="fg.muted" role="status">
              {t('uploadPending')}
            </Text>
          ) : null}
          {error ? (
            <Text textStyle="body.sm" color="red.fg" role="alert">
              {errors(error)}
            </Text>
          ) : null}
          <Button
            type="submit"
            colorPalette="brand"
            minH="11"
            alignSelf="start"
            loading={pending}
            disabled={uploading}
          >
            {t('save')}
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
