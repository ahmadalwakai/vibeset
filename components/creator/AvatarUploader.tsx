'use client';

import type { ReactElement } from 'react';
import type { UploadedAsset } from '@/lib/uploads';
import { UploadControl } from './UploadControl';

export function AvatarUploader({
  onUploaded,
  disabled,
  onPendingChange,
}: {
  onUploaded: (data: UploadedAsset) => void;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
}): ReactElement {
  return (
    <UploadControl
      kind="avatar"
      disabled={disabled}
      onPendingChange={onPendingChange}
      onUploaded={onUploaded}
    />
  );
}
