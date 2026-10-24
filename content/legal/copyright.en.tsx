import type { ReactElement } from 'react';
import { Link } from '@/i18n/navigation';
import type { LegalBodyProps } from '@/lib/legal';

const FONT_CREDITS = [
  {
    name: 'Readex Pro',
    licence: 'https://raw.githubusercontent.com/google/fonts/main/ofl/readexpro/OFL.txt',
  },
  {
    name: 'Fraunces',
    licence: 'https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/OFL.txt',
  },
  {
    name: 'Pacifico',
    licence: 'https://raw.githubusercontent.com/google/fonts/main/ofl/pacifico/OFL.txt',
  },
  {
    name: 'Space Grotesk',
    licence: 'https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/OFL.txt',
  },
  {
    name: 'El Messiri',
    licence: 'https://raw.githubusercontent.com/google/fonts/main/ofl/elmessiri/OFL.txt',
  },
  {
    name: 'JetBrains Mono',
    licence: 'https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/OFL.txt',
  },
] as const;

export function CopyrightEn({
  operatorName,
  publicEmail,
  effectiveDate,
}: LegalBodyProps): ReactElement {
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${effectiveDate}T00:00:00Z`));
  return (
    <>
      <p>
        Effective from <time dateTime={effectiveDate}>{date}</time>.
      </p>
      <section aria-labelledby="copyright-work">
        <h2 id="copyright-work">Theme artwork and your use</h2>
        <p>
          Vibeset combines generated designs, creator-submitted artwork and separately licensed
          open-source components. Creators keep the rights they hold in their submissions. A review
          or a generated design does not guarantee that no third-party rights are involved.
        </p>
        <p>
          Theme packs are free for personal use under the{' '}
          <Link href="/legal/terms" locale="en">
            terms
          </Link>
          . Do not resell them or redistribute them as packs. Share the theme’s page link instead.
          Those restrictions do not replace the separate MIT and SIL Open Font License rights
          described below. App names are descriptive labels; Vibeset does not supply their official
          brand logos or claim endorsement by those apps.
        </p>
      </section>
      <section aria-labelledby="copyright-icons">
        <h2 id="copyright-icons">Phosphor Icons</h2>
        <p>
          Generic glyphs come from <a href="https://phosphoricons.com/">Phosphor Icons</a>,
          copyright 2023 Phosphor Icons, under the{' '}
          <a href="https://github.com/phosphor-icons/core/blob/main/LICENSE">MIT licence</a>. That
          licence permits reuse subject to its notice requirements. The full upstream licence and
          copyright notice are retained with the bundled glyph assets.
        </p>
      </section>
      <section aria-labelledby="copyright-fonts">
        <h2 id="copyright-fonts">Font credits</h2>
        <p>
          Vibeset bundles the six families below under the{' '}
          <a href="https://openfontlicense.org/open-font-license-official-text/">
            SIL Open Font License 1.1
          </a>
          . Each link includes that family’s own copyright and licence notice.
        </p>
        <ul>
          {FONT_CREDITS.map((font) => (
            <li key={font.name}>
              <a href={font.licence}>{font.name}</a>
            </li>
          ))}
        </ul>
        <p>
          Font software keeps its own licence, including any reserved-name conditions. Our
          personal-use theme-pack terms do not relicense the font files. The original English
          licence text is authoritative; this page is an explanatory credit, not a replacement for
          it.
        </p>
      </section>
      <section aria-labelledby="copyright-report">
        <h2 id="copyright-report">Report a rights concern</h2>
        <p>
          Use a theme’s report option or email{' '}
          <a href={`mailto:${publicEmail}`}>
            <bdi dir="ltr">{publicEmail}</bdi>
          </a>
          . Vibeset is operated by {operatorName}. A report is not published as a comment. You can
          contact us even without a Vibeset account.
        </p>
        <p>Please include enough information to help us understand the issue:</p>
        <ul>
          <li>The Vibeset page link and, if relevant, the particular image or element.</li>
          <li>
            The work or right you believe is affected, with a link or other helpful reference.
          </li>
          <li>
            Why you believe the use is unauthorised, and whether you own the right or are authorised
            to speak for its owner.
          </li>
          <li>A way to contact you and the action you are requesting.</li>
        </ul>
        <p>
          This is helpful information, not a demand to use a particular legal form. Do not send
          unnecessary identity documents, private images or sign-in links. We may ask for relevant
          clarification and assess the content, permissions and available evidence. Reporting does
          not guarantee removal, and knowingly misleading complaints can harm other people.
        </p>
        <p>
          We assess relevant evidence and may ask for necessary clarification about the work, the
          use or your authority to act. We can restrict or remove content after review. You can
          reply with relevant information if you believe a decision is mistaken. The action and
          timing depend on the circumstances and applicable law; we do not guarantee automatic
          removal or a fixed response outcome.
        </p>
      </section>
      <section aria-labelledby="copyright-withdrawal">
        <h2 id="copyright-withdrawal">Your own published work or image</h2>
        <p>
          If you want your published work withdrawn, or an image contains personal information that
          concerns you, contact us using the details above. Explain which content is involved and
          what you want to happen. A privacy request can be made separately from a copyright
          complaint; see the{' '}
          <Link href="/legal/privacy" locale="en">
            privacy notice
          </Link>
          .
        </p>
        <p>
          Deleting an account removes unpublished designs but does not automatically remove
          published themes or original images still used by retained themes. Their account link is
          removed. Published-content withdrawal therefore needs a separate request. Deleting content
          from the service cannot reliably recall copies already downloaded elsewhere; this does not
          remove legal obligations that apply to your request.
        </p>
      </section>
    </>
  );
}
