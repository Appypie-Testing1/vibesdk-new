import { getAgentByName } from 'agents';
import { generateId } from '../utils/idGenerator';
import { StructuredLogger } from '../logger';
import { InferenceContext } from './inferutils/config.types';
import { SandboxSdkClient } from '../services/sandbox/sandboxSdkClient';
import { selectTemplate } from './planning/templateSelector';
import { TemplateDetails } from '../services/sandbox/sandboxTypes';
import { createScratchTemplateDetails, createExpoScratchTemplateDetails, createExpoFullstackTemplateDetails } from './utils/templates';
import { TemplateSelection } from './schemas';
import type { ImageAttachment } from '../types/image-attachment';
import { BaseSandboxService } from 'worker/services/sandbox/BaseSandboxService';
import { AgentState, CurrentDevState } from './core/state';
import { CodeGeneratorAgent } from './core/codingAgent';
import { BehaviorType, ProjectType } from './core/types';

type AgentStubProps = {
    behaviorType?: BehaviorType;
    projectType?: ProjectType;
};

export async function getAgentStub(
    env: Env, 
    agentId: string,
    props?: AgentStubProps
) : Promise<DurableObjectStub<CodeGeneratorAgent>> {
    const options = props ? { props } : undefined;
    return getAgentByName<Env, CodeGeneratorAgent>(env.CodeGenObject, agentId, options);
}

export async function getAgentStubLightweight(env: Env, agentId: string) : Promise<DurableObjectStub<CodeGeneratorAgent>> {
    return getAgentByName<Env, CodeGeneratorAgent>(env.CodeGenObject, agentId, {
        // props: { readOnlyMode: true }
    });
}

export async function getAgentState(env: Env, agentId: string) : Promise<AgentState> {
    const agentInstance = await getAgentStub(env, agentId);
    return await agentInstance.getFullState() as AgentState;
}

export async function cloneAgent(env: Env, agentId: string) : Promise<{newAgentId: string, newAgent: DurableObjectStub<CodeGeneratorAgent>}> {
    const agentInstance = await getAgentStub(env, agentId);
    if (!agentInstance || !await agentInstance.isInitialized()) {
        throw new Error(`Agent ${agentId} not found`);
    }
    const newAgentId = generateId();

    const originalState = await agentInstance.getFullState();

    const newState: AgentState = {
        ...originalState,
        sessionId: newAgentId,
        sandboxInstanceId: undefined,
        pendingUserInputs: [],
        shouldBeGenerating: false,
        projectUpdatesAccumulator: [],
        reviewingInitiated: false,
        mvpGenerated: false,
        ...(originalState.behaviorType === 'phasic' ? {
            generatedPhases: [],
            currentDevState: CurrentDevState.IDLE,
        } : {}),
    } as AgentState;

    const newAgent = await getAgentStub(env, newAgentId, {
        behaviorType: originalState.behaviorType,
        projectType: originalState.projectType,
    });

    await newAgent.setState(newState);
    return {newAgentId, newAgent};
}

export async function getTemplateForQuery(
    env: Env,
    inferenceContext: InferenceContext,
    query: string,
    projectType: ProjectType | 'auto',
    images: ImageAttachment[] | undefined,
    logger: StructuredLogger,
) : Promise<{templateDetails: TemplateDetails, selection: TemplateSelection, projectType: ProjectType}> {
    // In 'general' mode, we intentionally start from scratch without a real template
    if (projectType === 'general') {
        const scratch: TemplateDetails = createScratchTemplateDetails();
        const selection: TemplateSelection = {
            selectedTemplateName: null,
            reasoning: 'General (from-scratch) mode: no template selected',
            useCase: 'General',
            complexity: 'moderate',
            styleSelection: 'Custom',
            projectType: 'general',
        } as TemplateSelection; // satisfies schema shape
        return { templateDetails: scratch, selection, projectType: 'general' };
    }
    // Check for mobile/native app requests FIRST -- before LLM template selection
    // This ensures mobile queries always get the Expo template, not a web template
    // Match "mobile app", "mobile todo app", "mobile fitness tracker app", etc.
    // Also matches standalone mobile keywords like "react native", "expo", "iphone"
    const hasMobileWord = /\bmobile\b/i.test(query) && /\bapp(lication)?\b/i.test(query);
    const mobileKeywords = /\b(ios\s*app|android\s*app|react\s*native|expo|phone\s*app|native\s*app|iphone|smartphone)\b/i;
    const isMobileRequest = hasMobileWord || mobileKeywords.test(query);
    if (isMobileRequest) {
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

    // Fetch available templates
    const templatesResponse = await SandboxSdkClient.listTemplates();
    if (!templatesResponse || !templatesResponse.success) {
        throw new Error(`Failed to fetch templates from sandbox service, ${templatesResponse.error}`);
    }

    const analyzeQueryResponse = await selectTemplate({
        env,
        inferenceContext,
        query,
        projectType,
        availableTemplates: templatesResponse.templates,
        images,
    });

    logger.info('Selected template', { selectedTemplate: analyzeQueryResponse });

    if (!analyzeQueryResponse.selectedTemplateName) {
        // For non-general requests when no template is selected, fall back to web scratch
        logger.warn('No suitable template found; falling back to scratch');
        const scratch: TemplateDetails = createScratchTemplateDetails();
        return { templateDetails: scratch, selection: analyzeQueryResponse, projectType: analyzeQueryResponse.projectType };
    }

    const selectedTemplate = templatesResponse.templates.find(template => template.name === analyzeQueryResponse.selectedTemplateName);
    if (!selectedTemplate) {
        logger.error('Selected template not found');
        throw new Error('Selected template not found');
    }
    const templateDetailsResponse = await BaseSandboxService.getTemplateDetails(selectedTemplate.name);
    if (!templateDetailsResponse.success || !templateDetailsResponse.templateDetails) {
        logger.error('Failed to fetch files', { templateDetailsResponse });
        throw new Error('Failed to fetch files');
    }

    const templateDetails = templateDetailsResponse.templateDetails;
    return { templateDetails, selection: analyzeQueryResponse, projectType: analyzeQueryResponse.projectType };
}
