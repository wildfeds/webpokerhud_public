import type { Metadata } from 'next';
import { ISSUES_URL, SITE_NAME } from '@/lib/site';

export const metadata: Metadata = { title: 'Terms of Service' };

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-xl font-semibold text-white">{children}</h2>;
}

export default function Terms() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-sm text-ink-400">Effective 21 September 2026</p>

      <div className="mt-8 space-y-4 leading-relaxed text-ink-200">
        <p>
          These terms govern your use of {SITE_NAME} — the browser extension,
          website, and analysis service. By using them you agree to these
          terms.
        </p>

        <H2>The service</H2>
        <p>
          {SITE_NAME} displays statistics about your own poker play. The free
          tier runs entirely in your browser. Pro adds server-side analysis,
          sold as prepaid time — a fixed number of days, no auto-renewal, no
          payment details on file. Statistics are informational only: they
          describe past play and are not gambling, financial, or strategy
          advice, and no outcome is promised from using them.
        </p>

        <H2>Third-party poker platforms</H2>
        <p>
          {SITE_NAME} is not affiliated with, endorsed by, or connected to
          Bovada or any poker platform. Poker sites have their own rules
          about tracking and assistance tools, and some prohibit them.{' '}
          <strong className="text-white">
            You are solely responsible for checking and complying with the
            terms of any platform you play on
          </strong>
          , and for any consequences of using {SITE_NAME} there, up to and
          including platform sanctions. Where online poker itself is
          restricted, complying with your local law is likewise your
          responsibility.
        </p>

        <H2>Accounts</H2>
        <p>
          Accounts are created via Google sign-in. Keep control of your
          Google account; activity under your session is treated as yours.
          One account per person. We may suspend accounts that abuse the
          service (see below).
        </p>

        <H2>Payments and refunds</H2>
        <p>
          Pro purchases are made in cryptocurrency via NOWPayments at the
          prices shown at checkout, and add the stated number of days to your
          subscription immediately on confirmation. Cryptocurrency payments
          are irreversible by nature; if something goes wrong — a payment not
          credited, a mistaken purchase — open an issue on{' '}
          <a className="underline" href={ISSUES_URL}>GitHub</a>{' '}
          and we will make it right where we reasonably can, including
          discretionary refunds. When prepaid time expires, Pro features lock
          and nothing is charged.
        </p>

        <H2>Acceptable use</H2>
        <p>
          Use {SITE_NAME} for your own play. Do not attempt to disrupt or
          overload the service, probe or circumvent its security or rate
          limits, resell access, or use another person&apos;s account. We may
          throttle, suspend, or terminate access that violates these terms,
          refunding remaining prepaid time unless the violation caused us
          harm.
        </p>

        <H2>Disclaimers and liability</H2>
        <p>
          The service is provided &quot;as is&quot; without warranties of any
          kind, express or implied, including fitness for a particular
          purpose and uninterrupted availability. To the maximum extent
          permitted by law, our total liability for any claim arising from
          the service is limited to the amount you paid us in the twelve
          months before the claim; we are not liable for indirect or
          consequential damages, including losses at the tables.
        </p>

        <H2>Changes and termination</H2>
        <p>
          We may update the service and these terms; material changes update
          the effective date above, and continued use is acceptance. You can
          stop using the service at any time; if we discontinue Pro entirely,
          we will refund remaining prepaid time.
        </p>

        <H2>Contact</H2>
        <p>
          Support, bug reports and account requests:{' '}
          <a className="underline" href={ISSUES_URL}>GitHub Issues</a>.
        </p>
      </div>
    </article>
  );
}
