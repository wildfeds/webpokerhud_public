import type { Metadata } from 'next';
import Link from 'next/link';
import { getSidebar } from '@/lib/content';

export const metadata: Metadata = { title: 'Docs' };

export default async function DocsIndex() {
  const sidebar = await getSidebar();
  return (
    <div>
      <h1 className="text-3xl font-bold">Documentation</h1>
      <div className="mt-8 space-y-10">
        {sidebar.map((s) => (
          <section key={s.section}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-felt-400">
              {s.section}
            </h2>
            <ul className="mt-3 space-y-2">
              {s.items.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/docs/${item.slug}/`}
                    className="text-lg text-felt-100 underline-offset-4 hover:underline"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
