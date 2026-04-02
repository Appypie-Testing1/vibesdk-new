import type { TemplateDetails } from '../../services/sandbox/sandboxTypes';

const EMDASH_PLUGIN_TEMPLATE_INSTRUCTIONS = `
To build a valid EmDash CMS plugin, follow these rules:

1. Every plugin MUST export a default \`definePlugin()\` call from \`src/index.ts\`.
   \`\`\`
   import { definePlugin } from '@emdash/plugin-sdk';
   export default definePlugin({ ... });
   \`\`\`

2. The plugin manifest (\`manifest.ts\`) declares capabilities, hooks, routes, storage, and admin pages. The manifest MUST match the actual code -- every hook, route, and storage collection used in code must appear in the manifest.

3. **Capabilities** control what the plugin can do. Request ONLY what is needed:
   - \`network:fetch\` -- make HTTP requests via \`ctx.network.fetch()\` (NEVER use global \`fetch()\`)
   - \`read:content\` -- read CMS content entries
   - \`write:content\` -- create/update/delete CMS content entries
   - \`read:media\` -- read media assets from the CMS media library
   - \`write:media\` -- upload/modify media assets
   - \`email:send\` -- send transactional emails via the CMS email service
   - \`email:deliver\` -- deliver emails (SMTP-level access)
   - \`page:inject\` -- inject scripts/styles/HTML into rendered pages
   - \`page:metadata\` -- modify page metadata (title, description, og tags)
   - \`page:fragments\` -- provide content fragments for theme slots
   - \`comment:read\` -- read comments
   - \`comment:write\` -- create/update comments
   - \`comment:moderate\` -- moderate comments (approve, reject, delete)
   - \`user:read\` -- read user/member data
   - \`cron\` -- run scheduled tasks

4. **Lifecycle Hooks** respond to CMS events:
   - Content: \`content:beforeSave\`, \`content:afterSave\`, \`content:beforeDelete\`, \`content:afterDelete\`
   - Media: \`media:beforeUpload\`, \`media:afterUpload\`
   - Email: \`email:beforeSend\`, \`email:deliver\`, \`email:afterSend\`
   - Comment: \`comment:beforeCreate\`, \`comment:afterCreate\`, \`comment:beforeDelete\`, \`comment:afterDelete\`
   - Scheduled: \`cron\` (with schedule expression)
   - Plugin lifecycle: \`plugin:activate\`, \`plugin:install\`, \`plugin:deactivate\`, \`plugin:uninstall\`
   - Page: \`page:metadata\`, \`page:fragments\`

5. **Routes** expose HTTP endpoints from the plugin:
   \`\`\`
   routes: [
     {
       path: '/webhook',
       method: 'POST',
       public: true, // no auth required
       handler: async (req, ctx) => { ... },
       validation: { body: z.object({ event: z.string() }) }
     }
   ]
   \`\`\`
   Use Zod for request validation. Routes can be \`public: true\` (webhooks) or \`public: false\` (admin-only).

6. **Storage API** provides persistent key-value collections:
   \`\`\`
   const items = ctx.storage.collection('items');
   await items.put('key', { name: 'value' });
   const item = await items.get('key');
   await items.delete('key');
   const results = await items.query({ prefix: 'user_' });
   const count = await items.count();
   \`\`\`
   Every collection used in code MUST be declared in the manifest storage array.

7. **Network requests** MUST use \`ctx.network.fetch()\`, NOT global \`fetch()\`. The sandbox intercepts and enforces \`allowedHosts\`.
   \`\`\`
   // CORRECT:
   const res = await ctx.network.fetch('https://api.stripe.com/v1/charges', { method: 'POST', ... });
   // FORBIDDEN:
   const res = await fetch('https://api.stripe.com/v1/charges', ...); // will be blocked
   \`\`\`

8. **Sandbox Limits:**
   - 50ms CPU time per invocation
   - 10 subrequests per invocation
   - 30s wall-time timeout
   - ~128MB memory limit
   - No filesystem access, no child processes, no eval()

9. \`emdash.config.ts\` is the dev config -- do NOT modify it.

10. Admin pages use React (TSX) and are rendered in the CMS admin panel:
    \`\`\`
    // src/admin/settings.tsx
    import { AdminPage } from '@emdash/plugin-sdk/admin';
    export default function SettingsPage({ ctx }: { ctx: AdminPageContext }) { ... }
    \`\`\`
`;

/**
 * EmDash plugin template for CMS plugin generation.
 * Used when the user wants to build an EmDash CMS plugin.
 */
