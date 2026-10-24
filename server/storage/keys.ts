import 'server-only';

import { z } from 'zod';
import {
  storageUserIdSchema,
  storageUuidSchema,
  storageVersionSchema,
  themeAssetFileSchema,
} from '../../lib/validation/storage';

export function themePrefix(themeId: string): string {
  return `themes/${storageUuidSchema.parse(themeId)}/`;
}

export function themeVersionPrefix(themeId: string, version: number): string {
  return `${themePrefix(themeId)}v${storageVersionSchema.parse(version)}/`;
}

export function themeAttemptPrefix(themeId: string, version: number, attemptId: string): string {
  return `${themeVersionPrefix(themeId, version)}${storageUuidSchema.parse(attemptId)}/`;
}

export function themeAssetKey(
  themeId: string,
  version: number,
  file: string,
  attemptId: string,
): string {
  return `${themeAttemptPrefix(themeId, version, attemptId)}${themeAssetFileSchema.parse(file)}`;
}

export function incomingUploadKey(userId: string, uploadId: string): string {
  return `uploads/incoming/${storageUserIdSchema.parse(userId)}/${storageUuidSchema.parse(uploadId)}`;
}

export function incomingAvatarUploadKey(userId: string, uploadId: string): string {
  return `uploads/incoming/${storageUserIdSchema.parse(userId)}/avatars/${storageUuidSchema.parse(uploadId)}`;
}

export function wallpaperUploadKeys(uploadId: string): { full: string; preview: string } {
  const id = storageUuidSchema.parse(uploadId);
  return {
    full: `uploads/wallpapers/${id}/full.jpg`,
    preview: `uploads/wallpapers/${id}/preview.webp`,
  };
}

export function avatarKey(userId: string, hash: string): string {
  const digest = z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/i)
    .parse(hash)
    .toLowerCase();
  return `avatars/${storageUserIdSchema.parse(userId)}/${digest}.webp`;
}
