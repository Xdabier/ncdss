# Contributing

Thanks for taking the time to help. This page explains how to set up the project and what a good change looks like.

## Setup

Follow the Quick start in the [README](README.md). You need Node.js 20.

## Before you open a pull request

Run these from the repository root:

```bash
npm run build --workspace=shared
npx tsc --noEmit -p client
npx tsc --noEmit -p server
npm run lint
npm run build:client
```

All five must pass. Lint must report no errors. CI runs the same checks.

There is no automated test suite yet. Describe in the pull request how you tested the change by hand. Tests are a very welcome contribution.

## Code conventions

- TypeScript strict mode everywhere. Avoid `any`.
- All user facing text is in French. Code, comments and docs are in English.
- UI is built with shadcn/ui and Tailwind CSS. Do not use Ionic UI components.
- Database access goes through Drizzle ORM. Schema changes need a migration (`npm run db:generate` in `server/`).
- Every API path is declared in `shared/src/types/api-routes.ts`. Do not hardcode API paths in the client.
- Every client route is declared in `client/src/routes/index.ts`.
- Types used by both sides live in `shared/`. Rebuild it after a change.
- Keep one concern per file. Route handlers go in `server/src/api/routes/`, business logic in `server/src/services/`.

## Clinical content

Changes to scores, thresholds, pathology matching or LLM prompts affect clinical suggestions. Give a source for them in the pull request (guideline, paper or textbook).

Never commit real patient data, in code, fixtures, screenshots or issues.

## Commits

Commit messages follow the Angular convention:

```
type(scope): summary

Body that explains why the change is needed.
```

- Types: `build`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `test`
- Scope is the area touched, for example `triage`, `server`, `client`, `shared`
- Summary in the imperative, lowercase, no period at the end, header at most 100 characters
- A body is expected for every type except `docs`

Branch names use `type/short-description`, for example `fix/news-score-rounding`.

## Pull requests

- Keep each pull request to one topic.
- Say what changed, why, and how you tested it.
- Mention breaking changes and any follow up work.

## Reporting bugs and asking for features

Open an issue. For a bug, include the steps to reproduce, what you expected, what happened, your OS and your Node version.

Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## License

By contributing, you agree that your work is released under the [MIT License](LICENSE).
