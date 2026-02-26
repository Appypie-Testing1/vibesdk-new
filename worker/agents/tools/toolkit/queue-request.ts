import { tool, t } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';

export function createQueueRequestTool(
	agent: ICodingAgent,
	logger: StructuredLogger,
	imageUrls?: string[]
) {
	return tool({
		name: 'queue_request',
		description:
			'Queue up modification requests or changes, to be implemented in the next development phase',
		args: {
			modificationRequest: t.string().describe("The changes needed to be made to the app. Please don't supply any code level or implementation details. Provide detailed requirements and description of the changes you want to make."),
		},
		run: async ({ modificationRequest }) => {
			// Auto-append image URLs so the implementation agent always has them,
			// even if the conversational AI forgot to include them in the request text.
			let fullRequest = modificationRequest;
			if (imageUrls && imageUrls.length > 0) {
				const urlList = imageUrls.map(u => `- ${u}`).join('\n');
				fullRequest = `${modificationRequest}\n\nUploaded image URLs to embed in code (use these exact URLs as src/href/background-image values):\n${urlList}`;
			}
			logger.info('Received app edit request', {
				modificationRequest: fullRequest,
			});
			await agent.queueUserRequest(fullRequest);
			return 'queued';
		},
	});
}
