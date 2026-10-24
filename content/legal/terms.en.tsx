import type { ReactElement } from 'react';
import { Link } from '@/i18n/navigation';
import type { LegalBodyProps } from '@/lib/legal';

export function TermsEn({
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
      <section aria-labelledby="terms-operator">
        <h2 id="terms-operator">Who runs Vibeset</h2>
        <p>
          Vibeset is operated by {operatorName}. Contact us at{' '}
          <a href={`mailto:${publicEmail}`}>
            <bdi dir="ltr">{publicEmail}</bdi>
          </a>
          .
        </p>
        <p>
          These terms cover the Vibeset website, its theme downloads and design tools, and the
          iPhone companion where available. Our{' '}
          <Link href="/legal/privacy" locale="en">
            privacy notice
          </Link>{' '}
          explains how information is handled. Our{' '}
          <Link href="/legal/copyright" locale="en">
            copyright page
          </Link>{' '}
          explains credits and removal requests.
        </p>
      </section>
      <section aria-labelledby="terms-personal-use">
        <h2 id="terms-personal-use">Free themes for your own devices</h2>
        <p>
          You may download Vibeset theme packs for free, use them on your own devices and remix them
          for your personal use with Vibeset’s tools. Do not sell them, package them for resale or
          redistribute the packs or their theme artwork as another downloadable collection. Share a
          link to the theme instead.
        </p>
        <p>
          These pack terms do not replace the separate licences for open-source software, Phosphor
          glyphs or font files. The rights those licences give you still apply to that material. A
          download does not give you ownership of another person’s artwork, a trademark or the
          Vibeset brand.
        </p>
      </section>
      <section aria-labelledby="terms-accounts">
        <h2 id="terms-accounts">Your account and private work</h2>
        <p>
          Keep control of the email account or Google account you use to sign in. Do not share
          sign-in links, impersonate someone else or access another person’s account. Tell us if you
          believe your account has been misused.
        </p>
        <p>
          A saved Studio remix is a draft, not a public submission. A private collection is
          available to its owner; an unlisted collection can be read by people who have its link.
          Treat an unlisted link as something you are sharing, and avoid private information in its
          name.
        </p>
      </section>
      <section aria-labelledby="terms-creator-content">
        <h2 id="terms-creator-content">Creator submissions</h2>
        <p>
          The creator programme is for people aged 18 or over. Applying includes an adult
          declaration and review; it does not mean every visitor’s age has been verified. Only
          submit original work you own, or material you have all the permissions needed to publish
          under these terms. This includes permission relating to any identifiable person in an
          image.
        </p>
        <p>
          You keep the rights you hold in your work. We review submissions before publication and
          may reject, archive or remove content that breaks these terms or raises a safety or rights
          concern. Approval is not a guarantee that the work cannot infringe another person’s
          rights.
        </p>
        <p>
          When you submit content for publication, you grant the Vibeset operator a non-exclusive,
          royalty-free licence to store, copy, resize, convert, render, display and deliver it as
          part of the service. This includes using the service providers needed for hosting and
          delivery, and allowing personal downloads and remixes under these terms. You keep
          ownership of the rights you hold; the grant is limited to operating Vibeset and providing
          those uses.
        </p>
        <p>
          The licence continues while we retain the content for these purposes. Deleting your
          account does not automatically revoke it or remove published work. You can request removal
          at{' '}
          <a href={`mailto:${publicEmail}`}>
            <bdi dir="ltr">{publicEmail}</bdi>
          </a>
          . We assess the content, your authority to act and any privacy or other rights involved.
          Existing downloads and copies held by others may remain outside our control. This does not
          override rights or obligations that applicable law preserves.
        </p>
      </section>
      <section aria-labelledby="terms-prohibited">
        <h2 id="terms-prohibited">What you must not submit or do</h2>
        <ul>
          <li>
            Upload brand logos, celebrity images, copyrighted characters or artwork copied from
            someone else. App names in the icon picker are text labels, not endorsements.
          </li>
          <li>
            Submit sexual content, hate, threats, harassment, exploitation or material that exposes
            someone’s private or sensitive information.
          </li>
          <li>
            Send malicious files, interfere with the service, evade access controls or rate limits,
            or use accounts and reports to target other people.
          </li>
          <li>
            Claim that generated or remixed output is guaranteed to be exclusive, cleared for every
            use or free of third-party rights.
          </li>
        </ul>
      </section>
      <section aria-labelledby="terms-removal">
        <h2 id="terms-removal">Reports, removal and account deletion</h2>
        <p>
          Use the report option on a theme, or contact{' '}
          <a href={`mailto:${publicEmail}`}>
            <bdi dir="ltr">{publicEmail}</bdi>
          </a>{' '}
          with its link and an explanation. You can also contact us about published-content
          withdrawal or a privacy concern. See the{' '}
          <Link href="/legal/copyright" locale="en">
            copyright page
          </Link>{' '}
          for what helps us assess a rights complaint. Do not send unnecessary sensitive documents
          or anyone’s sign-in link.
        </p>
        <p>
          Deleting your account removes your profile and unpublished designs. Published designs and
          source images still used by retained designs can remain after the link to your account is
          removed. Account deletion does not itself withdraw published content or erase every record
          described in the{' '}
          <Link href="/legal/privacy" locale="en">
            privacy notice
          </Link>
          . Contact us separately to request removal of published work or exercise your data rights.
          These requests need an assessment of the particular content and circumstances.
        </p>
        <p>
          Removing content from Vibeset cannot reliably recall copies already downloaded or shared
          outside the service. This practical limit does not remove any legal obligations that apply
          to a removal request.
        </p>
      </section>
      <section aria-labelledby="terms-tools">
        <h2 id="terms-tools">Downloads and setup</h2>
        <p>
          The website supplies wallpaper files, icon images, browser previews and static decorative
          widget images. Those web previews and images are not live home-screen widgets. Vibeset
          does not automatically replace installed apps or apply your wallpaper. Setup depends on
          your operating system and any compatible app you choose to use. We are not affiliated with
          Apple, Google or the apps named in the catalogue.
        </p>
        <p>
          The iPhone companion includes a WidgetKit calendar/time implementation using your selected
          theme. You choose whether to add its widget through iOS controls; iOS controls refresh
          timing. Native features require a compatible app build. Describing them here does not
          announce TestFlight or public-beta availability. The initial companion’s saved favourites
          are local to the app and do not sync with website account favourites.
        </p>
        <p>
          Browser memory, file limits, sharing support and device settings can affect exports. Icon
          selection supports up to 125 catalogue apps and 20 custom icons. Standard photo wallpaper
          sizes differ from the extra 4K or screen-size options available for generated designs.
          Keep your own copy of work you want to retain; browser drafts and downloaded files are
          managed separately from your account.
        </p>
      </section>
      <section aria-labelledby="terms-service">
        <h2 id="terms-service">Availability and responsibility</h2>
        <p>
          The service and downloads are provided as available. We cannot promise uninterrupted
          access, compatibility with every device or a particular aesthetic result. We may restrict
          accounts or remove material to address misuse, security, safety or rights complaints.
          Nothing in these terms excludes rights, responsibilities or liability that the law does
          not allow us to exclude.
        </p>
      </section>
      <section aria-labelledby="terms-law">
        <h2 id="terms-law">Applicable law and questions</h2>
        <p>
          These terms are subject to applicable UK law. This does not remove mandatory rights or
          protections that apply to you, or require you to bring a claim in a court where the law
          does not require it. No exclusion in these terms limits a right or liability that cannot
          lawfully be excluded.
        </p>
        <p>
          Questions about these terms can be sent to{' '}
          <a href={`mailto:${publicEmail}`}>
            <bdi dir="ltr">{publicEmail}</bdi>
          </a>
          . When the terms change, the effective date above will identify the new version.
        </p>
      </section>
    </>
  );
}
