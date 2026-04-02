/** Content type definition from an EmDash CMS instance */
export interface EmDashContentType {
    name: string;
    slug: string;
    fields: Array<{
        name: string;
        type: string;
        required?: boolean;
        description?: string;
    }>;
}

/** Installed plugin info from an EmDash CMS instance */
export interface EmDashPluginInfo {
    id: string;
    name: string;
    version: string;
    capabilities: string[];
    active: boolean;
}

/** Theme info from an EmDash CMS instance */
export interface EmDashThemeInfo {
    name: string;
    version: string;
    framework: string;
}

/** Full site context from an EmDash CMS instance */
export interface EmDashSiteContext {
    siteUrl: string;
    contentTypes: EmDashContentType[];
    installedPlugins: EmDashPluginInfo[];
    theme?: EmDashThemeInfo;
    taxonomies?: Array<{ name: string; slug: string; terms: string[] }>;
}

/** Dashboard creation modes */
export type DashboardMode = 'plugin-builder' | 'design-studio' | 'app-builder';

/** Dashboard configuration passed from embedding host */
export interface DashboardConfig {
    mode: DashboardMode;
    customerId: string;
    emdashContext?: EmDashSiteContext;
    branding?: {
        logoUrl?: string;
        primaryColor?: string;
        appName?: string;
    };
}
