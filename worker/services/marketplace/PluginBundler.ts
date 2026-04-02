/**
 * PluginBundler
 * Bundles agent-generated plugin files into R2 storage for marketplace distribution.
 */

import { createLogger, StructuredLogger } from '../../logger';

export interface BundleResult {
    r2Key: string;
    sizeBytes: number;
    fileCount: number;
}

export class PluginBundler {
    private logger: StructuredLogger;
    private bucket: R2Bucket;

    constructor(bucket: R2Bucket) {
        this.logger = createLogger('PluginBundler');
        this.bucket = bucket;
    }

    /**
     * Bundle plugin files from agent state into a zip archive stored in R2.
     * Uses a simple tar-like format (JSON manifest + concatenated files) since
     * Workers don't have native zip support without importing a library.
     *
     * @param pluginId Marketplace plugin ID
     * @param files Map of relative path -> file content
     * @param manifest The plugin manifest JSON
     * @returns BundleResult with R2 key and metadata
     */
    async bundle(
        pluginId: string,
        files: Map<string, string>,
        manifest: Record<string, unknown>,
    ): Promise<BundleResult> {
        const r2Key = `marketplace-plugins/${pluginId}/${Date.now()}.bundle.json`;

        // Create a JSON bundle with manifest and all files
        const bundle = {
            format: 'vibesdk-plugin-bundle-v1',
            pluginId,
            manifest,
            files: Object.fromEntries(files),
            createdAt: new Date().toISOString(),
        };

        const bundleJson = JSON.stringify(bundle);
        const encoder = new TextEncoder();
        const bundleBytes = encoder.encode(bundleJson);

        await this.bucket.put(r2Key, bundleBytes, {
            httpMetadata: {
                contentType: 'application/json',
            },
            customMetadata: {
                pluginId,
                fileCount: String(files.size),
            },
        });

        this.logger.info('Plugin bundled to R2', {
            pluginId,
            r2Key,
            sizeBytes: bundleBytes.length,
            fileCount: files.size,
        });

        return {
            r2Key,
            sizeBytes: bundleBytes.length,
            fileCount: files.size,
        };
    }

    /**
     * Retrieve a bundled plugin from R2
     */
    async retrieve(r2Key: string): Promise<{
        manifest: Record<string, unknown>;
        files: Record<string, string>;
    } | null> {
        const object = await this.bucket.get(r2Key);
        if (!object) return null;

        const text = await object.text();
        const bundle = JSON.parse(text);

        return {
            manifest: bundle.manifest,
            files: bundle.files,
        };
    }

    /**
     * Delete a plugin bundle from R2
     */
    async delete(r2Key: string): Promise<void> {
        await this.bucket.delete(r2Key);
        this.logger.info('Plugin bundle deleted', { r2Key });
    }
}
