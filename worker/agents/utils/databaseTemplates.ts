/**
 * Database scaffolding templates for prompt-created applications
 * Ensures generated apps have proper D1 database setup
 */

export const DATABASE_SCHEMA_TEMPLATE = `
import { drizzle } from 'drizzle-orm/d1';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

// Example posts table (customize based on app needs)
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  authorId: text('author_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

// Database type
export type Database = typeof schema;
`;

export const DATABASE_SERVICE_TEMPLATE = `
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

export class DatabaseService {
  public readonly db: DrizzleD1Database<typeof schema>;

  constructor(env: Env) {
    this.db = drizzle(env.DB, { schema });
  }

  // User operations
  async createUser(data: { id: string; email: string; name: string }) {
    const [user] = await this.db.insert(schema.users).values({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return user;
  }

  async getUserById(id: string) {
    return await this.db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, id)
    });
  }

  async getUserByEmail(email: string) {
    return await this.db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, email)
    });
  }

  // Post operations (example)
  async createPost(data: { id: string; title: string; content: string; authorId: string }) {
    const [post] = await this.db.insert(schema.posts).values({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return post;
  }

  async getPosts() {
    return await this.db.query.posts.findMany({
      with: {
        author: true
      },
      orderBy: (posts, { desc }) => desc(posts.createdAt)
    });
  }

  async getPostById(id: string) {
    return await this.db.query.posts.findFirst({
      where: (posts, { eq }) => eq(posts.id, id),
      with: {
        author: true
      }
    });
  }
}
`;

export const API_ROUTES_TEMPLATE = `
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { DatabaseService } from '../services/database';
import type { Env } from '../types/env';

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Initialize database service
app.use('/*', async (c, next) => {
  c.set('db', new DatabaseService(c.env));
  await next();
});

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// User routes
app.get('/api/users', async (c) => {
  const db = c.get('db');
  const users = await db.db.query.users.findMany();
  return c.json(users);
});

app.post('/api/users', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  
  const user = await db.createUser({
    id: crypto.randomUUID(),
    ...body
  });
  
  return c.json(user, 201);
});

app.get('/api/users/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  
  const user = await db.getUserById(id);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }
  
  return c.json(user);
});

// Post routes (example)
app.get('/api/posts', async (c) => {
  const db = c.get('db');
  const posts = await db.getPosts();
  return c.json(posts);
});

app.post('/api/posts', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  
  const post = await db.createPost({
    id: crypto.randomUUID(),
    ...body
  });
  
  return c.json(post, 201);
});

app.get('/api/posts/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  
  const post = await db.getPostById(id);
  if (!post) {
    return c.json({ error: 'Post not found' }, 404);
  }
  
  return c.json(post);
});

export default app;
`;

export const CLIENT_API_TEMPLATE = `
// API client for frontend
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = \`\${this.baseUrl}\${endpoint}\`;
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(\`API Error: \${response.status} \${response.statusText}\`);
    }

    return response.json();
  }

  // Users
  async getUsers() {
    return this.request('/api/users');
  }

  async createUser(data: { email: string; name: string }) {
    return this.request('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getUserById(id: string) {
    return this.request(\`/api/users/\${id}\`);
  }

  // Posts
  async getPosts() {
    return this.request('/api/posts');
  }

  async createPost(data: { title: string; content: string; authorId: string }) {
    return this.request('/api/posts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getPostById(id: string) {
    return this.request(\`/api/posts/\${id}\`);
  }
}

export const apiClient = new ApiClient();
`;

export const ENHANCED_PACKAGE_JSON = {
  scripts: {
    dev: "vite --host 0.0.0.0 --port ${PORT:-8001}",
    build: "vite build",
    lint: "eslint --cache -f json --quiet .",
    preview: "bun run build && vite preview --host 0.0.0.0 --port ${PORT:-8001}",
    deploy: "bun run build && wrangler deploy",
    "cf-typegen": "wrangler types",
    "db:generate": "wrangler d1 migrations apply <database-name> --remote",
    "db:local": "wrangler d1 migrations apply <database-name> --local"
  },
  dependencies: {
    "drizzle-orm": "^0.44.7",
    "hono": "^4.11.0"
  },
  devDependencies: {
    "@types/bun": "^1.0.0",
    "drizzle-kit": "^0.31.8",
    "wrangler": "^4.50.0"
  }
};

export const WRANGLER_CONFIG_TEMPLATE = `
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "<app-name>",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-15",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "dist",
    "not_found_handling": "single-page-application",
    "run_worker_first": true,
    "binding": "ASSETS"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "<app-name>-db",
      "database_id": "<generate-database-id>",
      "migrations_dir": "migrations",
      "remote": true
    }
  ],
  "vars": {
    "ENVIRONMENT": "production"
  },
  "workers_dev": false,
  "preview_urls": false
}
`;

export const MIGRATION_TEMPLATE = `
-- Migration for initial database setup
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (author_id) REFERENCES users (id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
`;
