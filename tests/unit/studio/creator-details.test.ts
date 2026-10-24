import { expect, it } from 'vitest';
import type { CreatorThemeEditorDTO } from '../../../lib/creator';
import { creatorDetailsFromTheme } from '../../../lib/creator-studio';
import type { TagDTO } from '../../../lib/dto';
import { wallpaperFixture } from '../render/wallpaper-fixture';

it('removes inactive assigned tags and requires replacing an inactive aesthetic', () => {
  const theme: CreatorThemeEditorDTO = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    slug: 'theme',
    nameEn: 'Photo',
    nameAr: null,
    source: 'creator',
    status: 'draft',
    thumbUrl: null,
    rejectionReason: null,
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    spec: wallpaperFixture(),
    descriptionEn: null,
    descriptionAr: null,
    tagSlugs: ['y2k', 'calm', 'photo'],
  };
  const active: TagDTO[] = [
    { slug: 'calm', kind: 'mood', nameEn: 'Calm', nameAr: 'هادئ' },
    { slug: 'minimal', kind: 'aesthetic', nameEn: 'Minimal', nameAr: 'بسيط' },
  ];
  expect(creatorDetailsFromTheme(theme, active)).toMatchObject({ aesthetic: '', tags: ['calm'] });
  expect(creatorDetailsFromTheme(undefined, active)).toMatchObject({
    nameEn: '',
    aesthetic: '',
    tags: [],
  });
});
