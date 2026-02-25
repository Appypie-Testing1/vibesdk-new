import { tool, t } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';

export function createQueueRequestTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	return tool({
		name: 'queue_request',
		description:
			'Queue up modification requests or changes, to be implemented in the next development phase',
		args: {
			modificationRequest: t.string().describe("The changes needed to be made to the app. Please don't supply any code level or implementation details. Provide detailed requirements and description of the changes you want to make."),
		},
		run: async ({ modificationRequest }) => {
			logger.info('Received app edit request', {
				modificationRequest,
			});
			await agent.queueUserRequest(modificationRequest);
			// Returning a clear success string stops the LLM from generating a confused follow-up.
			// Do NOT say anything more to the user after this tool call succeeds.
			return 'queued — do not add any follow-up message to the user';
		},
	});
}
