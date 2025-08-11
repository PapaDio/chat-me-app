# Chat Me App

## Overview

This is a Next.js (App Router) TypeScript application that provides a small messaging backend and UI state using API routes and React Contexts. It supports:

- __Unread counts__: `src/app/api/unread-messages/route.ts`
- __Typing indicators__: `src/app/api/typing/route.ts`
- __Rooms listing/creation__: `src/app/api/rooms/route.ts`
- __Encrypted messaging (at rest)__: messages are AES-256-GCM encrypted before storing and decrypted on read (`src/lib/crypto.ts`).

Caching is optionally backed by Redis if `REDIS_URL` (or `UPSTASH_REDIS_URL`) is present. Without Redis, the app still runs, gracefully falling back to in-process logic for features that can operate without cache.


## Tech Stack and Why Each Piece Is Needed

- __Next.js (App Router)__
  - Why: Modern React framework with file-based routing, server components, and production build tooling.
  - How: API routes live under `src/app/api/*/route.ts`. Use `npm run dev` for the dev server, `npm run build` to compile, and `npm start` to serve.

- __TypeScript__
  - Why: Safer code via static typing and better DX.
  - How: Project files use `.ts`/`.tsx`. Type checking runs during build/dev.

- __Prisma ORM__
  - Why: Type-safe database access and migrations.
  - How: Accessed as `prisma` from `src/lib/prisma`. The code uses both Prisma Client and raw SQL where necessary (e.g., counting unread messages efficiently). Development typically targets SQLite; production can use any Prisma-supported DB with `DATABASE_URL`.

- __Redis (via ioredis) [optional]__
  - Why: Caching and quick invalidation for frequently changing data (e.g., unread counts). Also suitable for ephemeral state like typing indicators.
  - How: `src/lib/redis.ts` exposes `getRedis()` which lazily initializes a client using dynamic `import('ioredis')`. If Redis is not configured/installed, it returns `null` and callers handle that path.

- __Local LLM via Ollama__
  - Why: Power AI chat features locally for privacy and zero external dependency.
  - How: API routes under `src/app/api/ollama/` integrate with a local Ollama server:
    - Models list: `src/app/api/ollama/models/route.ts`
    - Chat/completions: `src/app/api/ollama/chat/route.ts`
    - Per-user LLM room helper: `src/app/api/ollama/room/route.ts`
    UI integrates via:
    - Model selection: `src/components/chat/ModelSelector.tsx`
    - Real-time status: `src/contexts/RealTimeContext.tsx` (fields `ollamaAvailable`, `refreshOllamaStatus()`)
    - Chat page orchestration: `src/app/chat/page.tsx` (LLM chat flow, `handleSendToLLM`)

- __Message encryption (AES-256-GCM)__
  - Why: Protect message content at rest in the database.
  - How: `src/lib/crypto.ts` provides `encryptText()`, `decryptText()`, and `isEncrypted()`. API routes like `src/app/api/messages/route.ts` and `src/app/api/ollama/chat/route.ts` encrypt on write and decrypt on read. Key derived from the `MSG_ENC_KEY` environment variable (scrypt).

- __Tailwind CSS__
  - Why: Utility-first styling for rapid UI development and consistent design.
  - How: Tailwind v4 syntax is used via `@import "tailwindcss"` in `src/app/globals.css`. Classes are applied throughout components via `className`.

- __shadcn/ui__
  - Why: Reusable, accessible UI primitives built on top of Tailwind for faster UI building.
  - How: Components are colocated under `src/components/ui/` (e.g., `dropdown-menu.tsx`, `scroll-area.tsx`, `sonner.tsx`). Project metadata in `components.json` follows the shadcn schema.

- __JWT-based auth utilities__
  - Why: Authenticate requests to API endpoints.
  - How: `src/lib/auth.ts` exposes helpers like `verifyToken()` consumed by API routes. You must provide a `JWT_SECRET` (or equivalent) in `.env`.

