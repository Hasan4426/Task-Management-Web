# Backend workspace

This is the backend skeleton. No authentication implementation, user model,
password/session helpers, API routes or application server has been added here.

```text
src/
  features/
    auth/          Future authentication implementation
    boards/        Future board implementation
    cards/         Future card/list implementation
  middleware/      Shared request middleware
scripts/           Environment/setup and maintenance scripts
test/              Automated backend tests
.env.example       Reserved non-secret development configuration
package.json
package-lock.json
```

Use Node.js 26 LTS. From this directory:

```bash
npm ci
npm test
```

There are currently no dependencies and no tests: `npm test` invokes Node's test
runner and reports zero tests. There is no start/dev command or listening API yet.
The environment template is reserved for future configuration; this skeleton does
not load or use it.

When integrating features, add the shared Express application/configuration,
MongoDB connection and entrypoint under `src/`. Keep feature routes and logic in
`src/features/<feature>/`, reusable request middleware in `src/middleware/`, and
tests in `test/`. Share the server and database foundations across all features.

GitHub Actions already supplies an isolated MongoDB 9.0.8 service and executes
`npm ci`/`npm test`. Future database tests should use uniquely named test databases
and clean them up safely. Commit dependencies to package.json and its lockfile;
never commit local environment secrets or installed node_modules.
