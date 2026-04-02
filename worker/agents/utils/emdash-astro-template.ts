import type { TemplateDetails } from '../../services/sandbox/sandboxTypes';

const EMDASH_ASTRO_TEMPLATE_INSTRUCTIONS = `
To build a valid EmDash Astro theme, follow these rules:

1. This is an Astro project integrated with EmDash CMS for content management.
   - Astro files use \`.astro\` extension with frontmatter (---) and template sections.
   - Pages go in \`src/pages/\` (file-based routing).
   - Layouts go in \`src/layouts/\`.
   - Components go in \`src/components/\`.

2. **EmDash Content API** via \`@emdash/astro\`:
   \`\`\`astro
   ---
   import { getLiveCollection, getLiveDocument } from '@emdash/astro';

   // Fetch all posts
   const posts = await getLiveCollection('posts');

   // Fetch a single document by slug
   const post = await getLiveDocument('posts', Astro.params.slug);
   ---
   \`\`\`

3. **Portable Text Rendering** for rich content:
   \`\`\`astro
   ---
   import { PortableText } from '@portabletext/astro';
   ---
   <PortableText value={post.body} />
   \`\`\`
   The \`@portabletext/astro\` package renders EmDash's Portable Text format into HTML.

4. **Tailwind CSS** for styling:
   - Use Tailwind utility classes in \`.astro\` files.
   - Configure via \`tailwind.config.mjs\`.
   - Import styles from global CSS when needed.

5. **File-based Routing:**
   - \`src/pages/index.astro\` -> \`/\`
   - \`src/pages/blog/index.astro\` -> \`/blog\`
   - \`src/pages/blog/[slug].astro\` -> \`/blog/:slug\` (dynamic route)

6. **Astro Config:** \`astro.config.mjs\` is pre-configured with \`emdash()\` and \`tailwindcss()\` integrations. Do NOT modify it.

7. **Live Editing:** \`live.config.ts\` configures real-time content editing in EmDash admin. Do NOT modify it.

8. **Mock Content:** For development preview, \`src/content/mock.ts\` provides mock data. Use conditional imports:
   \`\`\`astro
   ---
   import { getLiveCollection } from '@emdash/astro';
   import { mockPosts } from '../content/mock';
   const posts = (await getLiveCollection('posts').catch(() => null)) ?? mockPosts;
   ---
   \`\`\`

9. **No Binary Assets:** Use external image URLs (unsplash, placehold.co). No .png/.jpg/.svg files.

10. **SEO:** Use EmDash content metadata for page titles, descriptions, and Open Graph tags.
`;

/**
 * EmDash Astro theme template for CMS-driven website generation.
 * Used when the user wants to build/modify an Astro theme integrated with EmDash.
 */