export function createEmdashPluginTemplateDetails(): TemplateDetails {
    const pluginFiles: Record<string, string> = {
        'src/index.ts': `import { definePlugin } from '@emdash/plugin-sdk';
import type { PluginContext, ContentHookPayload } from '@emdash/plugin-sdk';
import manifest from '../manifest';

export default definePlugin({
  manifest,

  hooks: {
    'plugin:activate': async (ctx: PluginContext) => {
      console.log(\`Plugin \${manifest.id} activated\`);
    },

    'content:afterSave': async (payload: ContentHookPayload, ctx: PluginContext) => {
      // Handle content save events
      const { document, collection } = payload;
      console.log(\`Content saved in \${collection}: \${document._id}\`);
    },
  },

  routes: [
    {
      path: '/status',
      method: 'GET',
      public: false,
      handler: async (req, ctx) => {
        return Response.json({ status: 'active', version: manifest.version });
      },
    },
  ],
});
`,
        'manifest.ts': `import type { PluginManifest } from '@emdash/plugin-sdk';

const manifest: PluginManifest = {
  id: 'my-emdash-plugin',
  name: 'My EmDash Plugin',
  version: '1.0.0',
  description: 'An EmDash CMS plugin',
  author: 'Plugin Author',

  capabilities: [
    'read:content',
  ],

  allowedHosts: [],

  hooks: [
    'plugin:activate',
    'content:afterSave',
  ],

  routes: [
    { path: '/status', method: 'GET', public: false },
  ],

  storage: [],

  admin: {
    settings: true,
  },
};

export default manifest;
`,
        'package.json': JSON.stringify({
            name: 'my-emdash-plugin',
            version: '1.0.0',
            type: 'module',
            scripts: {
                dev: 'emdash plugin dev',
                build: 'emdash plugin build',
                validate: 'emdash plugin validate',
                deploy: 'emdash plugin deploy',
            },
            dependencies: {
                '@emdash/plugin-sdk': '^1.0.0',
                'zod': '^3.23.0',
            },
            devDependencies: {
                'typescript': '^5.5.0',
                '@emdash/cli': '^1.0.0',
            },
        }, null, 2),
        'tsconfig.json': JSON.stringify({
            compilerOptions: {
                target: 'ESNext',
                module: 'ESNext',
                moduleResolution: 'bundler',
                strict: true,
                esModuleInterop: true,
                skipLibCheck: true,
                outDir: 'dist',
                rootDir: '.',
                jsx: 'react-jsx',
                declaration: true,
                sourceMap: true,
            },
            include: ['src/**/*', 'manifest.ts'],
            exclude: ['node_modules', 'dist'],
        }, null, 2),
        'emdash.config.ts': `// EmDash plugin dev configuration -- DO NOT MODIFY
import { defineConfig } from '@emdash/cli';

export default defineConfig({
  plugin: {
    entry: './src/index.ts',
    manifest: './manifest.ts',
  },
  dev: {
    port: 3100,
    // Connect to a local EmDash instance for testing
    emdashUrl: 'http://localhost:4321',
  },
});
`,
        'src/admin/settings.tsx': `import type { AdminPageContext } from '@emdash/plugin-sdk/admin';

export default function SettingsPage({ ctx }: { ctx: AdminPageContext }) {
  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>
        Plugin Settings
      </h2>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        Configure your plugin settings below.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          // Save settings via ctx.storage
        }}
      >
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>
            Setting Name
          </label>
          <input
            type="text"
            placeholder="Enter value"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
        </div>
        <button
          type="submit"
          style={{
            padding: '8px 16px',
            backgroundColor: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Save Settings
        </button>
      </form>
    </div>
  );
}
`,
    };

    return {
        name: 'emdash-plugin',
        description: {
            selection: 'emdash-plugin-template',
            usage: `EmDash CMS plugin template using definePlugin() API with sandboxed execution. ${EMDASH_PLUGIN_TEMPLATE_INSTRUCTIONS}`,
        },
        fileTree: {
            path: '/',
            type: 'directory',
            children: [
                {
                    path: 'src',
                    type: 'directory',
                    children: [
                        { path: 'index.ts', type: 'file' },
                        {
                            path: 'admin',
                            type: 'directory',
                            children: [{ path: 'settings.tsx', type: 'file' }],
                        },
                    ],
                },
                { path: 'manifest.ts', type: 'file' },
                { path: 'package.json', type: 'file' },
                { path: 'tsconfig.json', type: 'file' },
                { path: 'emdash.config.ts', type: 'file' },
            ],
        },
        allFiles: pluginFiles,
        language: 'typescript',
        deps: {
            '@emdash/plugin-sdk': '^1.0.0',
            'zod': '^3.23.0',
        },
        projectType: 'app',
        renderMode: 'emdash-plugin',
        initCommand: 'emdash plugin dev',
        frameworks: ['emdash', 'typescript', 'zod'],
        importantFiles: ['src/index.ts', 'manifest.ts', 'package.json'],
        dontTouchFiles: ['emdash.config.ts', 'tsconfig.json'],
        redactedFiles: [],
        disabled: false,
    };
}
