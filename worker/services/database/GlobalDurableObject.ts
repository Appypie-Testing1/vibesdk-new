import { DurableObject } from 'cloudflare:workers';

export class GlobalDurableObject extends DurableObject {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async initialize() {
		await this.ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS prompt_apps (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				description TEXT,
				prompt TEXT NOT NULL,
				created_by TEXT NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				is_published INTEGER DEFAULT 0,
				config JSON
			)
		`);

		await this.ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS app_data (
				id TEXT PRIMARY KEY,
				app_id TEXT NOT NULL,
				data_type TEXT NOT NULL,
				content TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (app_id) REFERENCES prompt_apps(id)
			)
		`);

		await this.ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS app_executions (
				id TEXT PRIMARY KEY,
				app_id TEXT NOT NULL,
				execution_result TEXT,
				execution_time INTEGER,
				status TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (app_id) REFERENCES prompt_apps(id)
			)
		`);
	}

	async createApp(appData: {
		id: string;
		name: string;
		description?: string;
		prompt: string;
		created_by: string;
		config?: Record<string, unknown>;
	}) {
		await this.ctx.storage.sql.exec(
			`INSERT INTO prompt_apps (id, name, description, prompt, created_by, config)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[
				appData.id,
				appData.name,
				appData.description || null,
				appData.prompt,
				appData.created_by,
				appData.config ? JSON.stringify(appData.config) : null,
			]
		);
		return { success: true, id: appData.id };
	}

	async getApp(appId: string) {
		const result = this.ctx.storage.sql
			.exec('SELECT * FROM prompt_apps WHERE id = ?', [appId])
			.toArray();
		return result.length > 0 ? result[0] : null;
	}

	async getAllApps(userId: string) {
		const result = this.ctx.storage.sql
			.exec('SELECT * FROM prompt_apps WHERE created_by = ? ORDER BY created_at DESC', [userId])
			.toArray();
		return result;
	}

	async updateApp(appId: string, updates: Partial<{
		name: string;
		description: string;
		prompt: string;
		is_published: number;
		config: Record<string, unknown>;
	}>) {
		const fields = [];
		const values = [];

		if (updates.name !== undefined) {
			fields.push('name = ?');
			values.push(updates.name);
		}
		if (updates.description !== undefined) {
			fields.push('description = ?');
			values.push(updates.description);
		}
		if (updates.prompt !== undefined) {
			fields.push('prompt = ?');
			values.push(updates.prompt);
		}
		if (updates.is_published !== undefined) {
			fields.push('is_published = ?');
			values.push(updates.is_published);
		}
		if (updates.config !== undefined) {
			fields.push('config = ?');
			values.push(JSON.stringify(updates.config));
		}

		fields.push('updated_at = CURRENT_TIMESTAMP');
		values.push(appId);

		if (fields.length > 1) {
			await this.ctx.storage.sql.exec(
				`UPDATE prompt_apps SET ${fields.join(', ')} WHERE id = ?`,
				values
			);
		}

		return { success: true };
	}

	async deleteApp(appId: string) {
		await this.ctx.storage.sql.exec('DELETE FROM app_executions WHERE app_id = ?', [appId]);
		await this.ctx.storage.sql.exec('DELETE FROM app_data WHERE app_id = ?', [appId]);
		await this.ctx.storage.sql.exec('DELETE FROM prompt_apps WHERE id = ?', [appId]);
		return { success: true };
	}

	async saveAppData(appId: string, dataType: string, content: string) {
		const id = `${appId}-${dataType}-${Date.now()}`;
		await this.ctx.storage.sql.exec(
			`INSERT INTO app_data (id, app_id, data_type, content) VALUES (?, ?, ?, ?)`,
			[id, appId, dataType, content]
		);
		return { success: true, id };
	}

	async getAppData(appId: string, dataType?: string) {
		let query = 'SELECT * FROM app_data WHERE app_id = ?';
		const params: unknown[] = [appId];

		if (dataType) {
			query += ' AND data_type = ?';
			params.push(dataType);
		}

		query += ' ORDER BY created_at DESC';

		const result = this.ctx.storage.sql.exec(query, params).toArray();
		return result;
	}

	async recordExecution(appId: string, executionResult: string, executionTime: number, status: string) {
		const id = `exec-${appId}-${Date.now()}`;
		await this.ctx.storage.sql.exec(
			`INSERT INTO app_executions (id, app_id, execution_result, execution_time, status)
			 VALUES (?, ?, ?, ?, ?)`,
			[id, appId, executionResult, executionTime, status]
		);
		return { success: true, id };
	}

	async getExecutions(appId: string, limit: number = 10) {
		const result = this.ctx.storage.sql
			.exec(
				'SELECT * FROM app_executions WHERE app_id = ? ORDER BY created_at DESC LIMIT ?',
				[appId, limit]
			)
			.toArray();
		return result;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const pathname = url.pathname;

		try {
			// Initialize database on first request
			if (pathname === '/init') {
				await this.initialize();
				return new Response(JSON.stringify({ success: true, message: 'Database initialized' }), {
					headers: { 'Content-Type': 'application/json' },
				});
			}

			// Parse request body if needed
			let body: Record<string, unknown> | null = null;
			if (request.method !== 'GET') {
				body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
			}

			// App CRUD operations
			if (pathname === '/apps' && request.method === 'POST') {
				const result = await this.createApp(body as Parameters<typeof this.createApp>[0]);
				return new Response(JSON.stringify(result), {
					headers: { 'Content-Type': 'application/json' },
				});
			}

			if (pathname.startsWith('/apps/') && request.method === 'GET') {
				const appId = pathname.split('/')[2];
				const app = await this.getApp(appId);
				return new Response(JSON.stringify(app || { error: 'App not found' }), {
					headers: { 'Content-Type': 'application/json' },
					status: app ? 200 : 404,
				});
			}

			if (pathname === '/apps' && request.method === 'GET') {
				const userId = url.searchParams.get('userId');
				if (!userId) {
					return new Response(JSON.stringify({ error: 'userId required' }), {
						headers: { 'Content-Type': 'application/json' },
						status: 400,
					});
				}
				const apps = await this.getAllApps(userId);
				return new Response(JSON.stringify(apps), {
					headers: { 'Content-Type': 'application/json' },
				});
			}

			if (pathname.startsWith('/apps/') && request.method === 'PUT') {
				const appId = pathname.split('/')[2];
				const result = await this.updateApp(appId, body as Parameters<typeof this.updateApp>[1]);
				return new Response(JSON.stringify(result), {
					headers: { 'Content-Type': 'application/json' },
				});
			}

			if (pathname.startsWith('/apps/') && request.method === 'DELETE') {
				const appId = pathname.split('/')[2];
				const result = await this.deleteApp(appId);
				return new Response(JSON.stringify(result), {
					headers: { 'Content-Type': 'application/json' },
				});
			}

			// App data operations
			if (pathname.startsWith('/apps/') && pathname.includes('/data')) {
				const appId = pathname.split('/')[2];

				if (request.method === 'POST') {
					const result = await this.saveAppData(appId, body?.dataType as string, body?.content as string);
					return new Response(JSON.stringify(result), {
						headers: { 'Content-Type': 'application/json' },
					});
				}

				if (request.method === 'GET') {
					const dataType = url.searchParams.get('type');
					const data = await this.getAppData(appId, dataType || undefined);
					return new Response(JSON.stringify(data), {
						headers: { 'Content-Type': 'application/json' },
					});
				}
			}

			// Execution operations
			if (pathname.startsWith('/apps/') && pathname.includes('/executions')) {
				const appId = pathname.split('/')[2];

				if (request.method === 'POST') {
					const result = await this.recordExecution(
						appId,
						body?.executionResult as string,
						body?.executionTime as number,
						body?.status as string
					);
					return new Response(JSON.stringify(result), {
						headers: { 'Content-Type': 'application/json' },
					});
				}

				if (request.method === 'GET') {
					const limit = parseInt(url.searchParams.get('limit') || '10');
					const executions = await this.getExecutions(appId, limit);
					return new Response(JSON.stringify(executions), {
						headers: { 'Content-Type': 'application/json' },
					});
				}
			}

			return new Response(JSON.stringify({ error: 'Not found' }), {
				headers: { 'Content-Type': 'application/json' },
				status: 404,
			});
		} catch (error) {
			console.error('GlobalDurableObject error:', error);
			return new Response(
				JSON.stringify({
					error: 'Internal server error',
					message: error instanceof Error ? error.message : 'Unknown error',
				}),
				{
					headers: { 'Content-Type': 'application/json' },
					status: 500,
				}
			);
		}
	}
}
