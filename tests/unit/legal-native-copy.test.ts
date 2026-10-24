import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PrivacyAr } from '../../content/legal/privacy.ar';
import { PrivacyEn } from '../../content/legal/privacy.en';
import { TermsAr } from '../../content/legal/terms.ar';
import { TermsEn } from '../../content/legal/terms.en';
import { LEGAL_IDENTITY } from '../../lib/legal';
import type { LegalBodyProps } from '../../lib/legal';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';

// These tests exercise actual prose/markup, not Next's router module resolution.
vi.mock('../../i18n/navigation', () => ({
  Link: function LegalLink({
    href,
    locale,
    children,
  }: {
    href: string;
    locale: 'en' | 'ar';
    children: ReactNode;
  }) {
    return createElement('a', { href: `${locale === 'ar' ? '/ar' : ''}${href}` }, children);
  },
}));

function render(Body: ComponentType<LegalBodyProps>, locale: 'en' | 'ar'): string {
  const props = {
    locale,
    messages: locale === 'ar' ? ar : en,
    children: createElement(Body, LEGAL_IDENTITY),
  };
  return renderToStaticMarkup(createElement(NextIntlClientProvider, props));
}

function section(html: string, id: string): string {
  const content = html.match(new RegExp(`<section aria-labelledby="${id}">([\\s\\S]*?)</section>`));
  if (!content?.[1]) throw new Error(`Missing legal section ${id}`);
  return content[1]
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('bilingual native legal scope', () => {
  it('keeps matching section anchors in English and Arabic privacy and terms', () => {
    const anchors = (html: string): string[] =>
      [...html.matchAll(/<h2 id="([^"]+)">/g)].map((match) => match[1] ?? '');
    const englishPrivacy = anchors(render(PrivacyEn, 'en'));
    expect(anchors(render(PrivacyAr, 'ar'))).toEqual(englishPrivacy);
    expect(englishPrivacy).toContain('privacy-native');
    expect(new Set(englishPrivacy).size).toBe(englishPrivacy.length);
    expect(anchors(render(TermsAr, 'ar'))).toEqual(anchors(render(TermsEn, 'en')));
  });

  it.each([
    {
      locale: 'en',
      Body: PrivacyEn,
      requests: /search terms, filters or theme identifiers/,
      local: /not.*synced across devices/,
      permission: /Only when you choose to save.*permission to add/,
      library: /does not read your existing photo library/,
      localSafety: /hidden theme IDs, blocked creators’ public handles and display names/,
      reporting:
        /explicitly submit a report.*theme identifier, your selected reason and any details/,
      reporterPrivacy: /anonymous report is stored with a salted IP-address hash/,
      detailsCaution: /do not include passwords, sign-in links or unnecessary personal/,
    },
    {
      locale: 'ar',
      Body: PrivacyAr,
      requests: /كلمات البحث أو المرشحات أو معرّفات التصاميم/,
      local: /لا تُرفع.*تتزامن بين الأجهزة/,
      permission: /إذن إضافة صورة.*إلا عندما تختار حفظ/,
      library: /لا تقرأ ميزة الحفظ الحالية مكتبة صورك الموجودة/,
      localSafety:
        /معرّفات التصاميم المخفية، وأسماء المستخدمين العامة والأسماء الظاهرة للمصممين المحظورين/,
      reporting: /إرسال بلاغ صراحةً.*معرّف التصميم والسبب الذي اخترته وأي تفاصيل تكتبها/,
      reporterPrivacy: /البلاغ الناجح المرسل دون حساب مع قيمة مجزأة من عنوان IP/,
      detailsCaution: /لا تكتب كلمات مرور أو روابط دخول أو معلومات شخصية أو حساسة غير ضرورية/,
    },
  ] as const)(
    'states local choices, network exposure and requested Photos access in $locale',
    ({
      locale,
      Body,
      requests,
      local,
      permission,
      library,
      localSafety,
      reporting,
      reporterPrivacy,
      detailsCaution,
    }) => {
      const native = section(render(Body, locale), 'privacy-native');
      expect(native).toContain('vibeset:native-preferences:v1');
      expect(native).toContain('500');
      expect(native).toContain('App Group');
      expect(native).toContain('WidgetKit');
      expect(native).toContain('API');
      expect(native).toContain('CDN');
      expect(native).toContain('IP');
      expect(native).toMatch(requests);
      expect(native).toMatch(local);
      expect(native).toMatch(permission);
      expect(native).toMatch(library);
      expect(native).toMatch(localSafety);
      expect(native).toMatch(reporting);
      expect(native).toMatch(reporterPrivacy);
      expect(native).toMatch(detailsCaution);
    },
  );

  it.each([
    {
      locale: 'en',
      Terms: TermsEn,
      Privacy: PrivacyEn,
      staticScope: /web previews and images are not live/,
      availability: /does not announce TestFlight or public-beta availability/,
      defaultOff: /off until you choose to enable/,
      retention: /Deleting your account does not automatically revoke it or remove published work/,
    },
    {
      locale: 'ar',
      Terms: TermsAr,
      Privacy: PrivacyAr,
      staticScope: /هذه المعاينات والصور على الويب ليست ويدجت حيًا/,
      availability: /لا يعني وصفها هنا الإعلان عن توافر نسخة TestFlight أو نسخة تجريبية عامة/,
      defaultOff: /متوقفة إلى أن تختار تفعيلها/,
      retention: /لا يلغيه حذف الحساب تلقائيًا، ولا يزيل العمل المنشور/,
    },
  ] as const)(
    'retains web statistics and publication terms without promising native availability in $locale',
    ({ locale, Terms, Privacy, staticScope, availability, defaultOff, retention }) => {
      const terms = render(Terms, locale);
      const privacy = render(Privacy, locale);
      expect(section(terms, 'terms-tools')).toMatch(staticScope);
      expect(section(terms, 'terms-tools')).toContain('WidgetKit');
      expect(section(terms, 'terms-tools')).toMatch(availability);
      expect(section(privacy, 'privacy-statistics')).toMatch(defaultOff);
      expect(privacy).toContain('href="#view-statistics"');
      expect(section(terms, 'terms-creator-content')).toMatch(retention);
      expect(terms).toContain(`mailto:${LEGAL_IDENTITY.publicEmail}`);
      expect(privacy).toContain(`mailto:${LEGAL_IDENTITY.publicEmail}`);
    },
  );
});
