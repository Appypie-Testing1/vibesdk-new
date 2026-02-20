import { useState, useEffect } from 'react';
import { Plus, Trash2, ShoppingCart, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface User {
	id: number;
	name: string;
	email: string;
	created_at: string;
}

interface Product {
	id: number;
	name: string;
	description: string;
	price: number;
	stock: number;
	created_at: string;
}

interface Order {
	id: number;
	user_id: number;
	product_id: number;
	quantity: number;
	total_price: number;
	status: string;
	user_name: string;
	product_name: string;
	created_at: string;
}

export function DatabaseWebsite() {
	const [activeTab, setActiveTab] = useState<'users' | 'products' | 'orders'>('products');
	const [users, setUsers] = useState<User[]>([]);
	const [products, setProducts] = useState<Product[]>([]);
	const [orders, setOrders] = useState<Order[]>([]);
	const [loading, setLoading] = useState(false);

	// Form states
	const [newUser, setNewUser] = useState({ name: '', email: '' });
	const [newProduct, setNewProduct] = useState({ name: '', description: '', price: 0, stock: 0 });
	const [newOrder, setNewOrder] = useState({ userId: 0, productId: 0, quantity: 1 });

	// Initialize database
	useEffect(() => {
		const initDb = async () => {
			try {
				await fetch('/api/db/init', { method: 'POST' });
				fetchProducts();
			} catch (error) {
				console.error('Failed to initialize database:', error);
			}
		};
		initDb();
	}, []);

	// Fetch functions
	const fetchUsers = async () => {
		setLoading(true);
		try {
			const response = await fetch('/api/db/users');
			const data = await response.json();
			setUsers(data.data || []);
		} catch (error) {
			console.error('Failed to fetch users:', error);
		}
		setLoading(false);
	};

	const fetchProducts = async () => {
		setLoading(true);
		try {
			const response = await fetch('/api/db/products');
			const data = await response.json();
			setProducts(data.data || []);
		} catch (error) {
			console.error('Failed to fetch products:', error);
		}
		setLoading(false);
	};

	const fetchOrders = async () => {
		setLoading(true);
		try {
			const response = await fetch('/api/db/orders');
			const data = await response.json();
			setOrders(data.data || []);
		} catch (error) {
			console.error('Failed to fetch orders:', error);
		}
		setLoading(false);
	};

	// Add functions
	const handleAddUser = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			await fetch('/api/db/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newUser),
			});
			setNewUser({ name: '', email: '' });
			fetchUsers();
		} catch (error) {
			console.error('Failed to add user:', error);
		}
	};

	const handleAddProduct = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			await fetch('/api/db/products', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newProduct),
			});
			setNewProduct({ name: '', description: '', price: 0, stock: 0 });
			fetchProducts();
		} catch (error) {
			console.error('Failed to add product:', error);
		}
	};

	const handleCreateOrder = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			await fetch('/api/db/orders', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newOrder),
			});
			setNewOrder({ userId: 0, productId: 0, quantity: 1 });
			fetchOrders();
		} catch (error) {
			console.error('Failed to create order:', error);
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
			<div className="max-w-6xl mx-auto">
				{/* Header */}
				<div className="mb-8">
					<h1 className="text-4xl font-bold text-gray-900 mb-2">Database-Connected Website</h1>
					<p className="text-gray-600">Full-stack e-commerce platform with Durable Object SQLite integration</p>
				</div>

				{/* Tabs */}
				<div className="flex gap-4 mb-8">
					<button
						onClick={() => {
							setActiveTab('products');
							fetchProducts();
						}}
						className={`px-6 py-2 rounded-lg font-medium transition-colors ${
							activeTab === 'products'
								? 'bg-indigo-600 text-white'
								: 'bg-white text-gray-700 hover:bg-gray-50'
						}`}
					>
						<ShoppingCart className="inline mr-2 h-4 w-4" />
						Products
					</button>
					<button
						onClick={() => {
							setActiveTab('users');
							fetchUsers();
						}}
						className={`px-6 py-2 rounded-lg font-medium transition-colors ${
							activeTab === 'users'
								? 'bg-indigo-600 text-white'
								: 'bg-white text-gray-700 hover:bg-gray-50'
						}`}
					>
						<Users className="inline mr-2 h-4 w-4" />
						Users
					</button>
					<button
						onClick={() => {
							setActiveTab('orders');
							fetchOrders();
						}}
						className={`px-6 py-2 rounded-lg font-medium transition-colors ${
							activeTab === 'orders'
								? 'bg-indigo-600 text-white'
								: 'bg-white text-gray-700 hover:bg-gray-50'
						}`}
					>
						Orders
					</button>
				</div>

				{/* Products Tab */}
				{activeTab === 'products' && (
					<div className="space-y-6">
						{/* Add Product Form */}
						<div className="bg-white rounded-lg shadow-lg p-6">
							<h2 className="text-2xl font-bold mb-4">Add New Product</h2>
							<form onSubmit={handleAddProduct} className="space-y-4">
								<div className="grid grid-cols-2 gap-4">
									<input
										type="text"
										placeholder="Product Name"
										value={newProduct.name}
										onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
										className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
										required
									/>
									<input
										type="text"
										placeholder="Description"
										value={newProduct.description}
										onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
										className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
									/>
									<input
										type="number"
										placeholder="Price"
										value={newProduct.price}
										onChange={(e) => setNewProduct({ ...newProduct, price: parseFloat(e.target.value) })}
										className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
										required
									/>
									<input
										type="number"
										placeholder="Stock"
										value={newProduct.stock}
										onChange={(e) => setNewProduct({ ...newProduct, stock: parseInt(e.target.value) })}
										className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
										required
									/>
								</div>
								<Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">
									<Plus className="mr-2 h-4 w-4" />
									Add Product
								</Button>
							</form>
						</div>

						{/* Products List */}
						<div className="bg-white rounded-lg shadow-lg p-6">
							<h2 className="text-2xl font-bold mb-4">Products ({products.length})</h2>
							{loading ? (
								<p className="text-gray-500">Loading...</p>
							) : products.length === 0 ? (
								<p className="text-gray-500">No products yet. Add one to get started!</p>
							) : (
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
									{products.map((product) => (
										<div key={product.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
											<h3 className="font-bold text-lg mb-2">{product.name}</h3>
											<p className="text-gray-600 text-sm mb-2">{product.description}</p>
											<div className="flex justify-between items-center">
												<span className="text-indigo-600 font-bold">${product.price.toFixed(2)}</span>
												<span className="text-sm text-gray-500">Stock: {product.stock}</span>
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					</div>
				)}

				{/* Users Tab */}
				{activeTab === 'users' && (
					<div className="space-y-6">
						{/* Add User Form */}
						<div className="bg-white rounded-lg shadow-lg p-6">
							<h2 className="text-2xl font-bold mb-4">Add New User</h2>
							<form onSubmit={handleAddUser} className="space-y-4">
								<div className="grid grid-cols-2 gap-4">
									<input
										type="text"
										placeholder="Full Name"
										value={newUser.name}
										onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
										className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
										required
									/>
									<input
										type="email"
										placeholder="Email"
										value={newUser.email}
										onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
										className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
										required
									/>
								</div>
								<Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">
									<Plus className="mr-2 h-4 w-4" />
									Add User
								</Button>
							</form>
						</div>

						{/* Users List */}
						<div className="bg-white rounded-lg shadow-lg p-6">
							<h2 className="text-2xl font-bold mb-4">Users ({users.length})</h2>
							{loading ? (
								<p className="text-gray-500">Loading...</p>
							) : users.length === 0 ? (
								<p className="text-gray-500">No users yet. Add one to get started!</p>
							) : (
								<div className="overflow-x-auto">
									<table className="w-full">
										<thead className="bg-gray-50">
											<tr>
												<th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Name</th>
												<th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Email</th>
												<th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Joined</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-gray-200">
											{users.map((user) => (
												<tr key={user.id} className="hover:bg-gray-50">
													<td className="px-4 py-2 text-sm text-gray-900">{user.name}</td>
													<td className="px-4 py-2 text-sm text-gray-600">{user.email}</td>
													<td className="px-4 py-2 text-sm text-gray-500">
														{new Date(user.created_at).toLocaleDateString()}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</div>
					</div>
				)}

				{/* Orders Tab */}
				{activeTab === 'orders' && (
					<div className="space-y-6">
						{/* Create Order Form */}
						<div className="bg-white rounded-lg shadow-lg p-6">
							<h2 className="text-2xl font-bold mb-4">Create New Order</h2>
							<form onSubmit={handleCreateOrder} className="space-y-4">
								<div className="grid grid-cols-3 gap-4">
									<input
										type="number"
										placeholder="User ID"
										value={newOrder.userId}
										onChange={(e) => setNewOrder({ ...newOrder, userId: parseInt(e.target.value) })}
										className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
										required
									/>
									<input
										type="number"
										placeholder="Product ID"
										value={newOrder.productId}
										onChange={(e) => setNewOrder({ ...newOrder, productId: parseInt(e.target.value) })}
										className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
										required
									/>
									<input
										type="number"
										placeholder="Quantity"
										value={newOrder.quantity}
										onChange={(e) => setNewOrder({ ...newOrder, quantity: parseInt(e.target.value) })}
										className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
										required
									/>
								</div>
								<Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">
									<ShoppingCart className="mr-2 h-4 w-4" />
									Create Order
								</Button>
							</form>
						</div>

						{/* Orders List */}
						<div className="bg-white rounded-lg shadow-lg p-6">
							<h2 className="text-2xl font-bold mb-4">Orders ({orders.length})</h2>
							{loading ? (
								<p className="text-gray-500">Loading...</p>
							) : orders.length === 0 ? (
								<p className="text-gray-500">No orders yet. Create one to get started!</p>
							) : (
								<div className="overflow-x-auto">
									<table className="w-full">
										<thead className="bg-gray-50">
											<tr>
												<th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Order ID</th>
												<th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Customer</th>
												<th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Product</th>
												<th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Quantity</th>
												<th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Total</th>
												<th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Status</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-gray-200">
											{orders.map((order) => (
												<tr key={order.id} className="hover:bg-gray-50">
													<td className="px-4 py-2 text-sm font-medium text-gray-900">#{order.id}</td>
													<td className="px-4 py-2 text-sm text-gray-600">{order.user_name}</td>
													<td className="px-4 py-2 text-sm text-gray-600">{order.product_name}</td>
													<td className="px-4 py-2 text-sm text-gray-600">{order.quantity}</td>
													<td className="px-4 py-2 text-sm font-medium text-indigo-600">${order.total_price.toFixed(2)}</td>
													<td className="px-4 py-2 text-sm">
														<span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
															{order.status}
														</span>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
