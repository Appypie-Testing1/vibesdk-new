/**
 * Routing and navigation templates for prompt-created applications
 * Ensures generated apps have proper URL navigation and routing setup
 */

export const REACT_ROUTER_SETUP = `
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { AboutPage } from './pages/AboutPage';
import { NotFoundPage } from './pages/NotFoundPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
`;

export const LAYOUT_COMPONENT = `
import { Outlet, Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';

export function Layout() {
  const location = useLocation();
  
  const navigation = [
    { name: 'Home', href: '/' },
    { name: 'About', href: '/about' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Header */}
      <header className="border-b">
        <nav className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="text-xl font-bold">
              Your App
            </Link>
            
            <ul className="flex space-x-6">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    className={cn(
                      "text-sm font-medium transition-colors hover:text-primary",
                      location.pathname === item.href
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="container mx-auto px-4 py-6">
          <p className="text-center text-sm text-muted-foreground">
            © 2025 Your App. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
`;

export const PAGES_TEMPLATES = `
// src/pages/HomePage.tsx
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

export function HomePage() {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <section className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          Welcome to Your App
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          This is a modern web application built with React, TypeScript, and Cloudflare Workers.
        </p>
        <div className="flex gap-4 justify-center">
          <Button asChild>
            <Link to="/about">Learn More</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/api/health">Check API</Link>
          </Button>
        </div>
      </section>

      {/* Features Section */}
      <section className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>🚀 Fast Performance</CardTitle>
            <CardDescription>
              Built on Cloudflare's global network for lightning-fast response times.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your application is deployed across 200+ cities worldwide.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>🛡️ Secure by Default</CardDescription>
            <CardDescription>
              Enterprise-grade security with DDoS protection and SSL certificates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your data is protected with industry-standard encryption.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>📊 Real-time Database</CardTitle>
            <CardDescription>
              Powered by Cloudflare D1 for global data replication.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your data is automatically synced across the globe.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

// src/pages/AboutPage.tsx
export function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-4">About This Application</h1>
        <p className="text-lg text-muted-foreground">
          This is a full-stack web application demonstrating modern web development practices.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-2xl font-semibold mb-4">Technology Stack</h2>
          <ul className="space-y-2 text-muted-foreground">
            <li>• React 19 with TypeScript</li>
            <li>• Tailwind CSS for styling</li>
            <li>• Cloudflare Workers for backend</li>
            <li>• Cloudflare D1 for database</li>
            <li>• Hono for API routes</li>
            <li>• Drizzle ORM for database operations</li>
          </ul>
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-4">Features</h2>
          <ul className="space-y-2 text-muted-foreground">
            <li>• Responsive design for all devices</li>
            <li>• Real-time data synchronization</li>
            <li>• Global CDN deployment</li>
            <li>• Type-safe API endpoints</li>
            <li>• Modern development workflow</li>
            <li>• Zero-config deployment</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// src/pages/NotFoundPage.tsx
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';

export function NotFoundPage() {
  return (
    <div className="text-center space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold">404</h1>
        <h2 className="text-2xl font-semibold">Page Not Found</h2>
        <p className="text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>
      
      <Button asChild>
        <Link to="/">Go Home</Link>
      </Button>
    </div>
  );
}
`;

export const NAVIGATION_HOOKS = `
// src/hooks/useNavigation.ts
import { useLocation, useNavigate } from 'react-router-dom';

export function useNavigation() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const goTo = (path: string) => {
    navigate(path);
  };

  const goBack = () => {
    navigate(-1);
  };

  const goForward = () => {
    navigate(1);
  };

  return {
    currentPath: location.pathname,
    isActive,
    goTo,
    goBack,
    goForward,
  };
}

// src/hooks/useApi.ts
import { useState, useEffect } from 'react';
import { apiClient } from '../lib/api';

export function useApi<T>(
  apiCall: () => Promise<T>,
  dependencies: any[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await apiCall();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, dependencies);

  return { data, loading, error, refetch: () => fetchData() };
}
`;

export const ENHANCED_VITE_CONFIG = `
import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default ({ mode }: { mode: string }) => {
  const env = loadEnv(mode, process.cwd());
  
  return defineConfig({
    plugins: [react(), cloudflare()],
    build: {
      minify: true,
      sourcemap: "inline",
      rollupOptions: {
        output: {
          sourcemapExcludeSources: false,
        },
      },
    },
    css: {
      devSourcemap: true,
    },
    server: {
      allowedHosts: true,
      strictPort: true,
      port: 8001,
      host: true,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@shared": path.resolve(__dirname, "./shared"),
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-router-dom"],
      exclude: ["agents"],
      force: true,
    },
    define: {
      global: "globalThis",
      // Pass environment variables to client
      VITE_API_URL: JSON.stringify(env.VITE_API_URL || ''),
    },
  });
};
`;

export const ENVIRONMENT_SETUP = `
# Environment Variables for Development

# API Configuration
VITE_API_URL=http://localhost:8001

# Database (D1)
# These are automatically set by Cloudflare Workers
# DB=<your-d1-binding>

# Optional: Feature flags
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_DEBUG=true
`;
