/*
 * Blog posts are .mdx pages under src/pages/blog rather than a content
 * collection, so every list of them comes from this one glob.
 *
 * The URL Astro gives a glob-imported page has no trailing slash
 * (/blog/bing-not-google), while the canonical, the sitemap and every other
 * internal link use one. Linking the bare form made Ahrefs crawl each post
 * twice and report the slashless copies as non-canonical duplicates (crawl of
 * 2026-11-05), so the URL is normalised here, once.
 */

export interface PostFrontmatter {
  title: string;
  /** Shorter <title> for search results when `title` runs past 60 characters. */
  seoTitle?: string;
  description: string;
  date: string;
  category: string;
  image?: string;
  author: string;
  authorImage: string;
  readingTime: number;
  /** Slugs of the /work/ case studies this post is about. */
  caseStudies?: string[];
}

export interface Post {
  url: string;
  frontmatter: PostFrontmatter;
}

const modules = import.meta.glob<{ url: string; frontmatter: PostFrontmatter }>(
  '../pages/blog/*.mdx',
  { eager: true },
);

/** Every post, newest first, with a trailing-slash URL. */
export const posts: Post[] = Object.values(modules)
  .map((m) => ({
    url: m.url.endsWith('/') ? m.url : `${m.url}/`,
    frontmatter: m.frontmatter,
  }))
  .sort((a, b) => Date.parse(b.frontmatter.date) - Date.parse(a.frontmatter.date));

/** Posts that write about the given case study. */
export function postsForCaseStudy(slug: string): Post[] {
  return posts.filter((p) => p.frontmatter.caseStudies?.includes(slug));
}
