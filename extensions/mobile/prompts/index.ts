export * from './mobile-prompts';
export * from './fullstack-prompts';

import { MOBILE_SYSTEM_PROMPT } from './mobile-prompts';
import { FULLSTACK_MOBILE_SYSTEM_PROMPT } from './fullstack-prompts';

export function getMobileSystemPrompt(renderMode?: string): string | null {
    if (renderMode === 'mobile-fullstack') return FULLSTACK_MOBILE_SYSTEM_PROMPT;
    if (renderMode === 'mobile') return MOBILE_SYSTEM_PROMPT;
    return null;
}
