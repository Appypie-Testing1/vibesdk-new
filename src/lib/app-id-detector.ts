/**
 * Detects the current app ID from various sources
 * Priority: URL parameter > URL pathname > localStorage > window.location.hostname
 */
export function detectAppId(): string | null {
	// 1. Check URL search parameters
	const urlParams = new URLSearchParams(window.location.search);
	const appIdFromParams = urlParams.get('appId');
	if (appIdFromParams) return appIdFromParams;

	// 2. Check URL pathname (e.g., /app/lumina-forge-j30uq0yjmnqsjk1yf8sv7)
	const pathMatch = window.location.pathname.match(/\/app\/([a-zA-Z0-9\-_]+)/);
	if (pathMatch && pathMatch[1]) return pathMatch[1];

	// 3. Check subdomain (e.g., lumina-forge-j30uq0yjmnqsjk1yf8sv7.vibesnappy.appypie.com)
	const hostname = window.location.hostname;
	const subdomainMatch = hostname.match(/^([a-zA-Z0-9\-_]+)\.vibesnappy\.appypie\.com/);
	if (subdomainMatch && subdomainMatch[1]) return subdomainMatch[1];

	// 4. Check localStorage
	const storedAppId = localStorage.getItem('currentAppId');
	if (storedAppId) return storedAppId;

	// 5. Try to extract from window object if set by parent
	if ((window as any).__APP_ID__) return (window as any).__APP_ID__;

	return null;
}

/**
 * Sets the app ID in localStorage for persistence
 */
export function setAppId(appId: string): void {
	localStorage.setItem('currentAppId', appId);
	(window as any).__APP_ID__ = appId;
}

/**
 * Gets the current app ID with fallback
 */
export function getCurrentAppId(): string {
	const appId = detectAppId();
	if (!appId) {
		console.warn('Could not detect app ID from URL or storage');
		throw new Error('App ID not found. Please ensure the app is accessed from the correct URL.');
	}
	return appId;
}
