/**
 * Pure sanitization functions for deployment files.
 * Extracted from DeploymentManager -- no dependencies on agent state.
 */

/**
 * Sanitize worker entry point to remove patterns that break Hono's router on deployed apps
 * and inject safety measures for common runtime issues.
 *
 * 1. Removes: serveStatic imports/usage, wildcard SPA fallback routes.
 * 2. Replaces: default Hono SmartRouter with LinearRouter (prevents "matcher already built" error).
 * 3. Injects: global error handler (app.onError) if missing.
 */
export function sanitizeWorkerEntryPoint(contents: string): string {
    let result = contents;

    // Remove serveStatic import line
    result = result.replace(/^import\s*\{[^}]*serveStatic[^}]*\}\s*from\s*['"]hono\/cloudflare-workers['"];?\s*$/gm, '');

    // Remove app.use('/*', serveStatic(...)) or app.use('*', serveStatic(...))
    result = result.replace(/^\s*app\.use\(\s*['"][/*]*['"]\s*,\s*serveStatic\([^)]*\)\s*\);?\s*$/gm, '');

    // Remove wildcard SPA fallback: app.get('*', ...) that references ASSETS or index.html
    result = result.replace(/^\s*app\.get\(\s*['"][*]['"][\s\S]*?(?:ASSETS|index\.html)[\s\S]*?\}\s*\)\s*;?\s*$/gm, '');

    // Replace default Hono SmartRouter with LinearRouter.
    // SmartRouter freezes after first match() call, causing "Can not add a route since
    // the matcher is already built" when @cloudflare/vite-plugin triggers HMR re-evaluation.
    // LinearRouter never freezes and can accept routes at any time.
    if (!result.includes('LinearRouter')) {
        // Add LinearRouter import if not present
        const honoImportMatch = result.match(/^(import\s*\{[^}]*\}\s*from\s*['"]hono['"];?\s*)$/m);
        if (honoImportMatch) {
            result = result.replace(
                honoImportMatch[0],
                honoImportMatch[0] + "import { LinearRouter } from 'hono/router/linear-router';\n"
            );
        } else {
            // Hono imported differently (e.g., import { Hono } from 'hono'), prepend LinearRouter import
            const anyHonoImport = result.match(/^(import\s+.*from\s*['"]hono['"];?\s*)$/m);
            if (anyHonoImport) {
                result = result.replace(
                    anyHonoImport[0],
                    anyHonoImport[0] + "import { LinearRouter } from 'hono/router/linear-router';\n"
                );
            }
        }

        // Replace `new Hono()` or `new Hono<...>()` with LinearRouter version
        result = result.replace(
            /new\s+Hono\s*(<[^>]*>)?\s*\(\s*\)/g,
            'new Hono$1({ router: new LinearRouter() })'
        );
        // Handle `new Hono({ ...existingOptions })` -- inject router if not already there
        result = result.replace(
            /new\s+Hono\s*(<[^>]*>)?\s*\(\s*\{(?![\s\S]*router\s*:)([\s\S]*?)\}\s*\)/g,
            'new Hono$1({ router: new LinearRouter(), $2})'
        );
    }

    // Inject global error handler if missing -- prevents unhandled exceptions from
    // returning opaque 500s with no JSON body
    if (!result.includes('.onError(') && !result.includes('.onError (')) {
        const honoInitMatch = result.match(/^(.*new Hono\b[^)]*\)\s*;?\s*)$/m);
        if (honoInitMatch) {
            const errorHandler = `\n// Global error handler (auto-injected safety net)\napp.onError((err, c) => {\n  console.error('Unhandled route error:', err.message);\n  return c.json({ error: err.message || 'Internal Server Error' }, 500);\n});\n`;
            result = result.replace(honoInitMatch[0], honoInitMatch[0] + errorHandler);
        }
    }

    return result;
}

/**
 * Sanitize wrangler.jsonc to use Cloudflare-recommended run_worker_first pattern.
 * Replaces `"run_worker_first": true` with `"run_worker_first": ["/api/*"]` which
 * ensures only API requests hit the worker, avoiding router issues in dev mode.
 */
export function sanitizeWranglerConfig(contents: string): string {
    // Replace run_worker_first: true with the Cloudflare-recommended array pattern
    // This prevents ALL requests from hitting the worker (which triggers Hono router issues)
    return contents.replace(
        /"run_worker_first"\s*:\s*true/g,
        '"run_worker_first": ["/api/*"]'
    );
}

/**
 * Fix orphaned closing braces before JSX closing tags in TSX/JSX files.
 * LLMs sometimes generate a stray `}` on the line before or same line as `</tag>`,
 * producing invalid JSX like:
 *   {card.trend}
 *   }</span>
 * This tracks cumulative brace depth to only remove braces that have no matching opener.
 */
export function sanitizeJsxBraces(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    // Track net brace depth across all lines (only outside strings/templates)
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check if this line is a stray `}` before a closing JSX tag
        const strayBraceMatch = line.match(/^(\s*)}\s*(<\/\w[^>]*>.*)$/);
        if (strayBraceMatch && braceDepth === 0) {
            // braceDepth is 0 so there's no open `{` for this `}` to close -- remove it
            result.push(strayBraceMatch[1] + strayBraceMatch[2]);
            continue;
        }

        // Update brace depth: count `{` and `}` outside string literals
        // Simple heuristic that avoids counting braces inside quotes
        const stripped = line
            .replace(/`[^`]*`/g, '')       // remove template literals (single-line)
            .replace(/'[^']*'/g, '')        // remove single-quoted strings
            .replace(/"[^"]*"/g, '')        // remove double-quoted strings
            .replace(/\/\/.*$/g, '');       // remove line comments

        const opens = (stripped.match(/\{/g) || []).length;
        const closes = (stripped.match(/\}/g) || []).length;
        braceDepth += opens - closes;
        if (braceDepth < 0) braceDepth = 0; // clamp to avoid drift from multiline strings

        result.push(line);
    }

    return result.join('\n');
}
