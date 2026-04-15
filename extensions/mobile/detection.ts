import type { TemplateDetails } from 'worker/services/sandbox/sandboxTypes';
import type { TemplateSelection } from 'worker/agents/schemas';
import type { StructuredLogger } from 'worker/logger/core';
import type { ProjectType } from 'worker/agents/core/types';
import { createExpoScratchTemplateDetails, createExpoFullstackTemplateDetails } from './templates';

/**
 * Detect whether a user query is requesting a mobile/native app.
 * Returns template details, selection, and project type if mobile is detected; null otherwise.
 */
export function detectMobileTemplate(
    query: string,
    logger: StructuredLogger,
): { templateDetails: TemplateDetails; selection: TemplateSelection; projectType: ProjectType } | null {
    // Check for mobile/native app requests FIRST -- before LLM template selection
    // This ensures mobile queries always get the Expo template, not a web template
    // Match "mobile app", "mobile todo app", "mobile fitness tracker app", etc.
    // Also matches standalone mobile keywords like "react native", "expo", "iphone"
    const hasMobileWord = /\bmobile\b/i.test(query) && /\bapp(lication)?\b/i.test(query);
    const mobileKeywords = /\b(ios\s*app|android\s*app|react\s*native|expo|phone\s*app|native\s*app|iphone|smartphone)\b/i;
    const isMobileRequest = hasMobileWord || mobileKeywords.test(query);
    if (!isMobileRequest) {
        return null;
    }

    // Detect if the mobile app needs a backend (database, API, auth, etc.)
    const backendKeywords = /\b(database|api|backend|auth|users|crud|full[\s-]?stack|server|login|signup|register|persist|storage|d1|sqlite|sql)\b/i;
    const needsBackend = backendKeywords.test(query);

    if (needsBackend) {
        logger.info('Fullstack mobile app detected from query keywords; using expo-fullstack template');
        const expoFullstack: TemplateDetails = createExpoFullstackTemplateDetails();
        const selection: TemplateSelection = {
            selectedTemplateName: 'expo-fullstack',
            reasoning: 'Mobile app with backend/database request detected - using Expo + Hono + D1 fullstack template',
            useCase: 'Other',
            complexity: 'moderate',
            styleSelection: 'Custom',
            projectType: 'app',
        } as TemplateSelection;
        return { templateDetails: expoFullstack, selection, projectType: 'app' };
    }

    logger.info('Mobile app detected from query keywords; using expo-scratch template');
    const expoScratch: TemplateDetails = createExpoScratchTemplateDetails();
    const selection: TemplateSelection = {
        selectedTemplateName: 'expo-scratch',
        reasoning: 'Mobile app request detected - using Expo/React Native template',
        useCase: 'Other',
        complexity: 'moderate',
        styleSelection: 'Custom',
        projectType: 'app',
    } as TemplateSelection;
    return { templateDetails: expoScratch, selection, projectType: 'app' };
}
