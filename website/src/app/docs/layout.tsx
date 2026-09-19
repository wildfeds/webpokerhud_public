import Link from 'next/link';
import { getSidebar } from '@/lib/content';

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const sidebar = await getSidebar();
  return (
    <div className="mx-auto flex max-w-5xl gap-10 px-4 py-12">
      <aside className="hidden w-48 shrink-0 sm:block">
        <nav className="sticky top-6 space-y-6 text-sm">
          {sidebar.map((s) => (
            <div key={s.section}>
              <p className="mb-2 font-semibold uppercase tracking-wide text-felt-400">
                {s.section}
              </p>
              <ul className="space-y-1.5">
                {s.items.map((item) => (
                  <li key={item.slug}>
                    <Link href={`/docs/${item.slug}/`} className="text-felt-200 hover:text-white">
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
