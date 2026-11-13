# NCDSS

[![CI](https://github.com/Xdabier/ncdss/actions/workflows/ci.yml/badge.svg)](https://github.com/Xdabier/ncdss/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node 20](https://img.shields.io/badge/node-20-339933?logo=nodedotjs&logoColor=white)](.nvmrc)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Electron 28](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React 18](https://img.shields.io/badge/React-18-20232A?logo=react&logoColor=white)](https://react.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-Drizzle_ORM-003B57?logo=sqlite&logoColor=white)](https://orm.drizzle.team/)
[![Runs offline](https://img.shields.io/badge/LLM-runs_offline-6f42c1)](#ai-analysis)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)
[![Built with Claude](https://img.shields.io/badge/built_with-Claude-D97757?logo=claude&logoColor=white)](#how-this-project-was-built)

Nursing Clinical Decision Support System for emergency rooms.

NCDSS helps emergency room staff register patients, run an ABCDE triage, compute clinical scores, and get suggestions for orientation and interventions. It was built for Tunisian hospitals, so the whole user interface is in French.

It is made to run on a hospital local network: one desktop machine hosts the server and the database, and tablets or browsers connect to it. With a local model, nothing needs internet access.

> **Medical disclaimer.** This is research software. It is not a certified medical device and has not been clinically validated. Its suggestions do not replace the judgment of qualified staff. Do not use it for real patient care without your own validation and regulatory approval.

## What it does

- Patient registration with chief complaint
- ABCDE triage workflow with vital signs
- Automatic NEWS, GCS and qSOFA scores, with an ESI level suggestion
- AI analysis of the triage findings: likely pathologies, nursing and medical interventions, orientation (resuscitation room, medical, surgical, trauma). It runs on a local GGUF model (offline) or on the Claude API.
- Doctor workflow: diagnoses, prescriptions, complementary exams, discharge
- Nurse weekly schedule and doctor to box assignments
- Live tracking board, queues, statistics and exports
- Notifications for patient assignments, finished triage, ending shifts and patients left without a doctor
- Audit log of clinical write operations
- User profiles, and a PIN lock screen after inactivity
- Server window with connection info, live logs and a switch between the local model and the Claude API

## How it is built

The repository is an npm workspaces monorepo with three packages:

- `server`: Electron 28 desktop app that embeds an Express 4 REST API and a SQLite database (better-sqlite3 + Drizzle ORM). The API listens on port 3000.
- `client`: React 18 single page app (Vite, Tailwind CSS, shadcn/ui, Zustand). It runs in a browser and can be packaged for Android and iOS with Capacitor 5.
- `shared`: TypeScript types and route constants used by both sides.

There is also a `finetuning` folder with the Python pipeline used to fine-tune a small local model. It is optional and separate from the app.

## Requirements

- Node.js 20 LTS (tested with 20.16) and npm 10
- Windows, macOS or Linux with a desktop session (the server is an Electron app)
- Optional: Android Studio or Xcode for mobile builds

Node 20 matters. `better-sqlite3` ships prebuilt binaries for it. On Node 24 the install tries to compile from source and fails unless C++ build tools are installed. An `.nvmrc` file is provided, so `nvm use` picks the right version.

## Quick start

Run everything from the repository root unless a step says otherwise.

```bash
# 1. Get the code
git clone https://github.com/Xdabier/ncdss.git
cd ncdss

# 2. Install all workspaces
npm ci

# 3. Build the shared types (needed before the server or client can start)
npm run build --workspace=shared

# 4. Start the server (opens an Electron window)
npm run dev:server
```

The server window shows the address clients must use, for example `192.168.1.100:3000`. You can check that the API is up:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","timestamp":"..."}
```

Then, in a second terminal:

```bash
# 5. Start the web client
npm run dev:client
```

Open http://localhost:3001 and:

1. Enter the server address. Use `localhost:3000` on the same machine, or the address shown in the server window from another device. Do not add `http://`.
2. Log in with the default account: username `admin`, password `admin123`.

The database is created on first start, with this admin account and a default ER layout. Change the admin password before any real use.

Keep both terminals open while you work. Only one server can run at a time on a machine, since it owns port 3000 and the database.

## Where suggestions come from

Scores (NEWS, GCS, qSOFA), the ESI suggestion and a basic orientation suggestion based on those scores are computed in code and always work.

Pathology hypotheses and interventions come from the AI analysis, so they need a model. See [AI analysis](#ai-analysis) below.

The server also has an older rule-based pathology matcher. It reads pathology tables that are empty in a new database, and no dataset ships with this repository, so it returns no matches by default. If you have your own dataset, an admin can import it as an Excel file at `/admin/clinical-data/import`. That page lists the expected sheets and columns.

## Configuration

The server reads `server/.env` at startup. Nothing is required in development.

```bash
cp server/.env.example server/.env
```

- `NODE_ENV`: `development` or `production`
- `JWT_SECRET`: token signing secret. The server refuses to start in production without it.
- `CORS_ORIGINS`: comma separated list of allowed origins in production. Every origin is allowed in development.
- `LLAMA_MODELS_DIR`, `LLAMA_MODEL_FILE`, `LLAMA_MODEL_PATH`, `LLAMA_CONTEXT_SIZE`, `LLAMA_GPU_LAYERS`, `LLAMA_ENABLE_THINKING`: local model settings
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `LLM_PROVIDER`: Claude API settings

The database file is stored in the Electron user data folder:

- Windows: `%APPDATA%\ncdss-server\ncdss-server.db`
- macOS: `~/Library/Application Support/ncdss-server/ncdss-server.db`
- Linux: `~/.config/ncdss-server/ncdss-server.db`

Delete that file to start again from an empty database.

## AI analysis

The app starts and the workflows run without any model, but pathology and intervention suggestions stay empty.

To use a local model, put a `.gguf` file in `server/models/` and restart the server. The first `.gguf` file found is loaded, or the one named in `LLAMA_MODEL_FILE`. Inference runs through `node-llama-cpp`, on the GPU when one is available.

To use the Claude API instead, set `ANTHROPIC_API_KEY` in `server/.env`. Patient data is then sent to an external service, so only do this with data you are allowed to share.

## Mobile builds

The native projects are not committed. Create them once, then sync and open:

```bash
cd client
npm run build
npx cap add android   # or: npx cap add ios
npm run android       # or: npm run ios
```

## Useful scripts

From the root:

- `npm run dev:server`: start the Electron server in dev mode
- `npm run dev:client`: start the web client on port 3001
- `npm run build`: build all three workspaces
- `npm run lint`: run ESLint
- `npm run format`: run Prettier

From `server/`:

- `npm run rebuild:electron`: rebuild `better-sqlite3` for Electron
- `npm run db:generate`: create a migration after a schema change
- `npm run db:studio`: open Drizzle Studio on the database
- `npm run db:seed -- <file.xlsx>`: import a clinical dataset from the command line
- `npm run build`: package the desktop app. It copies `server/.env` into the package, so that file must exist.

The `db:*` scripts rebuild `better-sqlite3` for Node. Run `npm run rebuild:electron` afterwards.

## Project layout

```
client/      React app (pages by role, components, stores, services, routes)
server/      Electron main process, Express routes, services, database schema and migrations
shared/      Types and route constants shared by client and server
finetuning/  Python scripts to build training data, fine-tune and evaluate a local model
```

Key places in the code:

- `server/src/main/server.ts`: Express app and route mounting
- `server/src/api/routes/`: one file per API resource
- `server/src/services/`: pathology matching, LLM providers, notifications, shift monitor
- `server/src/database/schema.ts`: Drizzle schema
- `client/src/routes/index.ts`: every client route
- `shared/src/types/api-routes.ts`: every API route

## User roles

- `SUPER_ADMIN`: full access
- `ADMIN`: ER configuration, users, box assignments, clinical reference data
- `NURSE_SUPERVISOR`: weekly schedule, queues, statistics
- `NURSE`: registration, triage and treatment
- `DOCTOR`: diagnoses, prescriptions, discharge

## Troubleshooting

**`better_sqlite3.node was compiled against a different Node.js version`**

The native module was built for the wrong runtime. For the Electron app:

```bash
cd server && npm run rebuild:electron
```

For command line tools such as `drizzle-kit`, run `npm rebuild better-sqlite3` from the root.

**`npm ci` fails with `Could not find any Visual Studio installation`**

You are on a Node version with no prebuilt `better-sqlite3` binary. Switch to Node 20.

**The client cannot reach the server**

- Check that the server window shows a running server and an address.
- Client and server must be on the same network.
- The firewall must allow incoming connections on port 3000.

## Project status

The core workflows work end to end. Known gaps:

- No automated tests yet
- No WebSocket push, the client polls for notifications
- No offline mode, clients need a live connection to the server
- Role checks on patient routes are done in the client, not on the server (see [SECURITY.md](SECURITY.md))

## How this project was built

Most of the code in this repository was written by Claude, Anthropic's AI model, working through Claude Code. My part was to manage and guide it: I set the goals, made the decisions and steered the work until it reached this version.

I am saying it plainly so you know what you are reading. Review the code the way you would review any other code before you rely on it, and even more so because this is clinical software.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, then look at the [good first issues](https://github.com/Xdabier/ncdss/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22). Report security issues as described in [SECURITY.md](SECURITY.md).

Coding agents should start with [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
