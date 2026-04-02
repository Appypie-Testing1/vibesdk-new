/**
 * Secret template interface for getTemplates
 */
export interface SecretTemplate {
	id: string;
	displayName: string;
	envVarName: string;
	provider: string;
	icon: string;
	description: string;
	instructions: string;
	placeholder: string;
	validation: string;
	required: boolean;
	category: string;
}

export function getTemplatesData(): SecretTemplate[] {
	const templates = [
		// Payment Processing
		{
			id: 'STRIPE_SECRET_KEY',
			displayName: 'Stripe Secret Key',
			envVarName: 'STRIPE_SECRET_KEY',
			provider: 'stripe',
			icon: '💳',
			description: 'Stripe secret key for payment processing',
			instructions:
				'Go to Stripe Dashboard → Developers → API keys → Secret key',
			placeholder: 'sk_test_... or sk_live_...',
			validation: '^sk_(test_|live_)[a-zA-Z0-9]{48,}$',
			required: false,
			category: 'payments',
		},
		{
			id: 'STRIPE_PUBLISHABLE_KEY',
			displayName: 'Stripe Publishable Key',
			envVarName: 'STRIPE_PUBLISHABLE_KEY',
			provider: 'stripe',
			icon: '💳',
			description: 'Stripe publishable key for frontend integration',
			instructions:
				'Go to Stripe Dashboard → Developers → API keys → Publishable key',
			placeholder: 'pk_test_... or pk_live_...',
			validation: '^pk_(test_|live_)[a-zA-Z0-9]{48,}$',
			required: false,
			category: 'payments',
		},

		// AI Services
		{
			id: 'OPENAI_API_KEY',
			displayName: 'OpenAI API Key',
			envVarName: 'OPENAI_API_KEY',
			provider: 'openai',
			icon: '🤖',
			description: 'OpenAI API key for GPT and other AI models',
			instructions:
				'Go to OpenAI Platform → API keys → Create new secret key',
			placeholder: 'sk-...',
			validation: '^sk-[a-zA-Z0-9]{48,}$',
			required: false,
			category: 'ai',
		},
		{
			id: 'ANTHROPIC_API_KEY',
			displayName: 'Anthropic API Key',
			envVarName: 'ANTHROPIC_API_KEY',
			provider: 'anthropic',
			icon: '🧠',
			description: 'Anthropic Claude API key',
			instructions: 'Go to Anthropic Console → API Keys → Create Key',
			placeholder: 'sk-ant-...',
			validation: '^sk-ant-[a-zA-Z0-9_-]{48,}$',
			required: false,
			category: 'ai',
		},
		{
			id: 'GOOGLE_AI_STUDIO_API_KEY',
			displayName: 'Google Gemini API Key',
			envVarName: 'GOOGLE_AI_STUDIO_API_KEY',
			provider: 'google-ai-studio',
			icon: '🔷',
			description: 'Google Gemini AI API key',
			instructions: 'Go to Google AI Studio → Get API key',
			placeholder: 'AI...',
			validation: '^AI[a-zA-Z0-9_-]{35,}$',
			required: false,
			category: 'ai',
		},
		{
			id: 'OPENROUTER_API_KEY',
			displayName: 'OpenRouter API Key',
			envVarName: 'OPENROUTER_API_KEY',
			provider: 'openrouter',
			icon: '🔀',
			description: 'OpenRouter API key for multiple AI providers',
			instructions: 'Go to OpenRouter → Account → Keys → Create new key',
			placeholder: 'sk-or-...',
			validation: '^sk-or-[a-zA-Z0-9_-]{48,}$',
			required: false,
			category: 'ai',
		},

		// BYOK (Bring Your Own Key) AI Providers - Lenient validation for compatibility
		{
			id: 'OPENAI_API_KEY_BYOK',
			displayName: 'OpenAI (BYOK)',
			envVarName: 'OPENAI_API_KEY_BYOK',
			provider: 'openai',
			icon: '🤖',
			description:
				'Use your OpenAI API key for GPT models via Appy Pie AI Gateway',
			instructions:
				'Go to OpenAI Platform → API Keys → Create new secret key',
			placeholder: 'sk-proj-... or sk-...',
			validation: '^sk-.{10,}$',
			required: false,
			category: 'byok',
		},
		{
			id: 'ANTHROPIC_API_KEY_BYOK',
			displayName: 'Anthropic (BYOK)',
			envVarName: 'ANTHROPIC_API_KEY_BYOK',
			provider: 'anthropic',
			icon: '🧠',
			description:
				'Use your Anthropic API key for Claude models via Appy Pie AI Gateway',
			instructions: 'Go to Anthropic Console → API Keys → Create Key',
			placeholder: 'sk-ant-api03-...',
			validation: '^sk-ant-.{10,}$',
			required: false,
			category: 'byok',
		},
		{
			id: 'GOOGLE_AI_STUDIO_API_KEY_BYOK',
			displayName: 'Google AI Studio (BYOK)',
			envVarName: 'GOOGLE_AI_STUDIO_API_KEY_BYOK',
			provider: 'google-ai-studio',
			icon: '🔷',
			description:
				'Use your Google AI API key for Gemini models via Appy Pie AI Gateway',
			instructions: 'Go to Google AI Studio → Get API Key',
			placeholder: 'AIzaSy...',
			validation: '^AIza.{20,}$',
			required: false,
			category: 'byok',
		},
		{
			id: 'CEREBRAS_API_KEY_BYOK',
			displayName: 'Cerebras (BYOK)',
			envVarName: 'CEREBRAS_API_KEY_BYOK',
			provider: 'cerebras',
			icon: '🧮',
			description:
				'Use your Cerebras API key for high-performance inference via Appy Pie AI Gateway',
			instructions: 'Go to Cerebras Platform → API Keys → Create new key',
			placeholder: 'csk-... or any format',
			validation: '^.{10,}$',
			required: false,
			category: 'byok',
		},

		// Development Tools
		{
			id: 'GITHUB_TOKEN',
			displayName: 'GitHub Personal Access Token',
			envVarName: 'GITHUB_TOKEN',
			provider: 'github',
			icon: '🐙',
			description: 'GitHub token for repository operations',
			instructions:
				'Go to GitHub → Settings → Developer settings → Personal access tokens → Generate new token',
			placeholder: 'ghp_... or github_pat_...',
			validation: '^(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{80,})$',
			required: false,
			category: 'development',
		},
		{
			id: 'VERCEL_TOKEN',
			displayName: 'Vercel Access Token',
			envVarName: 'VERCEL_TOKEN',
			provider: 'vercel',
			icon: '▲',
			description: 'Vercel token for deployments',
			instructions: 'Go to Vercel Dashboard → Settings → Tokens → Create',
			placeholder: 'Your Vercel access token',
			validation: '^[a-zA-Z0-9]{24}$',
			required: false,
			category: 'deployment',
		},
		{
			id: 'EXPO_TOKEN',
			displayName: 'Expo Access Token',
			envVarName: 'EXPO_TOKEN',
			provider: 'expo',
			icon: '📱',
			description: 'Expo access token for EAS native app builds (iOS/Android)',
			instructions:
				'Go to https://expo.dev → Sign in → Account Settings → Access Tokens → Create',
			placeholder: 'Your Expo access token',
			validation: '.+',
			required: false,
			category: 'deployment',
		},
		{
			id: 'EMDASH_API_TOKEN',
			displayName: 'EmDash API Token',
			envVarName: 'EMDASH_API_TOKEN',
			provider: 'emdash',
			icon: '',
			description: 'EmDash CMS API token for deploying plugins and themes to your EmDash instance',
			instructions:
				'Go to your EmDash admin panel → Settings → API Tokens → Create new token with plugin management permissions',
			placeholder: 'Your EmDash API token',
			validation: '.+',
			required: false,
			category: 'deployment',
		},
		{
			id: 'EXPO_APPLE_TEAM_ID',
			displayName: 'Apple Developer Team ID',
			envVarName: 'EXPO_APPLE_TEAM_ID',
			provider: 'apple',
			icon: '',
			description:
				'10-character Apple Developer Team ID for iOS code signing',
			instructions:
				'Go to https://developer.apple.com/account → Membership Details → Team ID',
			placeholder: 'ABCDE12345',
			validation: '^[A-Z0-9]{10}$',
			required: false,
			category: 'deployment',
		},
		{
			id: 'EXPO_APPLE_TEAM_TYPE',
			displayName: 'Apple Developer Team Type',
			envVarName: 'EXPO_APPLE_TEAM_TYPE',
			provider: 'apple',
			icon: '',
			description:
				'Apple Developer account type (required for iOS EAS builds)',
			instructions:
				'INDIVIDUAL for personal accounts, COMPANY_OR_ORGANIZATION for company accounts, IN_HOUSE for Enterprise accounts',
			placeholder: 'INDIVIDUAL',
			validation: '^(INDIVIDUAL|COMPANY_OR_ORGANIZATION|IN_HOUSE)$',
			required: false,
			category: 'deployment',
		},
		{
			id: 'EXPO_ASC_KEY_ID',
			displayName: 'App Store Connect Key ID',
			envVarName: 'EXPO_ASC_KEY_ID',
			provider: 'apple',
			icon: '',
			description:
				'Key ID of your App Store Connect API Key (for iOS EAS builds)',
			instructions:
				'Go to https://appstoreconnect.apple.com/access/integrations/api → Keys → Copy Key ID',
			placeholder: 'ABC1234DEF',
			validation: '^[A-Z0-9]{10}$',
			required: false,
			category: 'deployment',
		},
		{
			id: 'EXPO_ASC_ISSUER_ID',
			displayName: 'App Store Connect Issuer ID',
			envVarName: 'EXPO_ASC_ISSUER_ID',
			provider: 'apple',
			icon: '',
			description:
				'Issuer ID from App Store Connect API Keys page',
			instructions:
				'Go to https://appstoreconnect.apple.com/access/integrations/api → Copy Issuer ID (shown at the top)',
			placeholder: 'f9675cff-f45d-4116-bd2c-2372142cee09',
			validation:
				'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
			required: false,
			category: 'deployment',
		},
		{
			id: 'EXPO_ASC_API_KEY_CONTENT',
			displayName: 'App Store Connect API Key (.p8)',
			envVarName: 'EXPO_ASC_API_KEY_CONTENT',
			provider: 'apple',
			icon: '',
			description:
				'Contents of your App Store Connect .p8 API key file (for iOS EAS builds)',
			instructions:
				'Go to https://appstoreconnect.apple.com/access/integrations/api → Keys → Download .p8 file → Paste the full contents here',
			placeholder: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
			validation: '^-----BEGIN PRIVATE KEY-----',
			required: false,
			category: 'deployment',
		},

		// Database & Storage
		{
			id: 'SUPABASE_URL',
			displayName: 'Supabase Project URL',
			envVarName: 'SUPABASE_URL',
			provider: 'supabase',
			icon: '🗄️',
			description: 'Supabase project URL',
			instructions:
				'Go to Supabase Dashboard → Settings → API → Project URL',
			placeholder: 'https://xxx.supabase.co',
			validation: '^https://[a-z0-9]+\\.supabase\\.co$',
			required: false,
			category: 'database',
		},
		{
			id: 'SUPABASE_ANON_KEY',
			displayName: 'Supabase Anonymous Key',
			envVarName: 'SUPABASE_ANON_KEY',
			provider: 'supabase',
			icon: '🗄️',
			description: 'Supabase anonymous/public key',
			instructions:
				'Go to Supabase Dashboard → Settings → API → anon public key',
			placeholder: 'eyJ...',
			validation: '^eyJ[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+$',
			required: false,
			category: 'database',
		},
	];

	return templates;
}

/**
 * Get BYOK templates dynamically
 */
export function getBYOKTemplates(): SecretTemplate[] {
	return getTemplatesData().filter(
		(template) => template.category === 'byok',
	);
}
