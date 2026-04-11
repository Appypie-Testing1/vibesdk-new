---
name: add-llm-tool
description: Scaffold a new LLM tool for the agent system following the factory pattern
---

# Add LLM Tool

Scaffolds a new tool for the CodeGeneratorAgent's LLM tool system.

## Gather Requirements

Before writing any code, ask the user:
1. What does the tool do? (one-sentence description for the LLM)
2. What arguments does it take? (name, type, description for each)
3. What resources does it need? (file read/write, git commit, sandbox deploy)
4. Is it for conversation, debugger, or both?

## Steps

### 1. Create Tool File

**File:** `worker/agents/tools/toolkit/<tool-name>.ts`

Follow the factory pattern:

```typescript
import { tool, t, type Type, type } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { z } from 'zod';

export function create<ToolName>Tool(
  agent: ICodingAgent,
  logger: StructuredLogger
) {
  return tool({
    name: '<tool_name>',
    description: '<One sentence describing what this tool does and when to use it>',
    args: {
      // Define args using t.string(), t.number(), t.boolean(), or custom Type with Zod
      myArg: t.string().describe('Description of this argument'),
    },
    run: async ({ myArg }) => {
      logger.info(`Running <tool_name> with: ${myArg}`);

      // Implementation here
      // Access agent state: agent.state
      // Access agent methods: agent.someMethod()

      return { result: 'success' };
    },
  });
}
```

For tools that need resource declarations (file access, git, sandbox):

```typescript
const filePathType: Type<string> = type(
  z.string(),
  (path: string) => ({
    files: { mode: 'read', paths: [path] },
  })
);
```

### 2. Register in customTools.ts

**File:** `worker/agents/tools/customTools.ts`

Add import:
```typescript
import { create<ToolName>Tool } from './toolkit/<tool-name>';
```

Add to `buildTools()` (for conversation) and/or `buildDebugTools()` (for debugger):
```typescript
create<ToolName>Tool(agent, logger),
```

### 3. Verify

Run: `bun run typecheck`
Expected: No type errors.

## Reference

Existing tools to study for patterns:
- Simple tool: `worker/agents/tools/toolkit/read-files.ts`
- Tool with resource types: `worker/agents/tools/toolkit/regenerate-file.ts`
- Tool with state guards: `worker/agents/tools/toolkit/deep-debugger.ts`
