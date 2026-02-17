/**
 * Enhanced Template Builder
 * Combines database, routing, and API scaffolding for complete prompt-created applications
 */

import { TemplateDetails } from '../../services/sandbox/sandboxTypes';
import { 
  DATABASE_SCHEMA_TEMPLATE, 
  DATABASE_SERVICE_TEMPLATE, 
  API_ROUTES_TEMPLATE, 
  CLIENT_API_TEMPLATE,
  ENHANCED_PACKAGE_JSON,
  WRANGLER_CONFIG_TEMPLATE,
  MIGRATION_TEMPLATE
} from './databaseTemplates';
import {
  REACT_ROUTER_SETUP,
  LAYOUT_COMPONENT,
  PAGES_TEMPLATES,
  NAVIGATION_HOOKS,
  ENHANCED_VITE_CONFIG,
  ENVIRONMENT_SETUP
} from './routingTemplates';

export interface EnhancedTemplateOptions {
  includeDatabase: boolean;
  includeRouting: boolean;
  includeApi: boolean;
  appName: string;
  description: string;
}

export function createEnhancedTemplate(options: EnhancedTemplateOptions): TemplateDetails {
  const { includeDatabase, includeRouting, includeApi, appName, description } = options;
  
  const files: Record<string, string> = {};
  const dependencies: Record<string, string> = {};

  // Base files
  files['src/index.ts'] = `
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/cloudflare-workers';
${includeDatabase ? `import apiRoutes from './routes/api';` : ''}

const app = new Hono();

// CORS middleware
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/health', (c) => {
  return c.json({ 
    status: 'ok', 
    app: '${appName}',
    timestamp: new Date().toISOString() 
  });
});

${includeDatabase ? `
// API routes
app.route('/', apiRoutes);
` : ''}

// Serve static files
app.use('/*', serveStatic({ root: './dist' }));

// Fallback to index.html for SPA routing
app.get('*', (c) => {
  return c.html(c.env.ASSETS.fetch(new Request('http://localhost/index.html')));
});

export default app;
`;

  files['src/main.tsx'] = `
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;

  files['src/App.tsx'] = includeRouting ? REACT_ROUTER_SETUP : `
import { useState, useEffect } from 'react';

function App() {
  const [message, setMessage] = useState('Loading...');

  useEffect(() => {
    fetch('/health')
      .then(res => res.json())
      .then(data => setMessage(data.status))
      .catch(() => setMessage('Error'));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">${appName}</h1>
        <p className="text-xl text-gray-600 mb-2">${description}</p>
        <p className="text-sm text-gray-500">API Status: {message}</p>
      </div>
    </div>
  );
}

export default App;
`;

  files['src/index.css'] = `
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96%;
    --secondary-foreground: 222.2 84% 4.9%;
    --muted: 210 40% 96%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96%;
    --accent-foreground: 222.2 84% 4.9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 84% 4.9%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 94.1%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`;

  files['tailwind.config.js'] = `
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
`;

  files['vite.config.ts'] = ENHANCED_VITE_CONFIG;

  // Add routing components
  if (includeRouting) {
    files['src/components/Layout.tsx'] = LAYOUT_COMPONENT;
    files['src/pages/HomePage.tsx'] = PAGES_TEMPLATES.split('// src/pages/AboutPage.tsx')[0].replace('// src/pages/HomePage.tsx', '');
    files['src/pages/AboutPage.tsx'] = PAGES_TEMPLATES.split('// src/pages/AboutPage.tsx')[1].split('// src/pages/NotFoundPage.tsx')[0];
    files['src/pages/NotFoundPage.tsx'] = PAGES_TEMPLATES.split('// src/pages/NotFoundPage.tsx')[1];
    files['src/hooks/useNavigation.ts'] = NAVIGATION_HOOKS.split('// src/hooks/useApi.ts')[0].replace('// src/hooks/useNavigation.ts', '');
    files['src/hooks/useApi.ts'] = NAVIGATION_HOOKS.split('// src/hooks/useApi.ts')[1];
    
    dependencies['react-router-dom'] = '^6.8.0';
  }

  // Add database components
  if (includeDatabase) {
    files['src/db/schema.ts'] = DATABASE_SCHEMA_TEMPLATE;
    files['src/services/database.ts'] = DATABASE_SERVICE_TEMPLATE;
    files['migrations/0001_initial.sql'] = MIGRATION_TEMPLATE;
    
    dependencies['drizzle-orm'] = '^0.44.7';
    dependencies['hono'] = '^4.11.0';
  }

  // Add API routes
  if (includeApi) {
    files['src/routes/api.ts'] = API_ROUTES_TEMPLATE;
    files['src/lib/api.ts'] = CLIENT_API_TEMPLATE;
    files['src/types/env.ts'] = `
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}
`;
  }

  // Package.json
  files['package.json'] = JSON.stringify({
    name: appName.toLowerCase().replace(/\s+/g, '-'),
    version: '1.0.0',
    type: 'module',
    scripts: ENHANCED_PACKAGE_JSON.scripts,
    dependencies: {
      'react': '^19.0.0',
      'react-dom': '^19.0.0',
      'typescript': '^5.0.0',
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
      'tailwindcss': '^4.1.18',
      '@tailwindcss/vite': '^4.1.18',
      'tailwindcss-animate': '^1.0.7',
      'class-variance-authority': '^0.7.0',
      'clsx': '^2.0.0',
      'tailwind-merge': '^3.4.0',
      'lucide-react': '^0.541.0',
      ...dependencies
    },
    devDependencies: {
      '@cloudflare/vite-plugin': '^1.17.1',
      '@cloudflare/workers-types': '^4.20251213.0',
      'drizzle-kit': '^0.31.8',
      'wrangler': '^4.50.0',
      'vite': 'npm:rolldown-vite@latest',
      'eslint': '^9.39.0',
      'typescript-eslint': '^8.49.0'
    }
  }, null, 2);

  // Wrangler config
  files['wrangler.jsonc'] = WRANGLER_CONFIG_TEMPLATE.replace(/<app-name>/g, appName.toLowerCase().replace(/\s+/g, '-'));

  // Environment setup
  files['.env.example'] = ENVIRONMENT_SETUP;

  // README
  files['README.md'] = `
# ${appName}

${description}

## Features

${includeDatabase ? '- 🗄️ Database integration with Cloudflare D1' : ''}
${includeRouting ? '- 🧭 Client-side routing with React Router' : ''}
${includeApi ? '- 🚀 RESTful API endpoints' : ''}
- 🎨 Modern UI with Tailwind CSS
- ⚡ Deployed on Cloudflare Workers
- 🔒 Type-safe with TypeScript

## Development

1. Install dependencies:
   \`\`\`bash
   bun install
   \`\`\`

2. Start development server:
   \`\`\`bash
   bun run dev
   \`\`\`

3. Build for production:
   \`\`\`bash
   bun run build
   \`\`\`

4. Deploy to Cloudflare:
   \`\`\`bash
   bun run deploy
   \`\`\`

${includeDatabase ? `
## Database Setup

1. Create D1 database:
   \`\`\`bash
   wrangler d1 create ${appName.toLowerCase().replace(/\s+/g, '-')}-db
   \`\`\`

2. Update wrangler.jsonc with your database ID

3. Run migrations:
   \`\`\`bash
   bun run db:generate
   \`\`\`
` : ''}

