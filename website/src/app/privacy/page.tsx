import type { Metadata } from 'next';
import { ISSUES_URL, SITE_NAME } from '@/lib/site';

export const metadata: Metadata = { title: 'Privacy Policy' };

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-xl font-semibold text-white">{children}</h2>;
}

export default function Privacy() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-ink-400">Effective 21 September 2026</p>

      <div className="mt-8 space-y-4 leading-relaxed text-ink-200">
        <p>
          {SITE_NAME} is a browser extension that shows you statistics about
          your own online poker play, with an optional paid analysis service.
          This policy describes what data we handle and what we do with it.
          The short version: your hands stay in your browser, we never store
          them on our servers, and we collect nothing unless you create an
          account.
        </p>

        <H2>Using the extension without an account</H2>
        <p>
          Hand histories captured by the extension are stored locally in your
          browser (IndexedDB) on your device. In the free tier with no
          account, nothing is sent to us: no personal data, no telemetry, no
          analytics. Uninstalling the extension or clearing browser data
          removes this local data; the export feature lets you back it up
          first.
        </p>

        <H2>Accounts</H2>
        <p>
          Signing in uses Google OAuth. We receive and store the profile
          Google shares: your email address, display name, and avatar image
          URL, together with your subscription state (plan and expiry). We use
          this solely to authenticate you and operate your subscription. We do
          not use passwords and never see your Google credentials.
        </p>

        <H2>Analysis requests</H2>
        <p>
          When you open the Analysis Panel, your locally stored hands are
          uploaded over HTTPS to our analysis server, processed in memory to
          compute your statistics, and the results are returned.{' '}
          <strong className="text-white">
            Hand data is not stored on our servers
          </strong>{' '}
          — it exists there only for the duration of the request. Our
          operational logs record request metadata (hand counts, timings,
          subscription tier) for up to 30 days, never hand contents.
        </p>

        <H2>Payments</H2>
        <p>
          Pro is prepaid time paid in cryptocurrency, processed by
          NOWPayments. We never receive or store wallet keys or payment
          credentials. We keep purchase records (plan, amount, order and
          payment identifiers, status) to operate your subscription and for
          accounting. Cryptocurrency transactions are additionally recorded on
          public blockchains by their nature, outside our control.
          NOWPayments&apos; own privacy policy governs the data they process.
        </p>

        <H2>Cookies and tracking</H2>
        <p>
          We run no advertising and no cross-site tracking. The website and
          extension use browser storage only to keep you signed in and to
          remember interface preferences.
        </p>

        <H2>Sharing</H2>
        <p>
          We do not sell or rent your data. It is processed by the
          infrastructure providers the service is built on — Supabase
          (accounts and database), Google Cloud (analysis server hosting),
          Cloudflare (website hosting and DNS), and NOWPayments (payments) —
          each only to provide their function. We would disclose data if
          legally compelled to.
        </p>

        <H2>Retention and deletion</H2>
        <p>
          Account and subscription data is kept while your account exists.
          To delete your account and its data, open a request on{' '}
          <a className="underline" href={ISSUES_URL}>GitHub Issues</a>; we will
          confirm you control the account before deleting, and we may retain purchase records
          where bookkeeping rules require it. Your hand data needs no deletion
          request — it was never on our servers.
        </p>

        <H2>Security</H2>
        <p>
          All transport is encrypted (HTTPS). Database access is scoped by
          row-level security so account data is readable only by its owner;
          payment fulfillment runs with verified, signed provider callbacks.
          No system is perfectly secure, but we designed this one to hold as
          little of your data as possible — the best protection for data is
          not having it.
        </p>

        <H2>Changes and contact</H2>
        <p>
          If this policy changes materially we will update the effective date
          above. Questions: open an issue on{' '}
          <a className="underline" href={ISSUES_URL}>GitHub</a>.
        </p>
      </div>
    </article>
  );
}
