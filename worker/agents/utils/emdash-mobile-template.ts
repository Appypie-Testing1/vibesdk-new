import type { TemplateDetails } from '../../services/sandbox/sandboxTypes';

const EMDASH_MOBILE_TEMPLATE_INSTRUCTIONS = `
To build a valid Expo mobile app consuming EmDash Content API, follow these rules:

1. ALL data fetching MUST use \`emdashClient\` from \`lib/emdash-client.ts\`:
   \`\`\`typescript
   import { emdashClient } from '../lib/emdash-client';

   // Fetch collection (list of documents)
   const posts = await emdashClient.getCollection('posts');

   // Fetch single document
   const post = await emdashClient.getDocument('posts', postId);

   // Search content
   const results = await emdashClient.search('posts', { query: 'search term' });

   // Get media URL
   const imageUrl = emdashClient.getMediaUrl(mediaRef);
   \`\`\`

   NEVER use raw fetch(), axios, or custom HTTP wrappers. The emdashClient handles authentication, base URL resolution, and error handling for all platforms (web, Expo Go, standalone APK/IPA).

2. **Portable Text Rendering** for rich content:
   \`\`\`typescript
   import { PortableTextRenderer } from '../lib/portable-text-renderer';

   <PortableTextRenderer value={post.body} />
   \`\`\`

3. **React Native Components ONLY:**
   - View, Text, TouchableOpacity, Pressable, ScrollView, FlatList, TextInput, Image, etc.
   - All styling via StyleSheet.create()
   - NO Tailwind, NO className, NO HTML elements

4. **Expo Router** for navigation:
   - File-based routing in the \`app/\` directory
   - Dynamic routes: \`app/[contentType]/index.tsx\`, \`app/[contentType]/[id].tsx\`

5. **Content Types from EmDash:**
   - The blueprint defines content types available from the EmDash instance
   - Each content type becomes a screen/list in the app
   - Use \`emdashClient.getSchema()\` to discover fields dynamically if needed

6. **Media URLs:**
   - Always use \`emdashClient.getMediaUrl(mediaRef)\` for images
   - Pass the result to Image source: \`<Image source={{ uri: emdashClient.getMediaUrl(ref) }} />\`

7. **Pre-configured files (DO NOT modify):**
   - app.json (contains extra.emdashApiUrl and extra.emdashApiKey)
   - metro.config.js
   - _expo-proxy.cjs
   - lib/emdash-client.ts

8. **Icons:** Use emoji or Unicode symbols in Text components. Do NOT install icon libraries.
`;

/**
 * EmDash mobile template for Expo apps consuming EmDash Content API.
 * Used when the user wants to build a mobile app backed by EmDash CMS.
 */
