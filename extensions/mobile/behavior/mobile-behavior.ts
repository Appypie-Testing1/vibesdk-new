import { TemplateDetails } from 'worker/services/sandbox/sandboxTypes';
import { BaseProjectState } from 'worker/agents/core/state';
import { createExpoScratchTemplateDetails, createExpoFullstackTemplateDetails } from '@ext/mobile/templates';
import { getPreviewDomain, getProtocolForHost } from 'worker/utils/urls';

/**
 * Mobile behavior extension: encapsulates mobile-specific logic
 * extracted from BaseCodingBehavior to keep the core behavior clean.
 */
export const MobileBehavior = {
    /**
     * Check whether a template name corresponds to a mobile (Expo) template.
     */
    isMobileTemplate(templateName: string): boolean {
        return templateName === 'expo-scratch' || templateName === 'expo-fullstack';
    },

    /**
     * Return the synthesized TemplateDetails for a mobile template,
     * or null if the template name is not a mobile template.
     */
    getTemplateDetails(templateName: string): TemplateDetails | null {
        if (templateName === 'expo-scratch') {
            return createExpoScratchTemplateDetails();
        }
        if (templateName === 'expo-fullstack') {
            return createExpoFullstackTemplateDetails();
        }
        return null;
    },

    /**
     * Return the state overrides that should be applied when initializing
     * a mobile template, or null if the template name is not mobile.
     */
    getTemplateStateOverrides(templateName: string): Partial<BaseProjectState> | null {
        if (templateName === 'expo-scratch') {
            const details = createExpoScratchTemplateDetails();
            return {
                templateRenderMode: 'mobile',
                templateInitCommand: details.initCommand,
            };
        }
        if (templateName === 'expo-fullstack') {
            const details = createExpoFullstackTemplateDetails();
            return {
                templateRenderMode: 'mobile-fullstack',
                templateInitCommand: details.initCommand,
            };
        }
        return null;
    },

    /**
     * Check whether a mobile project is previewable based on the presence
     * of required files. Returns null if the state is not a mobile template
     * (caller should fall through to core logic).
     */
    isPreviewable(
        state: BaseProjectState,
        fileManager: { fileExists: (path: string) => boolean },
    ): boolean | null {
        if (state.templateRenderMode !== 'mobile' && state.templateRenderMode !== 'mobile-fullstack') {
            return null;
        }
        return fileManager.fileExists('package.json') && (
            fileManager.fileExists('app.json') || fileManager.fileExists('app.config.ts')
        );
    },

    /**
     * Post-generation hook for mobile-fullstack projects: writes the
     * .api-url file to the sandbox so the Expo proxy can route /api/*
     * requests to the deployed CF Workers backend.
     */
    async onGenerationComplete(
        state: BaseProjectState,
        env: Env,
        deploymentManager: { getClient: () => { writeFiles: (sandboxId: string, files: Array<{ filePath: string; fileContents: string }>) => Promise<unknown> } },
    ): Promise<void> {
        if (
            (state.templateRenderMode !== 'mobile-fullstack' && state.templateName !== 'expo-fullstack') ||
            !state.sandboxInstanceId
        ) {
            return;
        }

        const previewDomain = getPreviewDomain(env);
        const protocol = getProtocolForHost(previewDomain);
        const expectedUrl = `${protocol}://${state.projectName}.${previewDomain}`;
        const client = deploymentManager.getClient();
        const sandboxId = state.sandboxInstanceId;

        try {
            await client.writeFiles(sandboxId, [
                { filePath: '.api-url', fileContents: expectedUrl },
            ]);
        } catch {
            // Caller handles logging; swallow here to avoid breaking generation flow
        }
    },
};
