import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';

export function setupDatabaseRoutes(app: Hono<AppEnv>) {
	// Initialize database
	app.post('/api/db/init', async (c) => {
		try {
			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);
			const response = await stub.fetch(new Request('http://do/init'));
			const data = await response.json();
			return c.json(data);
		} catch (error) {
			return c.json({ error: (error as Error).message }, 500);
		}
	});

	// Users endpoints
	app.get('/api/db/users', async (c) => {
		try {
			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);
			const response = await stub.fetch(new Request('http://do/users'));
			const data = await response.json();
			return c.json(data);
		} catch (error) {
			return c.json({ error: (error as Error).message }, 500);
		}
	});

	app.post('/api/db/users', async (c) => {
		try {
			const body = await c.req.json();
			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);
			const response = await stub.fetch(
				new Request('http://do/users', {
					method: 'POST',
					body: JSON.stringify(body),
				})
			);
			const data = await response.json();
			return c.json(data);
		} catch (error) {
			return c.json({ error: (error as Error).message }, 500);
		}
	});

	app.get('/api/db/users/:id', async (c) => {
		try {
			const userId = c.req.param('id');
			const doId = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(doId);
			const response = await stub.fetch(new Request(`http://do/users/${userId}`));
			const data = await response.json();
			return c.json(data);
		} catch (error) {
			return c.json({ error: (error as Error).message }, 500);
		}
	});

	// Products endpoints
	app.get('/api/db/products', async (c) => {
		try {
			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);
			const response = await stub.fetch(new Request('http://do/products'));
			const data = await response.json();
			return c.json(data);
		} catch (error) {
			return c.json({ error: (error as Error).message }, 500);
		}
	});

	app.post('/api/db/products', async (c) => {
		try {
			const body = await c.req.json();
			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);
			const response = await stub.fetch(
				new Request('http://do/products', {
					method: 'POST',
					body: JSON.stringify(body),
				})
			);
			const data = await response.json();
			return c.json(data);
		} catch (error) {
			return c.json({ error: (error as Error).message }, 500);
		}
	});

	app.get('/api/db/products/:id', async (c) => {
		try {
			const productId = c.req.param('id');
			const doId = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(doId);
			const response = await stub.fetch(new Request(`http://do/products/${productId}`));
			const data = await response.json();
			return c.json(data);
		} catch (error) {
			return c.json({ error: (error as Error).message }, 500);
		}
	});

	// Orders endpoints
	app.get('/api/db/orders', async (c) => {
		try {
			const userId = c.req.query('userId');
			const url = userId ? `http://do/orders?userId=${userId}` : 'http://do/orders';
			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);
			const response = await stub.fetch(new Request(url));
			const data = await response.json();
			return c.json(data);
		} catch (error) {
			return c.json({ error: (error as Error).message }, 500);
		}
	});

	app.post('/api/db/orders', async (c) => {
		try {
			const body = await c.req.json();
			const id = c.env.GlobalDurableObject.idFromName('global');
			const stub = c.env.GlobalDurableObject.get(id);
			const response = await stub.fetch(
				new Request('http://do/orders', {
					method: 'POST',
					body: JSON.stringify(body),
				})
			);
			const data = await response.json();
			return c.json(data);
		} catch (error) {
			return c.json({ error: (error as Error).message }, 500);
		}
	});
}
