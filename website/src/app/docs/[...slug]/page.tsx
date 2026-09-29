import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllDocs } from '@/lib/content';

interface Props {
  params: Promise<{ slug: string[] }>;
}

export async function generateStaticParams() {
  return (await getAllDocs()).map((d) => ({ slug: [d.slug] }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = (await getAllDocs()).find((d) => d.slug === slug.join('/'));
  return doc ? { title: doc.title, description: doc.description } : {};
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const docs = await getAllDocs();
  const i = docs.findIndex((d) => d.slug === slug.join('/'));
  if (i === -1) notFound();
  const doc = docs[i];
  const prev = docs[i - 1];
  const next = docs[i + 1];

  return (
    <article>
      <h1 className="text-3xl font-semibold tracking-tight text-white">{doc.title}</h1>
      <div
        className="prose prose-invert mt-6 max-w-none prose-a:text-accent-300 prose-a:no-underline hover:prose-a:underline"
        dangerouslySetInnerHTML={{ __html: doc.html }}
      />
      <nav className="mt-12 flex justify-between border-t border-ink-800 pt-6 text-sm">
        {prev ? (
          <Link href={`/docs/${prev.slug}/`} className="text-ink-200 hover:text-white">
            ← {prev.title}
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/docs/${next.slug}/`} className="text-ink-200 hover:text-white">
            {next.title} →
          </Link>
        ) : <span />}
      </nav>
    </article>
  );
}
