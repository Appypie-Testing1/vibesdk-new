import { useEffect } from 'react';
import { appEvents } from '@/lib/app-events';
import { databaseClient } from '@/lib/database-client';
import { useAuth } from '@/contexts/auth-context';

/**
 * Hook that automatically initializes database when an app is created
 * Listens for app-created events and sets up the database for that app
 */
export function useAppDatabaseInit() {
	const { user } = useAuth();

	useEffect(() => {
		// Listen for app creation events
		const unsubscribe = appEvents.on('app-created', async (event) => {
			if (!user || event.type !== 'app-created') return;

			try {
				// Set the app ID for the database client
				databaseClient.setAppId(event.appId);

				// Initialize the database for this app
				await databaseClient.initializeDatabase();

				// Create app metadata in database
				await databaseClient.createApp({
					id: event.appId,
					name: event.data?.title || 'Untitled App',
					description: event.data?.description,
					prompt: event.data?.description || '',
					created_by: user.id,
					config: {
						visibility: event.data?.visibility || 'private',
						isForked: event.data?.isForked || false,
					},
				});

				console.log(`[Database] App ${event.appId} initialized successfully`);
			} catch (error) {
				console.error(`[Database] Failed to initialize app ${event.appId}:`, error);
				// Don't throw - this is a background operation
			}
		});

		return unsubscribe;
	}, [user]);
}
