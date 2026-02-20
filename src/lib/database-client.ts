import { detectAppId, getCurrentAppId } from './app-id-detector';

export interface AppMetadata {
	id: string;
	name: string;
	description?: string;
	prompt: string;
	created_by: string;
	is_published: number;
	config?: Record<string, unknown>;
}

export interface UserInput {
	id: string;
	app_id: string;
	input_data: Record<string, unknown>;
	timestamp: string;
}

export interface ExecutionResult {
	id: string;
	app_id: string;
	execution_result: string;
	execution_time: number;
	status: 'success' | 'error' | 'pending';
	timestamp: string;
}

export interface PerformanceMetric {
	id: string;
	app_id: string;
	metric_name: string;
	metric_value: number;
	timestamp: string;
}

class DatabaseClient {
	private baseUrl: string;
	private appId: string | null = null;

	constructor(baseUrl: string = '/api/db') {
		this.baseUrl = baseUrl;
		this.appId = detectAppId();
	}

	/**
	 * Set the app ID for this client instance
	 */
	setAppId(appId: string): void {
		this.appId = appId;
	}

	/**
	 * Get the app ID, with fallback to detection
	 */
	private getAppId(overrideAppId?: string): string {
		if (overrideAppId) return overrideAppId;
		if (this.appId) return this.appId;
		return getCurrentAppId();
	}

	async initializeDatabase(): Promise<{ success: boolean; message: string }> {
		const response = await fetch(`${this.baseUrl}/init`, {
			method: 'POST',
		});
		if (!response.ok) throw new Error('Failed to initialize database');
		return response.json();
	}

	// App CRUD operations
	async createApp(appData: {
		id: string;
		name: string;
		description?: string;
		prompt: string;
		created_by: string;
		config?: Record<string, unknown>;
	}): Promise<{ success: boolean; id: string }> {
		const response = await fetch(`${this.baseUrl}/apps`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(appData),
		});
		if (!response.ok) throw new Error('Failed to create app');
		return response.json();
	}

	async getApp(appId?: string): Promise<AppMetadata | null> {
		const id = this.getAppId(appId);
		const response = await fetch(`${this.baseUrl}/apps/${id}`);
		if (!response.ok) {
			if (response.status === 404) return null;
			throw new Error('Failed to get app');
		}
		return response.json();
	}

	async getAllApps(userId: string): Promise<AppMetadata[]> {
		const response = await fetch(`${this.baseUrl}/apps?userId=${userId}`);
		if (!response.ok) throw new Error('Failed to get apps');
		return response.json();
	}

	async updateApp(
		updates: Partial<{
			name: string;
			description: string;
			prompt: string;
			is_published: number;
			config: Record<string, unknown>;
		}>,
		appId?: string
	): Promise<{ success: boolean }> {
		const id = this.getAppId(appId);
		const response = await fetch(`${this.baseUrl}/apps/${id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updates),
		});
		if (!response.ok) throw new Error('Failed to update app');
		return response.json();
	}

	async deleteApp(appId?: string): Promise<{ success: boolean }> {
		const id = this.getAppId(appId);
		const response = await fetch(`${this.baseUrl}/apps/${id}`, {
			method: 'DELETE',
		});
		if (!response.ok) throw new Error('Failed to delete app');
		return response.json();
	}

	// User input storage
	async saveUserInput(inputData: Record<string, unknown>, appId?: string): Promise<{ success: boolean; id: string }> {
		const id = this.getAppId(appId);
		const response = await fetch(`${this.baseUrl}/apps/${id}/data`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				dataType: 'user_input',
				content: JSON.stringify(inputData),
			}),
		});
		if (!response.ok) throw new Error('Failed to save user input');
		return response.json();
	}

	async getUserInputs(appId?: string): Promise<UserInput[]> {
		const id = this.getAppId(appId);
		const response = await fetch(`${this.baseUrl}/apps/${id}/data?type=user_input`);
		if (!response.ok) throw new Error('Failed to get user inputs');
		const data = await response.json();
		return data.map((item: Record<string, unknown>) => ({
			id: item.id,
			app_id: item.app_id,
			input_data: JSON.parse(item.content as string),
			timestamp: item.created_at,
		}));
	}

	// Execution results storage
	async recordExecution(
		executionResult: string,
		executionTime: number,
		status: 'success' | 'error' | 'pending',
		appId?: string
	): Promise<{ success: boolean; id: string }> {
		const id = this.getAppId(appId);
		const response = await fetch(`${this.baseUrl}/apps/${id}/executions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				executionResult,
				executionTime,
				status,
			}),
		});
		if (!response.ok) throw new Error('Failed to record execution');
		return response.json();
	}

	async getExecutions(limit: number = 10, appId?: string): Promise<ExecutionResult[]> {
		const id = this.getAppId(appId);
		const response = await fetch(`${this.baseUrl}/apps/${id}/executions?limit=${limit}`);
		if (!response.ok) throw new Error('Failed to get executions');
		const data = await response.json();
		return data.map((item: Record<string, unknown>) => ({
			id: item.id,
			app_id: item.app_id,
			execution_result: item.execution_result,
			execution_time: item.execution_time,
			status: item.status,
			timestamp: item.created_at,
		}));
	}

	// Performance metrics
	async savePerformanceMetric(metricName: string, metricValue: number, appId?: string): Promise<{ success: boolean; id: string }> {
		const id = this.getAppId(appId);
		const response = await fetch(`${this.baseUrl}/apps/${id}/data`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				dataType: 'performance_metric',
				content: JSON.stringify({
					metric_name: metricName,
					metric_value: metricValue,
				}),
			}),
		});
		if (!response.ok) throw new Error('Failed to save performance metric');
		return response.json();
	}

	async getPerformanceMetrics(appId?: string): Promise<PerformanceMetric[]> {
		const id = this.getAppId(appId);
		const response = await fetch(`${this.baseUrl}/apps/${id}/data?type=performance_metric`);
		if (!response.ok) throw new Error('Failed to get performance metrics');
		const data = await response.json();
		return data.map((item: Record<string, unknown>) => {
			const content = JSON.parse(item.content as string);
			return {
				id: item.id,
				app_id: item.app_id,
				metric_name: content.metric_name,
				metric_value: content.metric_value,
				timestamp: item.created_at,
			};
		});
	}

	// Batch operations
	async saveAppExecution(appData: {
		userInput: Record<string, unknown>;
		executionResult: string;
		executionTime: number;
		status: 'success' | 'error' | 'pending';
		appId?: string;
	}): Promise<void> {
		const appId = appData.appId;
		await Promise.all([
			this.saveUserInput(appData.userInput, appId),
			this.recordExecution(appData.executionResult, appData.executionTime, appData.status, appId),
			this.savePerformanceMetric('execution_time_ms', appData.executionTime, appId),
		]);
	}
}

export const databaseClient = new DatabaseClient();