- __React Contexts__
  - Why: Share auth and real-time application state across the UI.
  - How: See `src/contexts/AuthContext.tsx` and `src/contexts/RealTimeContext.tsx`.


## Prerequisites

- Node.js 18+ (LTS recommended)
- Package manager: npm, yarn, pnpm, or bun


## Environment Variables (.env)

Create a `.env` file at the project root and define as appropriate for your environment:

- `DATABASE_URL` — Prisma connection string.
  - Example (SQLite): `DATABASE_URL="file:./dev.db"`
- `JWT_SECRET` — secret used to sign/verify JWTs.
- `MSG_ENC_KEY` — secret used to derive the AES-256-GCM key for message encryption at rest. In dev, a default is used if not set; set a strong value in production.
- `REDIS_URL` — standard Redis connection URL. Optional.
- `UPSTASH_REDIS_URL` — alternative env var supported for hosted Redis. Optional.

If neither `REDIS_URL` nor `UPSTASH_REDIS_URL` is set, Redis-backed caching is disabled and the app still works.


## LLM (Ollama) Setup and Usage

Ollama runs LLMs locally. Install it, start the service, and pull at least one model.

1) Install Ollama

- https://ollama.com/download

2) Start the Ollama server

```bash
ollama serve
```

3) Pull a model

```bash
ollama pull llama3.1:8b
```

4) Optional environment

- `OLLAMA_HOST` — if the Ollama server is not on the default host/port. Defaults to `http://127.0.0.1:11434`.

5) App integration

- The UI detects availability via `src/app/api/ollama/models/route.ts`.
- Model selector: `src/components/chat/ModelSelector.tsx`.
- Send messages to the AI from the chat UI when “AI Assistant” is online. Messages from the model are displayed with type `LLM_RESPONSE` (see `src/components/chat/ChatMessage.tsx`).
- Programmatic calls go through `src/app/api/ollama/chat/route.ts`.


## Styling (Tailwind CSS + shadcn/ui)

- Global styles: `src/app/globals.css` imports Tailwind (`@import "tailwindcss"`) and animation utilities (`tw-animate-css`). It declares CSS variables for light/dark themes and applies base Tailwind layers via `@layer base`.
- UI components: shadcn/ui-derived primitives live in `src/components/ui/*` and are styled with Tailwind classes. Higher-level app components compose these and add app-specific styles.
- Dark mode: driven by a `.dark` class on the root; see variables in `globals.css` and the theme toggle in `src/components/theme/ThemeToggle.tsx`.


## Local Development

1) Install dependencies

```bash
npm install
# or: yarn install / pnpm install / bun install
```

2) Provision the database (Prisma)

```bash
npx prisma migrate dev
# Optional: inspect data
npx prisma studio
```

3) Run the dev server

```bash
npm run dev
```

The app will be available at http://localhost:3000


## Building and Running a Production Build

1) Build

```bash
npm run build
```

2) Apply Prisma migrations (prod)

```bash
npx prisma migrate deploy
```

3) Start

```bash
npm start
```

Ensure `DATABASE_URL`, `JWT_SECRET`, and optional Redis env vars are set in the production environment before starting.


## Notes on Redis

- `src/lib/redis.ts` uses dynamic import to avoid build errors when `ioredis` is not installed or Redis is not configured. This keeps the codebase portable.
- API routes that call `getRedis()` already check for `null` and skip caching if unavailable.


## Useful Paths

- API routes: `src/app/api/*/route.ts`
- Auth utils: `src/lib/auth.ts`
- Prisma Client: `src/lib/prisma.ts`
- Redis helper: `src/lib/redis.ts`
- Contexts: `src/contexts/`


## Troubleshooting

- Prisma cannot connect: verify `DATABASE_URL` and that migrations ran.
- JWT errors: verify `JWT_SECRET` matches the one used to sign tokens.
- Redis not used: confirm `REDIS_URL` or `UPSTASH_REDIS_URL` is set and reachable; otherwise behavior falls back gracefully.


## License

MIT
