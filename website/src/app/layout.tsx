import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { GITHUB_URL, ISSUES_URL, SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/site';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
  },
  description:
    'Free, open-source Bovada poker HUD as a Firefox extension: live stats over the table, your hand history kept locally, and a converter to PokerStars format for PokerTracker 4 and Hand2Note. Only the server-side analysis is paid.',
};

const nav = [
  { href: '/docs/', label: 'Docs' },
  { href: '/pricing/', label: 'Pricing' },
  { href: '/account/', label: 'Account' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-ink-950 font-sans text-ink-50 antialiased">
        {/* Analytics: Cloudflare Web Analytics is auto-injected at the edge by
            the Pages project (cookieless) — no beacon tag belongs here. */}
        {/* No backdrop-blur: it re-blurs on every scroll frame on iOS Safari. */}
        <header className="sticky top-0 z-40 border-b border-ink-800/70 bg-ink-950/95">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5">
            <Link href="/" className="text-[15px] font-semibold tracking-tight">
              {SITE_NAME}
            </Link>
            <nav className="flex items-center gap-6 text-sm text-ink-300">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="transition-colors hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="border-t border-ink-800/70 py-10 text-sm text-ink-400">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4">
            <p>© {new Date().getFullYear()} {SITE_NAME}</p>
            <nav className="flex gap-6">
              <Link href="/privacy/" className="transition-colors hover:text-white">Privacy</Link>
              <Link href="/terms/" className="transition-colors hover:text-white">Terms</Link>
              <a href={GITHUB_URL} className="transition-colors hover:text-white">GitHub</a>
              <a href={ISSUES_URL} className="transition-colors hover:text-white">Support</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
