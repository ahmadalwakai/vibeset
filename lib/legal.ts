import type { ReactElement } from 'react';
import { z } from 'zod';

export const legalDocumentSchema = z.enum(['terms', 'privacy', 'copyright']);
export const legalLocaleSchema = z.enum(['en', 'ar']);
export const legalRouteSchema = z.object({ locale: legalLocaleSchema, doc: legalDocumentSchema });
export type LegalDocument = z.infer<typeof legalDocumentSchema>;
export type LegalLocale = z.infer<typeof legalLocaleSchema>;

export interface LegalBodyProps {
  operatorName: string;
  publicEmail: string;
  effectiveDate: string;
}

export interface LegalContent {
  title: string;
  description: string;
  Body: (props: LegalBodyProps) => ReactElement;
}

/** Public contact details explicitly supplied by the operator, never account credentials. */
export const LEGAL_IDENTITY = Object.freeze(
  z
    .object({
      operatorName: z.string().trim().min(1).max(200),
      publicEmail: z.email().max(254),
      effectiveDate: z.iso.date(),
    })
    .parse({
      operatorName: 'Ahmad Alwakai',
      publicEmail: 'ahmadalwakai@gmx.com',
      effectiveDate: '2026-10-24',
    }),
);
