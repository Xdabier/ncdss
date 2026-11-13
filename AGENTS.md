# AGENTS.md

Guidance for coding agents working in this repository. Humans should start with [README.md](README.md).

## What this is

NCDSS is an emergency room triage and decision support app. npm workspaces monorepo:

- `server`: Electron 28 app with an embedded Express 4 API (port 3000) and SQLite via better-sqlite3 + Drizzle ORM
- `client`: React 18 + Vite + Tailwind + shadcn/ui + Zustand, packaged for mobile with Capacitor 5
- `shared`: TypeScript types and route constants (`@ncdss/shared`)
- `finetuning`: optional Python pipeline, independent from the app

Pathology and intervention suggestions come from the LLM (local GGUF model or Claude API). The rule-based matcher in `server/src/services/pathologyMatcher.ts` reads pathology tables that are empty unless an admin imports a dataset. No dataset is shipped.

All UI text is French. Code, comments and docs are English.

## Setup and run

Use Node.js 20. Other versions can fail to install `better-sqlite3`.

```bash
npm ci
npm run build --workspace=shared   # required before server or client
npm run dev:server                 # Electron window + API on :3000
npm run dev:client                 # web client on http://localhost:3001 (second terminal)
```

- Health check: `curl http://localhost:3000/api/health`
- Default login: `admin` / `admin123`
- Server address to type in the client login screen: `localhost:3000`
- Only one server instance can run per machine. A second one exits because port 3000 is taken.
- The server opens a GUI window. In a headless environment only the checks below can run.

## Checks

```bash
npm run build --workspace=shared
npx tsc --noEmit -p client
npx tsc --noEmit -p server
npm run lint
npm run build:client
```

These must pass, with no lint errors. There are no automated tests.

## Where things are

- `server/src/main/index.ts`: Electron main process
- `server/src/main/server.ts`: Express app, middleware order, route mounting
- `server/src/api/routes/`: one file per resource
- `server/src/api/middleware/`: JWT auth and audit logging
- `server/src/services/`: pathology matching, symptom mapping, LLM providers, notifications, shift monitor
- `server/src/utils/scores.ts`: NEWS, GCS, qSOFA and ESI logic
- `server/src/database/schema.ts`: Drizzle schema. Migrations are in `server/src/database/migrations/`
- `client/src/pages/`: pages grouped by role (admin, supervisor, nurse, doctor, shared)
- `client/src/routes/index.ts`: `CLIENT_ROUTES`
- `shared/src/types/api-routes.ts`: `API_ROUTES`

## Rules

- TypeScript strict mode. Avoid `any`.
- New API endpoint: add it to `API_ROUTES` and use that constant in the client. No hardcoded API paths.
- New page: add it to `CLIENT_ROUTES` and reference it in `client/src/App.tsx`. No hardcoded paths in navigation.
- After changing `shared/`, rebuild it.
- Use Drizzle ORM for database access. After a schema change run `npm run db:generate` in `server/`.
- Protected API routes go behind `authMiddleware`. Error messages returned to the client are in French.
- UI uses shadcn/ui and Tailwind. Never use Ionic UI components.
- Functional React components and hooks. Zustand for global state.
- Timestamps are ISO 8601 strings.
- Never log passwords or tokens. Never commit real patient data or `.env` files.

## Native module gotcha

`better-sqlite3` is compiled either for Electron or for Node, not both at once.

- The `db:*` scripts in `server/` rebuild it for Node.
- Before starting the Electron app again, run `npm run rebuild:electron` in `server/`.

## Database

The file lives in the Electron user data folder (`ncdss-server/ncdss-server.db`). It is created and migrated on startup. Scripts in `server/src/scripts/` act on that same file, so they change the developer's local data.

## Commits

Angular style: `type(scope): summary`, with a body that explains why. Types: build, ci, docs, feat, fix, perf, refactor, test. See [CONTRIBUTING.md](CONTRIBUTING.md).