## API Endpoints

${includeApi ? `
- \`GET /health\` - Health check
- \`GET /api/users\` - List users
- \`POST /api/users\` - Create user
- \`GET /api/posts\` - List posts
- \`POST /api/posts\` - Create post
` : '- \`GET /health\` - Health check'}

## License

MIT
`;

  return {
    name: 'enhanced-fullstack',
    description: { 
      selection: 'Enhanced Full-Stack Template', 
      usage: `Complete full-stack application with database, routing, and API. Includes: ${includeDatabase ? 'D1 database, ' : ''}${includeRouting ? 'React Router, ' : ''}${includeApi ? 'REST API, ' : ''}modern UI, and deployment setup.` 
    },
    fileTree: { 
      path: '/', 
      type: 'directory', 
      children: [
        { path: 'src', type: 'directory', children: [] },
        { path: 'migrations', type: 'directory', children: [] },
        { path: 'package.json', type: 'file' },
        { path: 'wrangler.jsonc', type: 'file' },
        { path: 'vite.config.ts', type: 'file' },
        { path: 'tailwind.config.js', type: 'file' },
        { path: 'README.md', type: 'file' },
        { path: '.env.example', type: 'file' }
      ]
    },
    allFiles: files,
    language: 'typescript',
    deps: dependencies,
    projectType: 'app',
    frameworks: ['react', 'typescript', 'tailwindcss', ...(includeDatabase ? ['drizzle'] : []), ...(includeRouting ? ['react-router'] : [])],
    importantFiles: ['src/App.tsx', 'src/index.ts', 'package.json', 'wrangler.jsonc'],
    dontTouchFiles: ['wrangler.jsonc', 'migrations'],
    redactedFiles: [],
    disabled: false,
  };
}
