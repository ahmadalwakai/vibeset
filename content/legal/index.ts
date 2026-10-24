import type { LegalContent, LegalDocument, LegalLocale } from '@/lib/legal';
import { TermsEn } from './terms.en';
import { TermsAr } from './terms.ar';
import { PrivacyEn } from './privacy.en';
import { PrivacyAr } from './privacy.ar';
import { CopyrightEn } from './copyright.en';
import { CopyrightAr } from './copyright.ar';

const documents = {
  en: {
    terms: {
      title: 'Terms of use',
      description: 'Personal-use themes, creator submissions and using Vibeset safely.',
      Body: TermsEn,
    },
    privacy: {
      title: 'Privacy notice',
      description: 'How Vibeset handles accounts, designs, browser storage and your requests.',
      Body: PrivacyEn,
    },
    copyright: {
      title: 'Copyright and credits',
      description: 'Theme rights, Phosphor and font credits, and how to report a concern.',
      Body: CopyrightEn,
    },
  },
  ar: {
    terms: {
      title: 'شروط الاستخدام',
      description: 'استخدام التصاميم شخصيًا، ومشاركات المصممين، والاستخدام الآمن لفايبست.',
      Body: TermsAr,
    },
    privacy: {
      title: 'إشعار الخصوصية',
      description: 'كيف يتعامل فايبست مع الحسابات والتصاميم وتخزين المتصفح وطلباتك.',
      Body: PrivacyAr,
    },
    copyright: {
      title: 'حقوق النشر والمصادر',
      description: 'حقوق التصاميم، ومصادر الخطوط ورموز Phosphor، وطريقة الإبلاغ عن مشكلة.',
      Body: CopyrightAr,
    },
  },
} satisfies Record<LegalLocale, Record<LegalDocument, LegalContent>>;

export function getLegalContent(locale: LegalLocale, document: LegalDocument): LegalContent {
  return documents[locale][document];
}
