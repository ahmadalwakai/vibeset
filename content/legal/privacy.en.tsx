import type { ReactElement } from 'react';
import { Link } from '@/i18n/navigation';
import type { LegalBodyProps } from '@/lib/legal';

export function PrivacyEn({
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
      <section aria-labelledby="privacy-summary">
        <h2 id="privacy-summary">The short version</h2>
        <p>
          You can browse and download public themes without an account. On the website, signing in
          lets you save favourites, collections and remixes to your account. Some preferences and
          unfinished work are saved in your browser instead. The initial iPhone companion has
          separate local preferences, described below. Approved creators can publish a profile and
          submit designs for review. Please avoid putting private information in public designs or
          reports.
        </p>
        <p>
          {operatorName} is responsible for Vibeset’s use of personal data. Questions and requests
          can be sent to{' '}
          <a href={`mailto:${publicEmail}`}>
            <bdi dir="ltr">{publicEmail}</bdi>
          </a>
          .
        </p>
      </section>
      <section aria-labelledby="privacy-collected">
        <h2 id="privacy-collected">Information we receive</h2>
        <ul>
          <li>
            <strong>Account and sign-in:</strong> name, email address, verification status, optional
            profile image, language, account and session identifiers, and account-security records.
            If you choose Google sign-in, Google supplies basic identity information such as your
            name, email and profile picture. Provider account identifiers and authentication tokens
            may be stored. This sign-in does not request access to Google Photos or Drive.
          </li>
          <li>
            <strong>Your choices and work:</strong> saved favourites, collection names, visibility
            and order, draft remixes, design settings and their source references. The icon picker
            records choices you make; it does not scan your device for installed apps.
          </li>
          <li>
            <strong>Creator information:</strong> application details, adult declaration, handle,
            display name, biography, links, chosen avatar, submitted images and designs, review
            status and reasons. Image processing records file type, dimensions, size and colour
            information. Re-encoding removes source metadata such as EXIF; people and other
            identifying details visible in an image can still be present.
          </li>
          <li>
            <strong>Reports and safety:</strong> the reported theme, reason, optional explanation,
            account reference when signed in, and moderation decisions. Visitor reports and rate
            limits can use a salted hash of an IP address. Audit records document administrative
            actions and relevant identifiers or reasons.
          </li>
          <li>
            <strong>Technical requests:</strong> our infrastructure receives information such as IP
            addresses and browser/request details when serving the site, images and sign-in
            messages. The web server hashes IP identifiers before storing them in its session and
            rate-limit fields. A hash reduces direct exposure; it is not a promise of anonymity.
          </li>
        </ul>
      </section>
      <section aria-labelledby="privacy-purposes">
        <h2 id="privacy-purposes">Why information is used</h2>
        <p>
          The service uses information to sign you in, provide your requested tools and saved work,
          review and display creator content, answer reports and requests, protect accounts and
          operate the site. The purpose-by-purpose explanation and applicable legal bases are below.
        </p>
        <ul>
          <li>
            <strong>Requested account and design tools:</strong> account sign-in, saved work,
            collections, remixes and creator submission/publication are used to provide the service
            you request under our agreement with you.
          </li>
          <li>
            <strong>Security, moderation and operation:</strong> we rely on legitimate interests in
            protecting accounts, preventing abuse, operating the service and resolving content
            complaints. These interests must be weighed against your rights and interests; they are
            not permission to collect unrelated information.
          </li>
          <li>
            <strong>Rights and legal matters:</strong> we use information to consider and answer
            privacy or other rights requests, comply with applicable legal obligations, and
            establish or defend legal claims where necessary.
          </li>
          <li>
            <strong>Usage counts:</strong> optional view statistics use your permission. Counts of
            download, export, remix and setup actions are used for our legitimate interest in
            understanding requested features and operating the catalogue. They are aggregate service
            measurements, not behavioural advertising profiles.
          </li>
        </ul>
        <p>
          We do not use these records to make solely automated decisions with legal or similarly
          significant effects about you. Human administrators review creator applications, submitted
          themes and reports.
        </p>
      </section>
      <section aria-labelledby="privacy-public">
        <h2 id="privacy-public">What other people can see</h2>
        <p>
          Published themes and approved public creator profiles can be viewed by anyone. A public
          profile can show the chosen handle, display name, biography, avatar and links. Private
          collections are owner-only. Unlisted collections can be read by people with their link.
          Reports and moderation records are not public comments.
        </p>
        <p>
          Image delivery uses asset URLs. A ready image URL is not an authenticated private vault;
          people who obtain a working URL may be able to retrieve it. Avoid uploading an image that
          you need to keep confidential. A profile picture hosted by Google or another image host
          can cause your browser to contact that host directly.
        </p>
      </section>
      <section aria-labelledby="privacy-statistics">
        <h2 id="privacy-statistics">Usage counts</h2>
        <p>
          Automatic theme-view statistics are off until you choose to enable them using the{' '}
          <a href="#view-statistics">view-statistics control</a> on this page. While off, the view
          feature does not read or write its per-theme session markers or send view events. When
          enabled, a browser-session marker limits repeat counting of each theme. You can switch the
          choice off again; cancelling an event already in transit is best effort. Changing the
          choice does not erase totals already counted.
        </p>
        <p>
          Wallpaper downloads, icon exports, remixes and setup completion can still contribute to
          daily theme totals when you use those features. The view-statistics choice does not
          disable these action counters or account favourites. Event counters do not store an
          account ID; requests omit credentials but still pass through hosting infrastructure and
          security rate limits. These totals are not a count of unique people.
        </p>
        <p>
          Your explicit choice is saved as <code>vibeset:view-statistics:v1</code>, containing a
          version and an enabled/disabled value. Nothing is written just to initialise the default.
          The preference applies to this browser across accounts. If local storage is unavailable, a
          choice you make can be held only in the current open tab and may reset on reload or close;
          the default remains off when no usable choice is available.
        </p>
        <p>
          The current site has no advertising, cross-site behavioural profiling or session replay
          feature. These statements concern Vibeset’s application features; service providers may
          also handle request and security information as described below.
        </p>
      </section>
      <section aria-labelledby="privacy-cookies">
        <h2 id="privacy-cookies">Cookies used by the site</h2>
        <ul>
          <li>
            <code>better-auth.session_token</code> keeps you signed in. On HTTPS its name starts
            with
            <code> __Secure-</code>. It is not accessible to ordinary page JavaScript. The default
            session lasts seven days and can be extended by session refresh; this is not a promise
            that the underlying record is erased seven days after your first sign-in.
          </li>
          <li>
            <code>better-auth.session_data</code> caches signed session information for up to five
            minutes. It uses the HTTPS prefix too and may be split across cookies. Sensitive account
            operations re-check the server’s current authority.
          </li>
          <li>
            <code>better-auth.state</code> supports the Google sign-in security flow. Its cookie
            lifetime is five minutes. The related server verification has a separate expiry.
          </li>
          <li>
            <code>NEXT_LOCALE</code> remembers the selected language. Vibeset does not configure a
            fixed lifetime for this cookie.
          </li>
        </ul>
        <p>
          Exact sign-in cookies depend on the flow and browser, and providers can have their own
          security cookies. Clearing or blocking sign-in cookies can sign you out or stop sign-in
          working. Browser settings do not remove the server account or downloaded files.
        </p>
      </section>
      <section aria-labelledby="privacy-device">
        <h2 id="privacy-device">Data saved in your browser</h2>
        <p>
          Local storage entries below have no automatic expiry set by Vibeset. They generally remain
          until replaced, reset or cleared by you or the browser. They are shared by accounts using
          that browser. On a shared device, sign-out alone does not clear all drafts and
          preferences.
        </p>
        <ul>
          <li>
            <code>theme</code>: light, dark or system appearance.
          </li>
          <li>
            <code>vibeset:favorites</code>: up to 500 locally saved theme IDs when signed out;
            submitted IDs are removed after a successful account merge.
          </li>
          <li>
            <code>vibeset:selected-apps</code>: up to 125 selected catalogue apps and 20 custom icon
            labels and glyph choices.
          </li>
          <li>
            <code>vibeset:ios-wizard:</code> followed by a theme slug or <code>default</code>: setup
            progress.
          </li>
          <li>
            <code>vibeset:studio-draft</code>: your draft design and source reference, which may
            include image asset keys rather than the image file itself.
          </li>
          <li>
            <code>vibeset:announcement-dismissals</code>: up to 50 dismissed announcement
            identifiers.
          </li>
          <li>
            <code>better-auth.message</code>: an authentication event used to coordinate tabs; this
            is not a saved session token.
          </li>
          <li>
            <code>vibeset:view-statistics:v1</code>: the optional automatic-view-statistics choice
            described above; missing or invalid data does not enable it.
          </li>
        </ul>
        <p>
          Session storage holds <code>vibeset:in-app-banner-dismissed</code> for embedded-browser
          instructions and, only when automatic view statistics are enabled,{' '}
          <code>vibeset:viewed:</code> followed by a theme ID for the view marker. Turning the
          option off stops access to those view markers; it does not itself clear earlier markers.
          Its lifetime is browser-managed; restored tabs can preserve it. Some tools use temporary
          page memory when browser storage is unavailable.
        </p>
        <p>
          You can remove these entries using your browser’s site-data controls. This can also remove
          local-only work and preferences, so export anything you want to keep first. Deleting your
          account does not automatically clear every device on which you used Vibeset.
        </p>
        <p>
          The privacy page includes an optional view-statistics control. Its choice is separate from
          signing in, using a requested tool or clearing browser data. The details of that control
          and its storage are explained in the usage-counts section above.
        </p>
      </section>
      <section aria-labelledby="privacy-native">
        <h2 id="privacy-native">The iPhone companion and its widget</h2>
        <p>
          This section describes the initial iPhone implementation; it does not announce a public
          beta. It uses the public catalogue without in-app sign-in or account sync. Requests to the
          public API and image CDN include search terms, filters or theme identifiers and chosen
          icon files needed to retrieve your choices, including saved themes. They omit account
          credentials, but hosting and delivery providers still receive IP addresses and request
          details. Opening a website link uses your browser, with its separate cookies and
          preferences.
        </p>
        <p>
          The app saves language, light/dark/system appearance, up to 500 favourite theme IDs,
          hidden theme IDs, blocked creators’ public handles and display names, and a
          selected-widget summary in local app storage at <code>vibeset:native-preferences:v1</code>
          . The summary includes the public theme’s identifier, names, colours, creator handle where
          present and the language chosen when applying it. Block and hide choices filter what this
          app displays; they do not themselves change a creator’s account or a theme’s moderation
          status. These favourites are not website account favourites. Local preferences are not
          uploaded as account changes or synced across devices. The current app does not send the
          website’s view, download, export, remix or setup-completion tracking events; the optional
          browser view-statistics control applies to the website.
        </p>
        <p>
          Updated builds also save your selected app identifiers, confirmed image saves and manual
          wallpaper, shortcut and widget checkmarks locally for each theme under{' '}
          <code>vibeset:native-setup:v1:</code> followed by its public theme identifier. This setup
          progress is tied to the current design version and is not uploaded or synced to an
          account. A checkmark records your confirmation; it does not let Vibeset inspect your Home
          Screen or installed apps. Reinstalling the app or clearing its data may remove this
          progress.
        </p>
        <p>
          When you explicitly submit a report, the app sends the theme identifier, your selected
          reason and any details you enter to Vibeset. A successful anonymous report is stored with
          a salted IP-address hash for moderation and abuse prevention. This is separate from local
          blocking or hiding and from optional view statistics. Use the details to explain the
          content concern; do not include passwords, sign-in links or unnecessary personal or
          sensitive information.
        </p>
        <p>
          Applying a calendar/time widget also stores its selected public theme data, display
          settings and dated timeline in an iOS App Group shared by the app and its WidgetKit
          extension. The extension uses the device’s date, time zone and selected language to
          refresh its calendar locally, without signing in or making network requests. Clearing the
          widget choice replaces it with empty instructions. Local choices have no automatic expiry
          set by Vibeset; website sign-out or account deletion does not clear this app storage.
          Device backups, removal and restoration follow iOS settings and behaviour.
        </p>
        <p>
          Only when you choose to save a wallpaper or individual icon images does the app request
          permission to add an image to Photos. The current save feature does not read your existing
          photo library. Native sharing opens only after you choose Share; you decide the
          destination, whose own terms and data handling apply. A temporary image is downloaded to
          the app cache for saving or sharing, and the app attempts to remove that copy afterwards.
          Saved Photos, backups and copies sent elsewhere follow your device and destination
          settings; clearing app preferences does not recall them.
        </p>
      </section>
      <section aria-labelledby="privacy-providers">
        <h2 id="privacy-providers">Services involved in delivery</h2>
        <ul>
          <li>
            <a href="https://vercel.com/legal/privacy-notice">Vercel</a>: website hosting, server
            requests and operational security.
          </li>
          <li>
            <a href="https://neon.com/platform-terms">Neon</a>: the PostgreSQL database holding
            account and service records.
          </li>
          <li>
            <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare</a>: image storage,
            delivery and related request/security handling.
          </li>
          <li>
            <a href="https://resend.com/legal/privacy-policy">Resend</a>: sign-in email delivery and
            delivery information.
          </li>
          <li>
            <a href="https://policies.google.com/privacy">Google</a>: optional Google sign-in and
            Google-hosted profile pictures.
          </li>
        </ul>
        <p>
          Operational logs held by Vercel can include requested paths, the request’s user-agent
          information and an approximate country inferred from the IP address. These records help
          deliver content, investigate technical problems and prevent abuse. They are separate from
          the website’s optional view counters and from report information stored in our database.
          Depending on their configuration, provider request logs may also retain query parameters,
          which can contain the search terms you send for requested results.
        </p>
        <p>
          Using an installed open-source package is different from sending information to a hosted
          provider. Fonts and icon glyph assets used by Vibeset are served with the site. Google’s
          sign-in service also has its own privacy terms; it is not described here as a processor
          for every purpose.
        </p>
        <p>
          Providers may handle account, image, email or request information outside your country,
          including outside the UK. Public themes and profiles are available internationally. We do
          not promise that all processing stays in the UK, and a database region alone does not
          establish that. You can contact us for information about the providers, locations and
          transfer arrangements relevant to your data, including safeguards where applicable.
        </p>
      </section>
      <section aria-labelledby="privacy-retention">
        <h2 id="privacy-retention">Retention and deletion</h2>
        <p>
          An emailed sign-in link is valid for ten minutes. A pending upload link is valid for five
          minutes. These access limits do not mean every associated database record, email copy or
          provider log is deleted at the same time. Security rate-limit records are eligible for
          scheduled cleanup when older than 48 hours; delayed or retried maintenance can take
          longer.
        </p>
        <p>
          Provider request logs follow the service’s configured retention and security requirements.
          Their retention is separate from moderation reports and rate-limit records; a provider log
          window is not a promise that those database records are erased at the same time.
        </p>
        <p>
          Deleting your account removes your profile, sessions, provider-account links, favourites,
          owned collections and unpublished designs. Published themes remain with the account link
          removed, and original images still used by retained themes can remain. Removing that link
          does not make an identifying image or title anonymous. Reports and audit records can also
          retain details after their account reference is removed.
        </p>
        <p>
          File deletion runs after the account transaction and can require retries. Public delivery
          caches, backups, provider records and copies downloaded by others have separate
          lifecycles. Contact us about published-content removal or personal-data erasure; account
          deletion is not the only way to make a request.
        </p>
        <ul>
          <li>
            Account details and saved work generally remain until you delete the account or request
            a change. They are not automatically erased just because an account is unused. The
            published-content distinction above still applies.
          </li>
          <li>
            Published designs and source images used by retained designs remain in the catalogue
            until removed following a removal request, moderation decision or other review. A
            content licence is not a blanket reason to refuse a personal-data erasure request.
          </li>
          <li>
            Reports, moderation decisions and audit history may be retained to investigate an issue,
            prevent repeat abuse, maintain an accountable decision history or deal with legal
            claims. We assess their continued need and requests concerning them. There is currently
            no general automatic age-based purge for these records.
          </li>
          <li>
            Ready images and rejected upload records do not have a general automatic age purge.
            Unfinished uploads older than 24 hours are marked rejected during scheduled maintenance;
            this is not a promise that every associated file or row is erased then.
          </li>
          <li>
            Session and verification records have validity limits, but expiry is not the same as
            physical deletion of every row. Provider logs and database restore copies follow the
            relevant service configuration. If the separate private SQL-backup process is used, its
            bucket must have a 60-day expiry rule; removal is asynchronous and that rule does not
            describe every provider’s backups.
          </li>
        </ul>
        <p>
          You can ask about the period or reason for keeping a particular record. We may need
          limited information to locate it or verify a request safely. We do not need your password
          or a sign-in link.
        </p>
      </section>
      <section aria-labelledby="privacy-rights">
        <h2 id="privacy-rights">Your account download and requests</h2>
        <p>
          In{' '}
          <Link href="/account" locale="en">
            account settings
          </Link>{' '}
          you can download account data or request account deletion. The download includes profile
          information, favourites, collections and items, remixes, creator-profile information and
          summaries of owned themes. It excludes sign-in credentials, sessions, provider tokens,
          reports, upload inventory and internal moderation or audit records. It is a useful account
          download, not an exhaustive response to every request for personal information.
        </p>
        <p>
          Depending on applicable law and circumstances, you can ask for access, correction,
          erasure, restrictions or portability, or object to particular processing. Contact{' '}
          <a href={`mailto:${publicEmail}`}>
            <bdi dir="ltr">{publicEmail}</bdi>
          </a>{' '}
          if you cannot access your account or need a broader request. You do not need to create an
          account to contact us. Please describe the issue and provide only the information needed
          to locate it; never send a sign-in link.
        </p>
        <p>
          Tell us what information or content is involved and what you would like us to do. We may
          ask for proportionate clarification or verification when necessary to avoid disclosing
          someone else’s data. We consider requests under the law that applies and explain the
          outcome, including any relevant limits; we do not promise automatic removal of every
          record or an outcome before assessing the request.
        </p>
        <p>
          You can also email a privacy complaint and reply if you think our response has missed
          something. If you remain concerned, you can contact the{' '}
          <a href="https://ico.org.uk/make-a-complaint/">UK Information Commissioner’s Office</a> or
          the relevant data-protection authority. The{' '}
          <a href="https://ico.org.uk/for-the-public/">ICO’s public guidance</a> explains data
          rights and complaints. You do not have to give up rights by using the account download or
          deletion tools.
        </p>
      </section>
      <section aria-labelledby="privacy-young-people">
        <h2 id="privacy-young-people">Young people</h2>
        <p>
          The site can be visited by young people. The creator programme requires an adult
          declaration, but browsing is not age-verified. Keep your real-world private details out of
          public designs and links. You or someone helping you can contact us about information or
          an image that concerns you.
        </p>
        <p>
          We do not use advertising or behavioural profiling to target young visitors. Public
          publishing is reviewed, and user collections are private by default. Optional view
          statistics start off. You can contact us directly about your data, or ask a trusted adult
          to help; help from an adult is not a condition of contacting us. Do not send sensitive
          identity documents or private photographs unless a necessary, specific verification step
          has been explained.
        </p>
      </section>
      <section aria-labelledby="privacy-updates">
        <h2 id="privacy-updates">Changes and contact</h2>
        <p>
          The date above identifies this notice. Questions about a change, privacy or content
          removal can be sent to{' '}
          <a href={`mailto:${publicEmail}`}>
            <bdi dir="ltr">{publicEmail}</bdi>
          </a>
          . Our{' '}
          <Link href="/legal/terms" locale="en">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/legal/copyright" locale="en">
            copyright page
          </Link>{' '}
          provide related information.
        </p>
      </section>
    </>
  );
}
