---
name: add-ws-message
description: Add a new WebSocket message type across the full stack (types, backend handler, frontend handler)
---

# Add WebSocket Message

Adds a new WebSocket message type across all three layers of the WebSocket stack.

## Gather Requirements

Before writing any code, ask the user:
1. Message direction: request (client->server), response (server->client), or both?
2. Message name/type string (e.g., `user_typing`, `build_progress`)
3. Payload shape (what data does the message carry?)
4. Does it change agent state? (if yes, needs state restoration handling)

## Steps

### 1. Add Message Type Constant

**File:** `worker/agents/constants.ts`

Add to `WebSocketMessageRequests` (for client->server) or `WebSocketMessageResponses` (for server->client):

```typescript
// In WebSocketMessageRequests:
MY_MESSAGE: 'my_message',

// Or in WebSocketMessageResponses:
MY_RESPONSE: 'my_response',
```

### 2. Add Type Definition

**File:** `worker/api/websocketTypes.ts`

Add a new type to the discriminated union:

```typescript
type MyMessageType = {
  type: 'my_message';
  payload: string;
  // ... other fields
};
```

Add it to the `WebSocketMessage` union type (for requests) or the response union.

### 3. Add Backend Handler

**File:** `worker/agents/core/websocket.ts`

Add a case in the `handleWebSocketMessage` switch:

```typescript
case WebSocketMessageRequests.MY_MESSAGE: {
  const payload = parsedMessage.payload;
  // Handle the message
  // Optionally update agent state:
  // agent.setState({ ...agent.state, myField: payload });
  break;
}
```

### 4. Add Frontend Handler

**File:** `src/routes/chat/utils/handle-websocket-message.ts`

Add a case in the message handler switch:

```typescript
case 'my_response': {
  const data = message as MyResponseType;
  // Update frontend state
  break;
}
```

### 5. State Restoration (if state-changing)

If the message changes `AgentState`, ensure the `agent_connected` restoration path handles it:
- Backend: verify the field is included in the `agent_connected` state snapshot
- Frontend: verify the field is restored from the `agent_connected` payload

### 6. Verify

Run: `bun run typecheck`
Expected: No type errors.

## Reference

- Existing types: `worker/api/websocketTypes.ts`
- Constants: `worker/agents/constants.ts`
- Backend handler: `worker/agents/core/websocket.ts`
- Frontend handler: `src/routes/chat/utils/handle-websocket-message.ts`

## Expert Agents

For complex scenarios, delegate to these domain experts:
- **websocket-expert**: Message deduplication, state restoration, reconnect behavior
- **durable-objects-expert**: If the message changes CodeGenState fields
- **convention-checker**: Verify type naming and handler patterns
