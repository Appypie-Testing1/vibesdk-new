# vibesdk: The Complete Guide

> From "what is this?" to "I can build, deploy, and debug it" -- a single document covering everything about vibesdk.

vibesdk is an AI-powered full-stack application generation platform built on Cloudflare infrastructure. Users describe an app in natural language; the platform generates production-ready code, previews it in a live sandbox, and deploys it to Cloudflare Workers -- all in real time.

This guide progresses from high-level overview to deep internals. Read it cover-to-cover, or jump to any section via the table of contents.

**Related documentation:**
- [`docs/setup.md`](setup.md) -- Quick-start setup guide
- [`docs/architecture-diagrams.md`](architecture-diagrams.md) -- Mermaid architecture diagrams
- [`docs/llm.md`](llm.md) -- LLM-focused developer reference

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Prerequisites and Local Setup](#2-prerequisites-and-local-setup)
3. [Templates System](#3-templates-system)
4. [Complete App Generation Flow](#4-complete-app-generation-flow)
5. [Backend Architecture](#5-backend-architecture)
6. [Frontend Architecture](#6-frontend-architecture)
7. [SDK Package](#7-sdk-package)
8. [Deployment and Operations](#8-deployment-and-operations)
9. [Development Workflow and Contribution Guide](#9-development-workflow-and-contribution-guide)

---

## 1. Project Overview

### 1a. What vibesdk Does

vibesdk is an AI-powered application generation platform. A user describes an app in natural language -- a description, a feature list, or a rough idea -- and the platform handles the rest. It selects a matching project template from Cloudflare R2 storage and invokes an LLM to produce a structured blueprint: a document covering architecture, views, data flow, and an implementation roadmap. That blueprint drives everything that follows.

Code generation proceeds in phases. Each phase is scoped to a portion of the application (routing, data layer, UI, etc.) and produces files that are streamed to the frontend in real time via WebSocket. After each phase, a code review step runs automatically, and a fixer pass resolves TypeScript errors before moving to the next phase. Generated files are synced to a sandbox container -- Cloudflare Containers in production, Docker locally -- giving users a live preview at each step. Users can send follow-up messages to refine the app mid-session; conversation turns are processed as agent operations that can modify the blueprint, regenerate files, or trigger re-deployment.

Final applications are deployed to Cloudflare Workers. The platform manages the full deployment pipeline: bundling, environment variable injection, Worker upload, and route assignment. Two behavior modes govern code generation: **phasic** (default for web apps) uses a deterministic state machine that drives the platform through a fixed sequence of generation, review, and implementation phases; **agentic** (used for presentations, workflows, and general projects) runs an autonomous LLM loop that decides what to do next without a predefined phase order.

### 1b. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, TailwindCSS, React Router v7, Radix UI |
| Backend | Cloudflare Workers, Hono framework, Durable Objects |
| Database | Cloudflare D1 (SQLite), Drizzle ORM |
| AI/LLM | OpenAI, Anthropic, Google AI Studio (Gemini), Cerebras, OpenRouter via Cloudflare AI Gateway |
| Real-time | WebSocket via PartySocket |
| Sandbox | Cloudflare Containers (production), Docker (local dev) |
| Storage | Cloudflare KV (sessions/cache), R2 (templates/assets) |
| Git | isomorphic-git with SQLite filesystem adapter |
| SDK | `@cf-vibesdk/sdk` -- standalone client library |

### 1c. Architecture Overview

vibesdk follows a three-tier architecture.

**Frontend (React SPA):** The client application lives in `src/`. It communicates with the backend over two channels: a REST API for discrete operations (auth, app management, model configuration, stats) and a persistent WebSocket connection for real-time streaming of agent events, file contents, and state updates. The frontend reconstructs full application state on reconnect by replaying the agent's persisted state.

**Backend (Cloudflare Workers + Durable Objects):** The backend entry point is `worker/index.ts`, which routes requests to either the HTTP API (Hono router) or the agent handler. Each chat session is backed by a `CodeGeneratorAgent` Durable Object -- a long-lived, single-threaded process that holds the full session state in SQLite. Separate Durable Objects handle rate limiting (`DORateLimitStore`), encrypted user secrets (`UserSecretsStore`), and global state (`GlobalDurableObject`).

**Cloudflare Infrastructure:** The platform is entirely Cloudflare-native. D1 provides the relational database, KV stores ephemeral session data and cache, R2 holds project templates and generated assets, Containers run the sandbox preview environment, and AI Gateway proxies all LLM calls with unified authentication, logging, and fallback handling.

For visual mermaid diagrams of these relationships, see [`docs/architecture-diagrams.md`](architecture-diagrams.md).

### 1d. Project Structure

```
vibesdk/
├── src/              # React frontend application
├── worker/           # Cloudflare Workers backend
├── shared/           # Shared types between frontend and backend
├── sdk/              # Client SDK package (@cf-vibesdk/sdk)
├── migrations/       # D1 database migrations
├── container/        # Sandbox container tooling (CLI tools, process monitor)
├── scripts/          # Deploy, setup, and undeploy scripts
├── docs/             # Documentation, architecture diagrams, Postman collection
└── debug-tools/      # Python/TS analysis scripts
```

### 1e. Worker Subdirectory Breakdown

The `worker/` directory is organized by concern. The following table covers all 14 primary subdirectories.

| Directory | Contents |
|---|---|
| `worker/agents/core/` | `CodeGeneratorAgent` (extends Cloudflare `Agent`), phasic and agentic behavior classes, state machine transitions, WebSocket message handler |
| `worker/agents/operations/` | Discrete agent operations: `PhaseGeneration`, `PhaseImplementation`, `UserConversationProcessor`, `DeepDebugger`, `FileRegeneration`, `PostPhaseCodeFixer` |
| `worker/agents/planning/` | Blueprint generation pipeline and template selection logic |
| `worker/agents/tools/toolkit/` | All LLM-callable tools: `read-files`, `run-analysis`, `regenerate-file`, git operations, web search, and others |
| `worker/agents/inferutils/` | Inference pipeline (`executeInference`), model configuration, tool execution loop, loop detection |
| `worker/agents/output-formats/` | SCOF (Streaming Code Output Format) parser for incremental file streaming |
| `worker/agents/git/` | `GitVersionControl` wrapper around isomorphic-git; SQLite filesystem adapter (`fs-adapter.ts`) |
| `worker/agents/services/` | `FileManager` (file sync and tracking), `DeploymentManager` (Cloudflare Worker deployment) |
| `worker/agents/utils/` | Template customizer, prompt construction utilities |
| `worker/api/routes/` | Hono HTTP route definitions: auth, apps, user, stats, codegen, model config, and others |
| `worker/api/controllers/` | Request handler implementations, one directory per domain |
| `worker/database/` | Drizzle ORM schema definitions and service layer for all database operations |
| `worker/services/` | One directory per infrastructure concern: sandbox, secrets, oauth, rate-limit, deployer, and others |
| `worker/middleware/` | CSRF protection, WebSocket security checks, authentication middleware |

---