export function createEmdashMobileTemplateDetails(): TemplateDetails {
    const mobileFiles: Record<string, string> = {
        'lib/emdash-client.ts': `import Constants from 'expo-constants';

interface EmDashClientConfig {
  apiUrl: string;
  apiKey?: string;
}

interface QueryOptions {
  query?: string;
  filter?: Record<string, unknown>;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

function getConfig(): EmDashClientConfig {
  const extra = Constants.expoConfig?.extra;
  return {
    apiUrl: extra?.emdashApiUrl || 'https://api.emdash.dev',
    apiKey: extra?.emdashApiKey,
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const config = getConfig();
  const url = \`\${config.apiUrl}\${path}\`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(config.apiKey ? { 'Authorization': \`Bearer \${config.apiKey}\` } : {}),
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { ...options, headers: { ...headers, ...options?.headers } });
      if (!res.ok) {
        throw new Error(\`EmDash API error: \${res.status} \${res.statusText}\`);
      }
      return await res.json() as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export const emdashClient = {
  /** Fetch all documents from a collection */
  async getCollection<T = Record<string, unknown>>(
    collection: string,
    options?: QueryOptions,
  ): Promise<T[]> {
    const params = new URLSearchParams();
    if (options?.query) params.set('q', options.query);
    if (options?.sort) params.set('sort', options.sort);
    if (options?.order) params.set('order', options.order);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const qs = params.toString();
    const path = \`/api/content/\${collection}\${qs ? '?' + qs : ''}\`;
    const data = await request<{ documents: T[] }>(path);
    return data.documents;
  },

  /** Fetch a single document by ID */
  async getDocument<T = Record<string, unknown>>(
    collection: string,
    documentId: string,
  ): Promise<T> {
    return request<T>(\`/api/content/\${collection}/\${documentId}\`);
  },

  /** Search within a collection */
  async search<T = Record<string, unknown>>(
    collection: string,
    options: { query: string; limit?: number },
  ): Promise<T[]> {
    const params = new URLSearchParams({ q: options.query });
    if (options.limit) params.set('limit', String(options.limit));
    const data = await request<{ documents: T[] }>(
      \`/api/content/\${collection}/search?\${params}\`,
    );
    return data.documents;
  },

  /** Get content schema (available collections and fields) */
  async getSchema(): Promise<Record<string, { fields: Record<string, unknown> }>> {
    return request('/api/schema');
  },

  /** Get taxonomies */
  async getTaxonomies(): Promise<Array<{ name: string; slug: string; terms: string[] }>> {
    const data = await request<{ taxonomies: Array<{ name: string; slug: string; terms: string[] }> }>(
      '/api/taxonomies',
    );
    return data.taxonomies;
  },

  /** Get navigation menus */
  async getMenus(): Promise<Record<string, Array<{ label: string; href: string }>>> {
    return request('/api/menus');
  },

  /** Construct a full media URL from a media reference */
  getMediaUrl(mediaRef: string | { _ref?: string; url?: string } | null | undefined): string {
    if (!mediaRef) return 'https://placehold.co/400x300?text=No+Image';
    const config = getConfig();
    if (typeof mediaRef === 'string') {
      if (mediaRef.startsWith('http')) return mediaRef;
      return \`\${config.apiUrl}/api/media/\${mediaRef}\`;
    }
    if (mediaRef.url) return mediaRef.url;
    if (mediaRef._ref) return \`\${config.apiUrl}/api/media/\${mediaRef._ref}\`;
    return 'https://placehold.co/400x300?text=No+Image';
  },

  /** Create a new document */
  async createDocument<T = Record<string, unknown>>(
    collection: string,
    data: Record<string, unknown>,
  ): Promise<T> {
    return request<T>(\`/api/content/\${collection}\`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Update a document */
  async updateDocument<T = Record<string, unknown>>(
    collection: string,
    documentId: string,
    data: Record<string, unknown>,
  ): Promise<T> {
    return request<T>(\`/api/content/\${collection}/\${documentId}\`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /** Delete a document */
  async deleteDocument(collection: string, documentId: string): Promise<void> {
    await request(\`/api/content/\${collection}/\${documentId}\`, {
      method: 'DELETE',
    });
  },
};
`,
        'lib/portable-text-renderer.tsx': `import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

interface Block {
  _type: string;
  _key?: string;
  style?: string;
  children?: Span[];
  asset?: { _ref?: string; url?: string };
  alt?: string;
  listItem?: string;
  level?: number;
}

interface Span {
  _type: string;
  _key?: string;
  text?: string;
  marks?: string[];
}

interface PortableTextRendererProps {
  value: Block[] | null | undefined;
}

function renderSpan(span: Span, index: number): React.ReactNode {
  if (!span.text) return null;
  const isBold = span.marks?.includes('strong') ?? false;
  const isItalic = span.marks?.includes('em') ?? false;
  return (
    <Text
      key={span._key || index}
      style={[
        isBold && styles.bold,
        isItalic && styles.italic,
      ]}
    >
      {span.text}
    </Text>
  );
}

function renderBlock(block: Block, index: number): React.ReactNode {
  if (block._type === 'image') {
    const uri = block.asset?.url || block.asset?._ref || '';
    return (
      <Image
        key={block._key || index}
        source={{ uri: uri.startsWith('http') ? uri : 'https://placehold.co/400x300' }}
        style={styles.image}
        resizeMode="cover"
      />
    );
  }

  if (block._type !== 'block') return null;

  const textStyle = getStyleForBlock(block.style);
  const children = block.children?.map((child, i) => renderSpan(child, i)) ?? [];

  if (block.listItem) {
    const bullet = block.listItem === 'number' ? \`\${index + 1}. \` : '  \\u2022  ';
    return (
      <View key={block._key || index} style={styles.listItem}>
        <Text style={styles.bullet}>{bullet}</Text>
        <Text style={[styles.body, textStyle, { flex: 1 }]}>{children}</Text>
      </View>
    );
  }

  return (
    <Text key={block._key || index} style={[styles.body, textStyle, styles.paragraph]}>
      {children}
    </Text>
  );
}

function getStyleForBlock(style?: string) {
  switch (style) {
    case 'h1': return styles.h1;
    case 'h2': return styles.h2;
    case 'h3': return styles.h3;
    case 'h4': return styles.h4;
    case 'blockquote': return styles.blockquote;
    default: return null;
  }
}

export function PortableTextRenderer({ value }: PortableTextRendererProps) {
  if (!value || !Array.isArray(value)) return null;
  return (
    <View style={styles.container}>
      {value.map((block, index) => renderBlock(block, index))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  body: { fontSize: 16, lineHeight: 24, color: '#333' },
  paragraph: { marginBottom: 8 },
  h1: { fontSize: 28, fontWeight: '700', color: '#111', marginBottom: 12, marginTop: 16 },
  h2: { fontSize: 24, fontWeight: '600', color: '#111', marginBottom: 10, marginTop: 14 },
  h3: { fontSize: 20, fontWeight: '600', color: '#222', marginBottom: 8, marginTop: 12 },
  h4: { fontSize: 18, fontWeight: '600', color: '#222', marginBottom: 6, marginTop: 10 },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: '#ddd',
    paddingLeft: 12,
    fontStyle: 'italic',
    color: '#666',
  },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  image: { width: '100%', height: 200, borderRadius: 8, marginVertical: 12 },
  listItem: { flexDirection: 'row', paddingLeft: 8, marginBottom: 4 },
  bullet: { fontSize: 16, color: '#666', width: 24 },
});
`,
        'app/_layout.tsx': `import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#f8f9fa' },
        headerTintColor: '#111',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Home' }} />
    </Stack>
  );
}
`,
        'app/index.tsx': `import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { emdashClient } from '../lib/emdash-client';

interface Post {
  _id: string;
  title: string;
  excerpt?: string;
  coverImage?: string | { _ref?: string; url?: string };
  slug?: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    emdashClient.getCollection<Post>('posts', { limit: 20 })
      .then(setPosts)
      .catch((err) => console.error('Failed to load posts:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => item._id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push({ pathname: '/[contentType]/[id]', params: { contentType: 'posts', id: item._id } })}
        >
          {item.coverImage && (
            <Image
              source={{ uri: emdashClient.getMediaUrl(item.coverImage) }}
              style={styles.cardImage}
            />
          )}
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            {item.excerpt && <Text style={styles.cardExcerpt} numberOfLines={2}>{item.excerpt}</Text>}
          </View>
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>No content available</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardImage: { width: '100%', height: 180 },
  cardBody: { padding: 16 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#111', marginBottom: 4 },
  cardExcerpt: { fontSize: 14, color: '#666', lineHeight: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 16, color: '#999' },
});
`,
        'app/[contentType]/index.tsx': `import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { emdashClient } from '../../lib/emdash-client';

interface Document {
  _id: string;
  title?: string;
  name?: string;
  excerpt?: string;
  coverImage?: string | { _ref?: string; url?: string };
}

export default function ContentListScreen() {
  const { contentType } = useLocalSearchParams<{ contentType: string }>();
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contentType) return;
    emdashClient.getCollection<Document>(contentType, { limit: 50 })
      .then(setDocuments)
      .catch((err) => console.error(\`Failed to load \${contentType}:\`, err))
      .finally(() => setLoading(false));
  }, [contentType]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <FlatList
      data={documents}
      keyExtractor={(item) => item._id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push({ pathname: '/[contentType]/[id]', params: { contentType: contentType!, id: item._id } })}
        >
          {item.coverImage && (
            <Image
              source={{ uri: emdashClient.getMediaUrl(item.coverImage) }}
              style={styles.thumbnail}
            />
          )}
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{item.title || item.name || 'Untitled'}</Text>
            {item.excerpt && <Text style={styles.cardExcerpt} numberOfLines={2}>{item.excerpt}</Text>}
          </View>
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>No {contentType} found</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  thumbnail: { width: 100, height: 100 },
  cardText: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 4 },
  cardExcerpt: { fontSize: 13, color: '#666', lineHeight: 18 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 16, color: '#999' },
});
`,
        'app/[contentType]/[id].tsx': `import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { emdashClient } from '../../lib/emdash-client';
import { PortableTextRenderer } from '../../lib/portable-text-renderer';

interface ContentDocument {
  _id: string;
  title?: string;
  name?: string;
  body?: Array<Record<string, unknown>>;
  coverImage?: string | { _ref?: string; url?: string };
  excerpt?: string;
  publishedAt?: string;
  author?: { name: string; avatar?: string | null };
  [key: string]: unknown;
}

export default function ContentDetailScreen() {
  const { contentType, id } = useLocalSearchParams<{ contentType: string; id: string }>();
  const [document, setDocument] = useState<ContentDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contentType || !id) return;
    emdashClient.getDocument<ContentDocument>(contentType, id)
      .then(setDocument)
      .catch((err) => console.error(\`Failed to load document:\`, err))
      .finally(() => setLoading(false));
  }, [contentType, id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!document) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Document not found</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {document.coverImage && (
        <Image
          source={{ uri: emdashClient.getMediaUrl(document.coverImage) }}
          style={styles.heroImage}
        />
      )}
      <View style={styles.body}>
        <Text style={styles.title}>{document.title || document.name || 'Untitled'}</Text>
        {document.publishedAt && (
          <Text style={styles.meta}>
            {new Date(document.publishedAt).toLocaleDateString()}
            {document.author?.name ? \` by \${document.author.name}\` : ''}
          </Text>
        )}
        {document.excerpt && <Text style={styles.excerpt}>{document.excerpt}</Text>}
        {document.body && <PortableTextRenderer value={document.body} />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  heroImage: { width: '100%', height: 240 },
  body: { padding: 16 },
  title: { fontSize: 26, fontWeight: '700', color: '#111', marginBottom: 8 },
  meta: { fontSize: 13, color: '#888', marginBottom: 12 },
  excerpt: { fontSize: 16, color: '#555', lineHeight: 24, marginBottom: 16, fontStyle: 'italic' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { fontSize: 16, color: '#e11d48' },
});
`,
        'app.json': JSON.stringify({
            expo: {
                name: 'EmDash Mobile',
                slug: 'emdash-mobile',
                version: '1.0.0',
                orientation: 'portrait',
                scheme: 'emdash-mobile',
                web: { bundler: 'metro' },
                plugins: ['expo-router'],
                extra: {
                    emdashApiUrl: 'https://api.emdash.dev',
                    emdashApiKey: '',
                },
            },
        }, null, 2),
        'metro.config.js': `const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Required for React 19 compatibility
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
`,
        'package.json': JSON.stringify({
            name: 'emdash-mobile',
            version: '1.0.0',
            main: 'expo-router/entry',
            scripts: {
                dev: 'node _expo-proxy.cjs',
                'build:web': 'bun x expo export --platform web --output-dir dist/client',
                lint: 'eslint --cache -f json --quiet .',
            },
            dependencies: {
                'expo': '~54.0.0',
                'expo-constants': '~17.1.0',
                'expo-font': '~13.3.0',
                'expo-linking': '~7.1.0',
                'expo-router': '~6.0.14',
                'expo-status-bar': '~2.2.0',
                'expo-system-ui': '~5.0.0',
                'react': '19.0.0',
                'react-dom': '19.0.0',
                'react-native': '0.81.5',
                'react-native-gesture-handler': '~2.28.0',
                'react-native-reanimated': '~4.1.0',
                'react-native-safe-area-context': '5.4.0',
                'react-native-screens': '~4.10.0',
                'react-native-web': '~0.19.13',
                '@react-native-async-storage/async-storage': '1.23.1',
            },
            devDependencies: {
                'typescript': '^5.5.0',
                '@types/react': '^19.0.0',
            },
        }, null, 2),
        'tsconfig.json': JSON.stringify({
            extends: 'expo/tsconfig.base',
            compilerOptions: {
                strict: true,
                paths: { '~/*': ['./*'] },
            },
        }, null, 2),
    };

    return {
        name: 'emdash-mobile',
        description: {
            selection: 'emdash-mobile-template',
            usage: `EmDash CMS mobile app template using Expo/React Native with EmDash Content API client, Portable Text renderer, and dynamic content screens. ${EMDASH_MOBILE_TEMPLATE_INSTRUCTIONS}`,
        },
        fileTree: {
            path: '/',
            type: 'directory',
            children: [
                {
                    path: 'app',
                    type: 'directory',
                    children: [
                        { path: '_layout.tsx', type: 'file' },
                        { path: 'index.tsx', type: 'file' },
                        {
                            path: '[contentType]',
                            type: 'directory',
                            children: [
                                { path: 'index.tsx', type: 'file' },
                                { path: '[id].tsx', type: 'file' },
                            ],
                        },
                    ],
                },
                {
                    path: 'lib',
                    type: 'directory',
                    children: [
                        { path: 'emdash-client.ts', type: 'file' },
                        { path: 'portable-text-renderer.tsx', type: 'file' },
                    ],
                },
                { path: 'package.json', type: 'file' },
                { path: 'app.json', type: 'file' },
                { path: 'tsconfig.json', type: 'file' },
                { path: 'metro.config.js', type: 'file' },
            ],
        },
        allFiles: mobileFiles,
        language: 'typescript',
        deps: {
            'expo': '~54.0.0',
            'react-native': '0.81.5',
            'react-native-gesture-handler': '~2.28.0',
            'react-native-reanimated': '~4.1.0',
            'expo-router': '~6.0.14',
        },
        projectType: 'app',
        renderMode: 'mobile',
        initCommand: 'node _expo-proxy.cjs',
        frameworks: ['react-native', 'expo', 'expo-router', 'emdash'],
        importantFiles: ['app/index.tsx', 'app/_layout.tsx', 'lib/emdash-client.ts', 'package.json'],
        dontTouchFiles: ['app.json', 'metro.config.js', 'tsconfig.json', 'lib/emdash-client.ts', 'lib/portable-text-renderer.tsx'],
        redactedFiles: [],
        disabled: false,
    };
}
