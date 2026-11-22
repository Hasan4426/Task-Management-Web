# Task Management Web

Team task management project for Web Development Fall 26.

## Project structure

```text
.github/workflows/   Automated backend checks
client/
  src/
    features/
      auth/         Frontend authentication placeholder
      boards/       Frontend board placeholder
      cards/        Frontend card/list placeholder
    components/     Shared UI placeholder
    api/            Shared HTTP client placeholder
  package.json
  package-lock.json
  README.md
server/
  src/
    features/
      auth/         Backend authentication placeholder
      boards/       Backend board placeholder
      cards/        Backend card/list placeholder
    middleware/     Shared request middleware placeholder
  scripts/          Backend scripts placeholder
  test/             Backend tests placeholder
  .env.example
  package.json
  package-lock.json
  README.md
.gitignore
README.md
```

This branch contains a shared project skeleton. Application code, dependencies and
authentication tests have not been integrated. Empty directories are preserved by
`.gitkeep` files; replace them when adding real files.

## Setup and current capabilities

Use Node.js 26 LTS and npm. Both workspaces currently have no dependencies:

```bash
cd client
npm ci
cd ../server
npm ci
npm test
```

The backend test command currently discovers **zero tests**. This validates the
test runner setup; it does not verify a working application. Neither workspace
has a start/dev/build command yet. No API or UI is running from this skeleton.

See [frontend setup](client/README.md) and [backend setup](server/README.md).

## Team workflow

Keep frontend and backend together in this repository. Group code by feature,
and share one backend application, database connection setup and user model.

Create short `feature/...` or `fix/...` branches from `develop`. Merge completed,
reviewed feature pull requests into `develop`, then promote verified milestones
to `main`. Feature branches contain their implementation until it is integrated.

## Automated checks

Backend CI runs on relevant feature/fix branch pushes and pull requests targeting
`develop` or `main`. It installs Node.js 26, starts an isolated MongoDB 9.0.8
service, runs `npm ci` and executes the backend test command. Until tests are added,
a successful run confirms only infrastructure/package/test-runner setup.

Commit source, tests, lockfiles and non-secret configuration templates. Keep
`.env`, `node_modules`, IDE files and generated output outside Git.
