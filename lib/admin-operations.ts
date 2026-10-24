import type { ThemeStatus } from './theme-status';

export interface AdminGeneratorOption {
  slug: string;
  nameEn: string;
  nameAr: string;
  counts: Record<ThemeStatus, number>;
}
export interface AdminGenerationSummary {
  runId: string;
  created: number;
  skippedDuplicates: number;
  skippedQa: number;
}
export interface AdminGenerationRun {
  id: string;
  aesthetic: string;
  seed: number;
  requested: number;
  created: number;
  skippedDuplicates: number;
  skippedQa: number;
  status: 'running' | 'completed' | 'failed';
  actorId: string | null;
  actorName: string | null;
  startedAt: string;
  finishedAt: string | null;
}
export interface AdminGenerationRunDetail extends AdminGenerationRun {
  log: string[];
}
export interface AdminHeroOption {
  slug: string;
  titleEn: string;
  titleAr: string | null;
  kind: 'editorial' | 'seasonal';
}
