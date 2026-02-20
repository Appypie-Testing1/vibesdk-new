import { setupAuthRoutes } from './authRoutes.ts';
import { setupAppRoutes } from './appRoutes.ts';
import { setupUserRoutes } from './userRoutes.ts';
import { setupStatsRoutes } from './statsRoutes.ts';
import { setupAnalyticsRoutes } from './analyticsRoutes.ts';
// import { setupUserSecretsRoutes } from './userSecretsRoutes.ts';
import { setupModelConfigRoutes } from './modelConfigRoutes.ts';
import { setupModelProviderRoutes } from './modelProviderRoutes.ts';
import { setupGitHubExporterRoutes } from './githubExporterRoutes.ts';
import { setupCodegenRoutes } from './codegenRoutes.ts';
import { setupScreenshotRoutes } from './imagesRoutes.ts';
import { setupSentryRoutes } from './sentryRoutes.ts';
import { setupCapabilitiesRoutes } from './capabilitiesRoutes.ts';
import { setupDatabaseRoutes } from './database.ts';
import { Hono } from "hono";
import { AppEnv } from "../../types/appenv";
import { setupStatusRoutes } from './statusRoutes.ts';

export function setupRoutes(app: Hono<AppEnv>): void {
    // Health check route
    app.get('/api/health', (c) => {
        return c.json({ status: 'ok' });
    }); 
    
    // Sentry tunnel routes (public - no auth required)
    setupSentryRoutes(app);

    // Platform status routes (public)
    setupStatusRoutes(app);

    // Platform capabilities routes (public)
    setupCapabilitiesRoutes(app);

    // Authentication and user management routes
    setupAuthRoutes(app);
    
    // Codegen routes
    setupCodegenRoutes(app);
    
    // User dashboard and profile routes
    setupUserRoutes(app);
    
    // App management routes
    setupAppRoutes(app);
    
    // Stats routes
    setupStatsRoutes(app);
    
    // AI Gateway Analytics routes
    setupAnalyticsRoutes(app);
    
    // // Secrets management routes (legacy D1-based)
    // setupSecretsRoutes(app);

    // // User secrets vault routes
    // setupUserSecretsRoutes(app);
    
    // Model configuration and provider keys routes
    setupModelConfigRoutes(app);
    
    // Model provider routes
    setupModelProviderRoutes(app);

    // GitHub Exporter routes
    setupGitHubExporterRoutes(app);

    // Screenshot serving routes (public)
    setupScreenshotRoutes(app);

    // Database routes for app data persistence
    setupDatabaseRoutes(app);
}
