import { FileOutputType } from "../schemas";

const MAX_VISIBLE_LINES = 300;
const HEAD_LINES = 30;
const TAIL_LINES = 30;

const CONFIG_FILES = [
    'wrangler.jsonc',
    'tsconfig.json',
    'vite.config.ts',
    'tailwind.config.ts',
    'tailwind.config.js',
    'postcss.config.js',
    'postcss.config.ts',
];

function isConfigFile(filePath: string): boolean {
    const lowerPath = filePath.toLowerCase();
    return CONFIG_FILES.some(cfg => lowerPath.endsWith(cfg));
}

export function getCodebaseContext(allFiles: FileOutputType[]): FileOutputType[] {
    return allFiles
        .filter(file => {
            const lowerPath = file.filePath.toLowerCase();
            return !lowerPath.endsWith('readme.md') &&
                   !lowerPath.endsWith('.bootstrap.js');
        })
        .map(file => {
            // Redact config files (LLM doesn't need their contents for code generation)
            // package.json is kept visible since the LLM needs dependency info
            if (isConfigFile(file.filePath)) {
                return { ...file, fileContents: '[CONFIG FILE - not shown]' };
            }

            // Truncate large files to reduce context bloat in later phases
            const lines = file.fileContents.split('\n');
            if (lines.length > MAX_VISIBLE_LINES) {
                const truncated = [
                    ...lines.slice(0, HEAD_LINES),
                    `\n// ... ${lines.length - HEAD_LINES - TAIL_LINES} lines truncated ...\n`,
                    ...lines.slice(-TAIL_LINES)
                ].join('\n');
                return { ...file, fileContents: truncated };
            }

            return file;
        });
}