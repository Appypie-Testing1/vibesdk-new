---
name: add-api-endpoint
description: Scaffold a complete API endpoint following the vibesdk pattern (types, api-client, service, controller, route)
---

# Add API Endpoint

Scaffolds a new API endpoint across all layers of the stack.

## Gather Requirements

Before writing any code, ask the user:
1. What is the endpoint path? (e.g., `/api/projects/:id/export`)
2. What HTTP method? (GET, POST, PUT, DELETE, PATCH)
3. Is it authenticated? (most are -- check if it needs `context.user`)
4. Is it database-backed? (needs a service in `worker/database/services/`)
5. What is the request body shape? (for POST/PUT/PATCH)
6. What is the response data shape?

## Steps

### 1. Define Types

**File:** `src/api-types.ts`

Add the response data type as a re-export. If the type is specific to this endpoint, create it in a `types.ts` file alongside the controller:

```
worker/api/controllers/<domain>/types.ts
```

Then re-export from `src/api-types.ts`:
```typescript
export type { MyNewData } from 'worker/api/controllers/<domain>/types';
```

### 2. Create Database Service (if DB-backed)

**File:** `worker/database/services/<Name>Service.ts`

Follow the pattern:
```typescript
import { BaseService } from './BaseService';
import * as schema from '../schema';
import { eq } from 'drizzle-orm';

export class MyService extends BaseService {
  async getItem(id: string) {
    return this.db.select().from(schema.myTable).where(eq(schema.myTable.id, id));
  }
}
```

### 3. Create Controller

**File:** `worker/api/controllers/<domain>/controller.ts`

Follow the pattern:
```typescript
import { BaseController } from '../baseController';
import type { ApiResponse, ControllerResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import type { MyNewData } from './types';
import { createLogger } from '../../../logger';

export class MyController extends BaseController {
  static logger = createLogger('MyController');

  static async getItem(
    _request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext
  ): Promise<ControllerResponse<ApiResponse<MyNewData>>> {
    try {
      const user = context.user!;
      // ... service call ...
      return MyController.createSuccessResponse(data);
    } catch (error) {
      this.logger.error('Error:', error);
      return MyController.createErrorResponse<MyNewData>('Failed', 500);
    }
  }
}
```

### 4. Create Route

**File:** `worker/api/routes/<domain>Routes.ts`

```typescript
import { Hono } from 'hono';
import type { AppEnv } from '../../types/appenv';
import { MyController } from '../controllers/<domain>/controller';

export function setupMyRoutes(app: Hono<AppEnv>): void {
  app.get('/api/my-endpoint', async (c) => {
    const response = await MyController.getItem(c.req.raw, c.env, c.executionCtx, c.get('routeContext'));
    return c.json(response.body, response.status);
  });
}
```

### 5. Register Route

**File:** `worker/api/routes/index.ts`

Add import and call in `setupRoutes()`:
```typescript
import { setupMyRoutes } from './myRoutes';
// ... inside setupRoutes():
setupMyRoutes(app);
```

### 6. Add API Client Method

**File:** `src/lib/api-client.ts`

```typescript
async getMyItem(id: string): Promise<ApiResponse<MyNewData>> {
  return this.request<MyNewData>(`/api/my-endpoint/${id}`);
}
```

### 7. Verify

Run: `bun run typecheck`
Expected: No type errors.
