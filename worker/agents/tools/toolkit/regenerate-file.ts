import { tool, t, ErrorResult } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';

export type RegenerateFileResult =
	| { path: string; diff: string }
	| ErrorResult;

export function createRegenerateFileTool(
	agent: ICodingAgent,
	logger: StructuredLogger,
) {
	return tool({
		name: 'regenerate_file',
		description:
			`Autonomous AI agent that applies surgical fixes to code files. Takes file path and array of specific issues to fix. Returns diff showing changes made. Changes are automatically deployed to the preview after successful edit.

CRITICAL RULES:
- Each issue MUST be specific and surgical (e.g. "Change bg-orange-500 to bg-green-500 in the header div" NOT "change colors to green").
- NEVER include issues that rewrite large sections, restructure components, or remove/modify data arrays, mock data, or content.
- For color/style changes: specify the exact old value and exact new value.
- One small targeted change per issue string. Multiple small issues are safer than one broad issue.
- These are implemented by an independent LLM AI agent that only sees the file and your issues -- vague issues cause data loss.`,
		args: {
			path: t.file.write().describe('Relative path to file from project root'),
			issues: t.array(t.string()).describe('Specific, detailed issues to fix in the file'),
		},
		run: async ({ path, issues }) => {
			try {
				logger.info('Regenerating file', {
					path,
					issuesCount: issues.length,
				});
				return await agent.regenerateFileByPath(path, issues);
			} catch (error) {
				return {
					error:
						error instanceof Error
							? `Failed to regenerate file: ${error.message}`
							: 'Unknown error occurred while regenerating file',
				};
			}
		},
	});
}
