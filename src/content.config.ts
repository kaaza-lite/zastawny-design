// Case studies: one MDX file per study in src/content/work/.
// The frontmatter holds the hero and the details cards; the body holds the sections.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const work = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/work' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      meta: z.string(), // the one-line category under the title
      pageTitle: z.string(), // browser tab and search result title
      description: z.string(), // search result description
      palette: z.enum(['calastone', 'bamboo', 'juicyway']),
      hero: image(),
      // Where the hero image is anchored at each breakpoint (CSS object-position)
      heroPosition: z.object({ desktop: z.string(), tablet: z.string(), mobile: z.string() }),
      heroWide: z.boolean().default(false), // Bamboo: the hero image is wider than the screen
      thumbnail: image(), // used on the "other projects" cards
      thumbnailTint: z.boolean().default(false),
      details: z.array(z.object({ label: z.string(), lines: z.array(z.string()) })),
      related: z.array(z.string()), // slugs of the two "other projects"
    }),
});

export const collections = { work };
