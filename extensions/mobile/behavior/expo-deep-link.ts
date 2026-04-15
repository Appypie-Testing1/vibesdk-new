import { BaseProjectState } from 'worker/agents/core/state';

/**
 * Compute the Expo deep link transformer for mobile templates.
 * Returns a function that transforms a sandbox preview URL into an
 * Expo-compatible deep link, or undefined if the project is not mobile.
 *
 * Uses the original protocol (https://) directly -- Expo Go SDK 54
 * handles HTTPS URLs natively without needing exps:// scheme.
 */
export function computeExpoDeepLink(
    state: BaseProjectState,
): ((previewURL: string) => string | undefined) | undefined {
    if (state.templateRenderMode !== 'mobile' && state.templateRenderMode !== 'mobile-fullstack') {
        return undefined;
    }
    return (previewURL: string): string | undefined => {
        try {
            const url = new URL(previewURL);
            return `${url.protocol}//${url.hostname}`;
        } catch {
            return undefined;
        }
    };
}
