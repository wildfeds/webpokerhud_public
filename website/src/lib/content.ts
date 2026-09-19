// Minimal markdown content system (design.md §4 "Docs pipeline"): glob
// src/content/docs, validate frontmatter with Zod (build fails on malformed
// files), render markdown → HTML with remark/rehype, and derive the ordered
// sidebar. Deliberately not Contentlayer/MDX.
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';

const Frontmatter = z.object({
  title: z.string(),
  description: z.string().optional(),
  // Global sidebar order; sections group contiguous runs of it.
  order: z.number(),
  section: z.string(),
});

export interface Doc extends z.infer<typeof Frontmatter> {
  slug: string;
  html: string;
}

const DOCS_DIR = path.join(process.cwd(), 'src', 'content', 'docs');

const renderer = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSlug)
  .use(rehypeStringify);

let cache: Doc[] | undefined;

export async function getAllDocs(): Promise<Doc[]> {
  if (cache) return cache;
  const files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md'));
  const docs = await Promise.all(
    files.map(async (file) => {
      const raw = fs.readFileSync(path.join(DOCS_DIR, file), 'utf8');
      const { data, content } = matter(raw);
      const fm = Frontmatter.parse(data);
      const html = String(await renderer.process(content));
      return { slug: file.replace(/\.md$/, ''), html, ...fm };
    }),
  );
  cache = docs.sort((a, b) => a.order - b.order);
  return cache;
}

export async function getDoc(slug: string): Promise<Doc | undefined> {
  return (await getAllDocs()).find((d) => d.slug === slug);
}

export interface SidebarSection {
  section: string;
  items: { slug: string; title: string }[];
}

export async function getSidebar(): Promise<SidebarSection[]> {
  const sections: SidebarSection[] = [];
  for (const doc of await getAllDocs()) {
    let last = sections[sections.length - 1];
    if (!last || last.section !== doc.section) {
      last = { section: doc.section, items: [] };
      sections.push(last);
    }
    last.items.push({ slug: doc.slug, title: doc.title });
  }
  return sections;
}