export function createEmdashAstroThemeTemplateDetails(): TemplateDetails {
    const astroFiles: Record<string, string> = {
        'astro.config.mjs': `// EmDash Astro integration config -- DO NOT MODIFY
import { defineConfig } from 'astro/config';
import emdash from '@emdash/astro';
import tailwindcss from '@tailwindcss/astro';

export default defineConfig({
  output: 'server',
  integrations: [emdash(), tailwindcss()],
});
`,
        'live.config.ts': `// EmDash live editing config -- DO NOT MODIFY
import { defineLiveConfig } from '@emdash/astro/live';

export default defineLiveConfig({
  // Enables real-time content editing from EmDash admin panel
  enabled: true,
});
`,
        'src/pages/index.astro': `---
import Layout from '../layouts/Layout.astro';
import { getLiveCollection } from '@emdash/astro';
import { mockPosts } from '../content/mock';

const posts = (await getLiveCollection('posts').catch(() => null)) ?? mockPosts;
---

<Layout title="Home">
  <section class="max-w-4xl mx-auto px-4 py-12">
    <h1 class="text-4xl font-bold mb-2">Welcome</h1>
    <p class="text-lg text-gray-600 mb-10">
      A content-driven website powered by EmDash CMS.
    </p>

    <div class="grid gap-8 md:grid-cols-2">
      {posts.map((post: Record<string, unknown>) => (
        <a
          href={\`/blog/\${post.slug}\`}
          class="block rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
        >
          {post.coverImage && (
            <img
              src={post.coverImage as string}
              alt={post.title as string}
              class="w-full h-48 object-cover rounded-md mb-4"
            />
          )}
          <h2 class="text-xl font-semibold mb-2">{post.title}</h2>
          <p class="text-gray-600 text-sm">{post.excerpt}</p>
        </a>
      ))}
    </div>
  </section>
</Layout>
`,
        'src/layouts/Layout.astro': `---
interface Props {
  title: string;
  description?: string;
}

const { title, description = 'A website powered by EmDash CMS' } = Astro.props;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content={description} />
    <title>{title}</title>
  </head>
  <body class="min-h-screen bg-white text-gray-900 antialiased">
    <nav class="border-b border-gray-200">
      <div class="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <a href="/" class="text-lg font-bold">Site Name</a>
        <div class="flex gap-6 text-sm text-gray-600">
          <a href="/" class="hover:text-gray-900">Home</a>
          <a href="/blog" class="hover:text-gray-900">Blog</a>
        </div>
      </div>
    </nav>

    <main>
      <slot />
    </main>

    <footer class="border-t border-gray-200 mt-16">
      <div class="max-w-4xl mx-auto px-4 py-8 text-center text-sm text-gray-500">
        Built with EmDash CMS and Astro.
      </div>
    </footer>
  </body>
</html>
`,
        'src/components/PortableText.astro': `---
import { PortableText as PT } from '@portabletext/astro';

interface Props {
  value: unknown[];
}

const { value } = Astro.props;
---

<div class="prose prose-gray max-w-none">
  <PT value={value} />
</div>
`,
        'package.json': JSON.stringify({
            name: 'emdash-astro-theme',
            version: '1.0.0',
            type: 'module',
            scripts: {
                dev: 'astro dev',
                build: 'astro build',
                preview: 'astro preview',
            },
            dependencies: {
                'astro': '^5.0.0',
                '@emdash/astro': '^1.0.0',
                '@tailwindcss/astro': '^1.0.0',
                '@portabletext/astro': '^1.0.0',
            },
            devDependencies: {
                'typescript': '^5.5.0',
            },
        }, null, 2),
        'tailwind.config.mjs': `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
`,
        'src/content/mock.ts': `// Mock content data for development preview without live EmDash instance.
// When connected to EmDash, getLiveCollection() returns real data.

export const mockPosts = [
  {
    _id: 'post-1',
    title: 'Getting Started with EmDash',
    slug: 'getting-started',
    excerpt: 'Learn how to set up your EmDash-powered website and start creating content.',
    coverImage: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=600',
    body: [
      {
        _type: 'block',
        children: [{ _type: 'span', text: 'Welcome to your new EmDash-powered website. This is a sample post to get you started.' }],
        style: 'normal',
      },
    ],
    publishedAt: '2024-01-15',
    author: { name: 'Admin', avatar: null },
  },
  {
    _id: 'post-2',
    title: 'Customizing Your Theme',
    slug: 'customizing-theme',
    excerpt: 'Explore how to customize your Astro theme with Tailwind CSS and EmDash content.',
    coverImage: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=600',
    body: [
      {
        _type: 'block',
        children: [{ _type: 'span', text: 'This guide covers theme customization including layouts, typography, and color schemes.' }],
        style: 'normal',
      },
    ],
    publishedAt: '2024-01-20',
    author: { name: 'Admin', avatar: null },
  },
  {
    _id: 'post-3',
    title: 'Working with Portable Text',
    slug: 'portable-text',
    excerpt: 'Understanding how EmDash stores and renders rich content using Portable Text format.',
    coverImage: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=600',
    body: [
      {
        _type: 'block',
        children: [{ _type: 'span', text: 'Portable Text is a flexible rich text format that separates content from presentation.' }],
        style: 'normal',
      },
    ],
    publishedAt: '2024-02-01',
    author: { name: 'Admin', avatar: null },
  },
];

export const mockPages = [
  {
    _id: 'page-about',
    title: 'About',
    slug: 'about',
    body: [
      {
        _type: 'block',
        children: [{ _type: 'span', text: 'This is a sample about page. Replace this content from the EmDash admin panel.' }],
        style: 'normal',
      },
    ],
  },
];
`,
    };

    return {
        name: 'emdash-astro',
        description: {
            selection: 'emdash-astro-theme-template',
            usage: `EmDash CMS Astro theme template with Tailwind CSS, Portable Text rendering, and content-driven pages. ${EMDASH_ASTRO_TEMPLATE_INSTRUCTIONS}`,
        },
        fileTree: {
            path: '/',
            type: 'directory',
            children: [
                {
                    path: 'src',
                    type: 'directory',
                    children: [
                        { path: 'pages', type: 'directory', children: [{ path: 'index.astro', type: 'file' }] },
                        { path: 'layouts', type: 'directory', children: [{ path: 'Layout.astro', type: 'file' }] },
                        { path: 'components', type: 'directory', children: [{ path: 'PortableText.astro', type: 'file' }] },
                        { path: 'content', type: 'directory', children: [{ path: 'mock.ts', type: 'file' }] },
                    ],
                },
                { path: 'package.json', type: 'file' },
                { path: 'astro.config.mjs', type: 'file' },
                { path: 'live.config.ts', type: 'file' },
                { path: 'tailwind.config.mjs', type: 'file' },
            ],
        },
        allFiles: astroFiles,
        language: 'typescript',
        deps: {
            'astro': '^5.0.0',
            '@emdash/astro': '^1.0.0',
            '@tailwindcss/astro': '^1.0.0',
            '@portabletext/astro': '^1.0.0',
        },
        projectType: 'app',
        renderMode: 'emdash-astro',
        initCommand: 'astro dev',
        frameworks: ['astro', 'emdash', 'tailwindcss'],
        importantFiles: ['src/pages/index.astro', 'src/layouts/Layout.astro', 'package.json'],
        dontTouchFiles: ['astro.config.mjs', 'live.config.ts'],
        redactedFiles: [],
        disabled: false,
    };
}
