import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';

export function setupDatabaseRoutes(app: Hono<AppEnv>): void {
	// Initialize database
	app.post('/api/db/init', async (c) => {
		try {
			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);
			const response = await stub.fetch(new Request('http://do/init'));
			return response;
		} catch (error) {
			return c.json(
				{
					error: 'Failed to initialize database',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			);
		}
	});

	// Create app
	app.post('/api/db/apps', async (c) => {
		try {
			const body = await c.req.json();
			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);

			const response = await stub.fetch(new Request('http://do/apps', {
				method: 'POST',
				body: JSON.stringify(body),
				headers: { 'Content-Type': 'application/json' },
			}));

			return response;
		} catch (error) {
			return c.json(
				{
					error: 'Failed to create app',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			);
		}
	});

	// Get app
	app.get('/api/db/apps/:appId', async (c) => {
		try {
			const appId = c.req.param('appId');
			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);

			const response = await stub.fetch(new Request(`http://do/apps/${appId}`));
			return response;
		} catch (error) {
			return c.json(
				{
					error: 'Failed to get app',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			);
		}
	});

	// Get all apps for user
	app.get('/api/db/apps', async (c) => {
		try {
			const userId = c.req.query('userId');
			if (!userId) {
				return c.json({ error: 'userId query parameter required' }, 400);
			}

			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);

			const response = await stub.fetch(new Request(`http://do/apps?userId=${userId}`));
			return response;
		} catch (error) {
			return c.json(
				{
					error: 'Failed to get apps',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			);
		}
	});

	// Update app
	app.put('/api/db/apps/:appId', async (c) => {
		try {
			const appId = c.req.param('appId');
			const body = await c.req.json();
			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);

			const response = await stub.fetch(new Request(`http://do/apps/${appId}`, {
				method: 'PUT',
				body: JSON.stringify(body),
				headers: { 'Content-Type': 'application/json' },
			}));

			return response;
		} catch (error) {
			return c.json(
				{
					error: 'Failed to update app',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			);
		}
	});

	// Delete app
	app.delete('/api/db/apps/:appId', async (c) => {
		try {
			const appId = c.req.param('appId');
			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);

			const response = await stub.fetch(new Request(`http://do/apps/${appId}`, {
				method: 'DELETE',
			}));

			return response;
		} catch (error) {
			return c.json(
				{
					error: 'Failed to delete app',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			);
		}
	});

	// Save app data
	app.post('/api/db/apps/:appId/data', async (c) => {
		try {
			const appId = c.req.param('appId');
			const body = await c.req.json();
			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);

			const response = await stub.fetch(new Request(`http://do/apps/${appId}/data`, {
				method: 'POST',
				body: JSON.stringify(body),
				headers: { 'Content-Type': 'application/json' },
			}));

			return response;
		} catch (error) {
			return c.json(
				{
					error: 'Failed to save app data',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			);
		}
	});

	// Get app data
	app.get('/api/db/apps/:appId/data', async (c) => {
		try {
			const appId = c.req.param('appId');
			const dataType = c.req.query('type');
			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);

			let url = `http://do/apps/${appId}/data`;
			if (dataType) {
				url += `?type=${dataType}`;
			}

			const response = await stub.fetch(new Request(url));
			return response;
		} catch (error) {
			return c.json(
				{
					error: 'Failed to get app data',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			);
		}
	});

	// Record execution
	app.post('/api/db/apps/:appId/executions', async (c) => {
		try {
			const appId = c.req.param('appId');
			const body = await c.req.json();
			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);

			const response = await stub.fetch(new Request(`http://do/apps/${appId}/executions`, {
				method: 'POST',
				body: JSON.stringify(body),
				headers: { 'Content-Type': 'application/json' },
			}));

			return response;
		} catch (error) {
			return c.json(
				{
					error: 'Failed to record execution',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			);
		}
	});

	// Get executions
	app.get('/api/db/apps/:appId/executions', async (c) => {
		try {
			const appId = c.req.param('appId');
			const limit = c.req.query('limit') || '10';
			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);

			const response = await stub.fetch(
				new Request(`http://do/apps/${appId}/executions?limit=${limit}`)
			);
			return response;
		} catch (error) {
			return c.json(
				{
					error: 'Failed to get executions',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			);
		}
	});
}
