/**
 * Authentication Middleware
 * Handles JWT validation and session management
 */

import { AuthUserSession } from '../../types/auth-types';
import { createLogger } from '../../logger';
import { AuthService } from '../../database/services/AuthService';
import { extractToken } from '../../utils/authUtils';

const logger = createLogger('AuthMiddleware');
/**
 * Validate JWT token and return user
 */
export async function validateToken(
    token: string,
    env: Env
): Promise<AuthUserSession | null> {
    try {
        // Use AuthService for token validation and user retrieval
        const authService = new AuthService(env);
        return authService.validateTokenAndGetUser(token, env);
    } catch (error) {
        logger.error('Token validation error', error);
        return null;
    }
}

/**
 * Authentication middleware
 */
export async function authMiddleware(
    request: Request,
    env: Env
): Promise<AuthUserSession | null> {
    try {
        // Extract token
        const token = extractToken(request);

        console.log('[DEV AUTH DEBUG] token extracted:', !!token, 'ENVIRONMENT:', env.ENVIRONMENT, 'CUSTOM_DOMAIN:', env.CUSTOM_DOMAIN);

        if (token) {
            const userResponse = await validateToken(token, env);
            if (userResponse) {
                logger.debug('User authenticated', { userId: userResponse.user.id });
                return userResponse;
            }
            console.log('[DEV AUTH DEBUG] validateToken returned null');
        }

        logger.debug('No authentication found');
        return null;
    } catch (error) {
        logger.error('Auth middleware error', error);
        return null;
    }
}