import type { MoodId, SeasonId, SeedTag, StyleId, TaxonomyTag } from '../lib/generator';
import { AESTHETICS } from './aesthetics';

export const MOODS = [
  { id: 'cute', slug: 'cute', kind: 'mood', nameEn: 'Cute', nameAr: 'لطيف', sortOrder: 0 },
  { id: 'calm', slug: 'calm', kind: 'mood', nameEn: 'Calm', nameAr: 'هادئ', sortOrder: 1 },
  { id: 'dreamy', slug: 'dreamy', kind: 'mood', nameEn: 'Dreamy', nameAr: 'حالم', sortOrder: 2 },
  { id: 'bold', slug: 'bold', kind: 'mood', nameEn: 'Bold', nameAr: 'جريء', sortOrder: 3 },
  { id: 'dark', slug: 'dark', kind: 'mood', nameEn: 'Dark', nameAr: 'داكن', sortOrder: 4 },
  { id: 'cozy', slug: 'cozy', kind: 'mood', nameEn: 'Cozy', nameAr: 'دافئ', sortOrder: 5 },
  { id: 'elegant', slug: 'elegant', kind: 'mood', nameEn: 'Elegant', nameAr: 'أنيق', sortOrder: 6 },
  { id: 'playful', slug: 'playful', kind: 'mood', nameEn: 'Playful', nameAr: 'مرح', sortOrder: 7 },
  { id: 'minimal', slug: 'minimal', kind: 'mood', nameEn: 'Minimal', nameAr: 'بسيط', sortOrder: 8 },
  { id: 'retro', slug: 'retro', kind: 'mood', nameEn: 'Retro', nameAr: 'ريترو', sortOrder: 9 },
  { id: 'edgy', slug: 'edgy', kind: 'mood', nameEn: 'Edgy', nameAr: 'متمرّد', sortOrder: 10 },
  {
    id: 'romantic',
    slug: 'romantic',
    kind: 'mood',
    nameEn: 'Romantic',
    nameAr: 'رومانسي',
    sortOrder: 11,
  },
  { id: 'fresh', slug: 'fresh', kind: 'mood', nameEn: 'Fresh', nameAr: 'منعش', sortOrder: 12 },
  {
    id: 'mysterious',
    slug: 'mysterious',
    kind: 'mood',
    nameEn: 'Mysterious',
    nameAr: 'غامض',
    sortOrder: 13,
  },
] as const satisfies readonly TaxonomyTag<MoodId, 'mood'>[];

export const SEASONS = [
  {
    id: 'spring',
    slug: 'season-spring',
    kind: 'season',
    nameEn: 'Spring',
    nameAr: 'الربيع',
    sortOrder: 0,
  },
  {
    id: 'summer',
    slug: 'season-summer',
    kind: 'season',
    nameEn: 'Summer',
    nameAr: 'الصيف',
    sortOrder: 1,
  },
  {
    id: 'autumn',
    slug: 'season-autumn',
    kind: 'season',
    nameEn: 'Autumn',
    nameAr: 'الخريف',
    sortOrder: 2,
  },
  {
    id: 'winter',
    slug: 'season-winter',
    kind: 'season',
    nameEn: 'Winter',
    nameAr: 'الشتاء',
    sortOrder: 3,
  },
  {
    id: 'ramadan',
    slug: 'season-ramadan',
    kind: 'season',
    nameEn: 'Ramadan',
    nameAr: 'رمضان',
    sortOrder: 4,
  },
  { id: 'eid', slug: 'season-eid', kind: 'season', nameEn: 'Eid', nameAr: 'العيد', sortOrder: 5 },
  {
    id: 'halloween',
    slug: 'season-halloween',
    kind: 'season',
    nameEn: 'Halloween',
    nameAr: 'الهالوين',
    sortOrder: 6,
  },
  {
    id: 'christmas',
    slug: 'season-christmas',
    kind: 'season',
    nameEn: 'Christmas',
    nameAr: 'الكريسماس',
    sortOrder: 7,
  },
  {
    id: 'valentine',
    slug: 'season-valentine',
    kind: 'season',
    nameEn: 'Valentine',
    nameAr: 'عيد الحب',
    sortOrder: 8,
  },
  {
    id: 'back-to-school',
    slug: 'season-back-to-school',
    kind: 'season',
    nameEn: 'Back to School',
    nameAr: 'العودة إلى المدرسة',
    sortOrder: 9,
  },
] as const satisfies readonly TaxonomyTag<SeasonId, 'season'>[];

export const STYLES = [
  { id: 'pastel', slug: 'pastel', kind: 'style', nameEn: 'Pastel', nameAr: 'باستيل', sortOrder: 0 },
  {
    id: 'gradient',
    slug: 'gradient',
    kind: 'style',
    nameEn: 'Gradient',
    nameAr: 'تدرّج',
    sortOrder: 1,
  },
  {
    id: 'pattern',
    slug: 'pattern',
    kind: 'style',
    nameEn: 'Pattern',
    nameAr: 'نقشة',
    sortOrder: 2,
  },
  { id: 'glass', slug: 'glass', kind: 'style', nameEn: 'Glass', nameAr: 'زجاجي', sortOrder: 3 },
  { id: 'neon', slug: 'neon', kind: 'style', nameEn: 'Neon', nameAr: 'نيون', sortOrder: 4 },
  { id: 'photo', slug: 'photo', kind: 'style', nameEn: 'Photo', nameAr: 'صورة', sortOrder: 5 },
  {
    id: 'illustrated',
    slug: 'illustrated',
    kind: 'style',
    nameEn: 'Illustrated',
    nameAr: 'مرسوم',
    sortOrder: 6,
  },
  {
    id: 'monochrome',
    slug: 'monochrome',
    kind: 'style',
    nameEn: 'Monochrome',
    nameAr: 'أحادي اللون',
    sortOrder: 7,
  },
] as const satisfies readonly TaxonomyTag<StyleId, 'style'>[];

export const TAXONOMY: readonly SeedTag[] = [
  ...AESTHETICS.map((recipe, sortOrder) => ({
    id: recipe.slug,
    slug: recipe.slug,
    kind: 'aesthetic' as const,
    nameEn: recipe.nameEn,
    nameAr: recipe.nameAr,
    descriptionEn: recipe.descriptionEn,
    descriptionAr: recipe.descriptionAr,
    sortOrder,
  })),
  ...MOODS,
  ...SEASONS,
  ...STYLES,
];

const taxonomyBySlug = new Map(TAXONOMY.map((tag) => [tag.slug, tag]));
if (taxonomyBySlug.size !== TAXONOMY.length)
  throw new Error('Taxonomy storage slugs must be unique');

export function getTaxonomyTag(slug: string): SeedTag | undefined {
  return taxonomyBySlug.get(slug);
}

export function getSeason(id: string): TaxonomyTag<SeasonId, 'season'> | undefined {
  return SEASONS.find((season) => season.id === id);
}

export function seasonTagSlug(id: SeasonId): `season-${SeasonId}` {
  return `season-${id}`;
}
