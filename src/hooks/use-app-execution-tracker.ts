import { useEffect, useRef } from 'react';
import { databaseClient } from '@/lib/database-client';
import { detectAppId } from '@/lib/app-id-detector';

/**
 * Hook that automatically tracks and saves app execution data
 * Monitors WebSocket messages for execution results and saves them to the database
 */
export function useAppExecutionTracker(
	chatId: string | undefined,
	websocket: any,
	messages: any[]
) {
	const lastSavedMessageCountRef = useRef(0);
	const executionStartTimeRef = useRef<number | null>(null);

	useEffect(() => {
		if (!chatId || !websocket || messages.length === 0) return;

		// Only process new messages
		const newMessages = messages.slice(lastSavedMessageCountRef.current);
		if (newMessages.length === 0) return;

		lastSavedMessageCountRef.current = messages.length;

		// Look for execution results in messages
		newMessages.forEach((message) => {
			// Track when execution starts
			if (message.conversationId === 'main' && message.content?.includes('generating')) {
				executionStartTimeRef.current = Date.now();
			}

			// Save execution results when we get a completion message
			if (
				message.role === 'assistant' &&
				(message.conversationId === 'generation-complete' ||
					message.conversationId === 'core_app_complete' ||
					message.content?.includes('complete'))
			) {
				const executionTime = executionStartTimeRef.current
					? Date.now() - executionStartTimeRef.current
					: 0;

				// Save execution data to database
				saveExecutionData(chatId, message.content, executionTime);
				executionStartTimeRef.current = null;
			}
		});
	}, [chatId, websocket, messages]);
}

/**
 * Save execution data to the database
 */
async function saveExecutionData(
	appId: string,
	executionResult: string,
	executionTime: number
) {
	try {
		// Set the app ID for the database client
		databaseClient.setAppId(appId);

		// Save the execution
		await databaseClient.recordExecution(
			executionResult,
			executionTime,
			'success'
		);

		// Save performance metric
		await databaseClient.savePerformanceMetric(
			'execution_time_ms',
			executionTime
		);

		console.log(`[Database] Execution saved for app ${appId}: ${executionTime}ms`);
	} catch (error) {
		console.error(`[Database] Failed to save execution for app ${appId}:`, error);
		// Don't throw - this is a background operation
	}
}
