import rss from '@astrojs/rss';

/*
 * A feed is the lightest way for an assistant to keep up with new posts
 * without re-crawling the site, which is exactly the point our own scanner
 * makes when it finds one. Posts are .mdx pages rather than a content
 * collection, so they come from a glob rather than getCollection().
 */
const posts = Object.values(import.meta.glob('./blog/*.mdx', { eager: true }));

export function GET(context) {
  return rss({
    title: 'Creative Bandit',
    description:
      'Notes on AI integration, web development, and design systems from a two-person ' +
      'studio in Indianapolis.',
    site: context.site,
    items: posts
      .map((post) => ({
        title: post.frontmatter.title,
        description: post.frontmatter.description,
        pubDate: new Date(post.frontmatter.date),
        link: post.url,
        categories: post.frontmatter.category ? [post.frontmatter.category] : undefined,
      }))
      .sort((a, b) => b.pubDate - a.pubDate),
    customData: '<language>en-us</language>',
  });
}
