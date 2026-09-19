import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { SITE_NAME, SITE_TAGLINE, SITE_URL, SUPPORT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
  },
  description:
    'Free live poker HUD as a Chrome extension. Real-time stats over the table, hand tracking and winnings graphs — your hands never leave your machine.',
};

const nav = [
  { href: '/docs/', label: 'Docs' },
  { href: '/pricing/', label: 'Pricing' },
  { href: '/account/', label: 'Account' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-felt-950 text-felt-50 antialiased">
        <header className="border-b border-felt-800">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              {SITE_NAME}
            </Link>
            <nav className="flex gap-6 text-sm text-felt-200">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-white">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="border-t border-felt-800 py-8 text-sm text-felt-300">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4">
            <p>© {new Date().getFullYear()} {SITE_NAME}</p>
            <nav className="flex gap-6">
              <Link href="/privacy/" className="hover:text-white">Privacy</Link>
              <Link href="/terms/" className="hover:text-white">Terms</Link>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-white">Support</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
