import { DurableObject } from 'cloudflare:workers';

export class GlobalDurableObject extends DurableObject {
	private ctx: DurableObjectState;
	private env: Env;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx);
		this.ctx = ctx;
		this.env = env;
	}

	async initialize() {
		await this.ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				email TEXT UNIQUE NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`);

		await this.ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS products (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				description TEXT,
				price REAL NOT NULL,
				stock INTEGER DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`);

		await this.ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS orders (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				product_id INTEGER NOT NULL,
				quantity INTEGER NOT NULL,
				total_price REAL NOT NULL,
				status TEXT DEFAULT 'pending',
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (user_id) REFERENCES users(id),
				FOREIGN KEY (product_id) REFERENCES products(id)
			)
		`);
	}

	async addUser(name: string, email: string) {
		try {
			await this.ctx.storage.sql.exec(
				'INSERT INTO users (name, email) VALUES (?, ?)',
				[name, email]
			);
			return { success: true, message: 'User added successfully' };
		} catch (error) {
			return { success: false, error: (error as Error).message };
		}
	}

	async getUsers() {
		try {
			const rows = this.ctx.storage.sql
				.exec('SELECT * FROM users ORDER BY created_at DESC')
				.toArray();
			return { success: true, data: rows };
		} catch (error) {
			return { success: false, error: (error as Error).message };
		}
	}

	async getUserById(id: number) {
		try {
			const rows = this.ctx.storage.sql
				.exec('SELECT * FROM users WHERE id = ?', [id])
				.toArray();
			return { success: true, data: rows[0] || null };
		} catch (error) {
			return { success: false, error: (error as Error).message };
		}
	}

	async addProduct(name: string, description: string, price: number, stock: number) {
		try {
			await this.ctx.storage.sql.exec(
				'INSERT INTO products (name, description, price, stock) VALUES (?, ?, ?, ?)',
				[name, description, price, stock]
			);
			return { success: true, message: 'Product added successfully' };
		} catch (error) {
			return { success: false, error: (error as Error).message };
		}
	}

	async getProducts() {
		try {
			const rows = this.ctx.storage.sql
				.exec('SELECT * FROM products ORDER BY created_at DESC')
				.toArray();
			return { success: true, data: rows };
		} catch (error) {
			return { success: false, error: (error as Error).message };
		}
	}

	async getProductById(id: number) {
		try {
			const rows = this.ctx.storage.sql
				.exec('SELECT * FROM products WHERE id = ?', [id])
				.toArray();
			return { success: true, data: rows[0] || null };
		} catch (error) {
			return { success: false, error: (error as Error).message };
		}
	}

	async createOrder(userId: number, productId: number, quantity: number) {
		try {
			const product = this.ctx.storage.sql
				.exec('SELECT price, stock FROM products WHERE id = ?', [productId])
				.toArray()[0];

			if (!product) {
				return { success: false, error: 'Product not found' };
			}

			if (product.stock < quantity) {
				return { success: false, error: 'Insufficient stock' };
			}

			const totalPrice = product.price * quantity;

			await this.ctx.storage.sql.exec(
				'INSERT INTO orders (user_id, product_id, quantity, total_price) VALUES (?, ?, ?, ?)',
				[userId, productId, quantity, totalPrice]
			);

			await this.ctx.storage.sql.exec(
				'UPDATE products SET stock = stock - ? WHERE id = ?',
				[quantity, productId]
			);

			return { success: true, message: 'Order created successfully' };
		} catch (error) {
			return { success: false, error: (error as Error).message };
		}
	}

	async getOrders(userId?: number) {
		try {
			let query = `
				SELECT o.*, u.name as user_name, p.name as product_name, p.price
				FROM orders o
				JOIN users u ON o.user_id = u.id
				JOIN products p ON o.product_id = p.id
			`;
			const params: any[] = [];

			if (userId) {
				query += ' WHERE o.user_id = ?';
				params.push(userId);
			}

			query += ' ORDER BY o.created_at DESC';

			const rows = this.ctx.storage.sql.exec(query, params).toArray();
			return { success: true, data: rows };
		} catch (error) {
			return { success: false, error: (error as Error).message };
		}
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const method = request.method;

		try {
			// Initialize tables on first request
			if (url.pathname === '/init') {
				await this.initialize();
				return Response.json({ success: true, message: 'Database initialized' });
			}

			// Users endpoints
			if (url.pathname === '/users' && method === 'GET') {
				const result = await this.getUsers();
				return Response.json(result);
			}

			if (url.pathname === '/users' && method === 'POST') {
				const { name, email } = await request.json() as { name: string; email: string };
				const result = await this.addUser(name, email);
				return Response.json(result);
			}

			if (url.pathname.match(/^\/users\/\d+$/) && method === 'GET') {
				const id = parseInt(url.pathname.split('/')[2]);
				const result = await this.getUserById(id);
				return Response.json(result);
			}

			// Products endpoints
			if (url.pathname === '/products' && method === 'GET') {
				const result = await this.getProducts();
				return Response.json(result);
			}

			if (url.pathname === '/products' && method === 'POST') {
				const { name, description, price, stock } = await request.json() as {
					name: string;
					description: string;
					price: number;
					stock: number;
				};
				const result = await this.addProduct(name, description, price, stock);
				return Response.json(result);
			}

			if (url.pathname.match(/^\/products\/\d+$/) && method === 'GET') {
				const id = parseInt(url.pathname.split('/')[2]);
				const result = await this.getProductById(id);
				return Response.json(result);
			}

			// Orders endpoints
			if (url.pathname === '/orders' && method === 'GET') {
				const userId = url.searchParams.get('userId');
				const result = await this.getOrders(userId ? parseInt(userId) : undefined);
				return Response.json(result);
			}

			if (url.pathname === '/orders' && method === 'POST') {
				const { userId, productId, quantity } = await request.json() as {
					userId: number;
					productId: number;
					quantity: number;
				};
				const result = await this.createOrder(userId, productId, quantity);
				return Response.json(result);
			}

			return Response.json({ error: 'Not found' }, { status: 404 });
		} catch (error) {
			return Response.json(
				{ error: (error as Error).message },
				{ status: 500 }
			);
		}
	}
}
