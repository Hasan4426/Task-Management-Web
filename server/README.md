# Authentication backend

Node.js 26 LTS + Express + MongoDB. Implements registration, login, logout and session restoration. The frontend is a separate task for Hasan.

## Source layout

```text
src/
  features/
    auth/
      auth.routes.js  Registration, login, logout and current-user routes
      auth.user.js    Public user serialization and database projection
      password.js     Salted password hashing and verification
    boards/           Future board feature (placeholder)
    cards/            Future card/list feature (placeholder)
  middleware/
    auth.js           Current-user authentication middleware
  app.js              Express/session assembly and feature mounting hook
  config.js           Environment validation and shared session settings
  database.js         Shared MongoDB client and indexes
  errors.js           Shared API errors and redacted logging
  index.js            HTTP startup and graceful shutdown
test/
  auth.test.js        Authentication integration tests
scripts/
  setup-env.js        Private local environment generation
```

Feature modules share the database connection and application. Add new feature
routers through the mounting hook below; avoid separate servers or user models per feature.

## Start locally

From this repository's root:

```bash
cd server
npm ci
npm run setup:env
npm run dev
```

`setup:env` creates a private `.env` with a random session secret. It never overwrites an existing file. `.env` is ignored by Git. The local environment is already prepared on Ahmed's laptop; other teammates should run these commands on their own machines.

MongoDB must be running first. On Ahmed's laptop it is managed by a user service:

```bash
systemctl --user status webdev-mongodb.service
systemctl --user start webdev-mongodb.service
```

Other machines can use their own MongoDB service or configured MongoDB URI. Do not assume Ahmed's user-service name exists elsewhere.

The server listens at `http://127.0.0.1:3000`. A frontend at `http://localhost:5173` should call `http://localhost:3000` consistently and include credentials. Check readiness at `/api/health`. Use `npm start` to run without automatic restart; Ctrl+C closes the server and MongoDB connection.

## Authentication API

| Method | Endpoint | Input | Success |
|---|---|---|---|
| POST | `/api/auth/register` | JSON: `name`, `email`, `password` | 201 `{user}` and session cookie |
| POST | `/api/auth/login` | JSON: `email`, `password` | 200 `{user}` and session cookie |
| GET | `/api/auth/me` | None | 200 `{user}` or 401 when signed out |
| POST | `/api/auth/logout` | None | 204, invalidates current session |
| GET | `/api/health` | None | 200 `{"status":"ok"}` or 503 |

Public users contain `id`, `name`, `email` and ISO `createdAt`. Errors use
`{error:{code,message,fields?}}`, where optional `fields` maps field names to error strings.
Names are trimmed, 1–80 Unicode code points; emails are trimmed, lowercased and unique.
Passwords must contain 15–128 Unicode code points and are never trimmed. Unexpected fields are rejected.

Browser requests must use `credentials: 'include'`; mutations must include
`X-Requested-With: XMLHttpRequest`. Registration/login also require `Content-Type: application/json`,
with an 8 KiB body limit. Session cookies are HttpOnly; do not store tokens in browser storage.
Sessions last up to seven days from authentication, and logout affects only the current session.

Registration is limited to 5 attempts and login to 10 attempts per IP per 15 minutes.
Handle 429 using `Retry-After`. A 401 from `/me` means signed out; network/500 errors require retry.
A registration 503 with `ACCOUNT_CREATED_LOGIN_REQUIRED` means the account exists but its session
could not be saved; use login after recovery. Duplicate emails return 409 `EMAIL_IN_USE`.

## Configuration

Environment variables override `.env` values. The example file contains development defaults and an empty secret; run `setup:env` instead of deploying the example unchanged.

| Variable | Development default / meaning |
|---|---|
| `NODE_ENV` | `development`; also accepts `test` or `production` |
| `HOST` | `127.0.0.1`; change explicitly if a container needs a different bind address |
| `PORT` | `3000`, integer 1–65535 |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017`; required explicitly in production |
| `MONGODB_DB` | `webdev_auth`; required explicitly in production |
| `SESSION_SECRET` | Required, at least 32 bytes; production requires a random 32-byte secret encoded as 64 hex characters |
| `ALLOWED_ORIGINS` | `http://localhost:5173`; comma-separated exact origins; explicit HTTPS origins required in production |
| `SESSION_COOKIE_SECURE` | `false` locally; defaults to and must be `true` in production |
| `SESSION_COOKIE_SAME_SITE` | `lax`; accepts `strict` or `none`; `none` requires Secure |
| `TRUST_PROXY` | `false`; otherwise a comma-separated list of exact trusted proxy IP addresses |

Keep the signing secret stable across restarts so existing sessions continue working. Changing it invalidates existing cookies. Configuration validates the format, but cannot prove randomness. Keep secrets outside Git and never paste them into chat.

## Run tests

```bash
npm test
npm audit --audit-level=low
```

Tests use a random `auth_test_qa_...` database and drop only that database afterward. They require real MongoDB and loopback networking. To use another **dedicated test deployment**, set `TEST_MONGODB_URI`:

```bash
TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test
```

Do not point tests at production. Tests cover concurrent registration, cookies, persistence, invalidation, expiry, CSRF/CORS, rate limits, production configuration and injected failures. No frontend or deployment tests are implied.

## Add a protected feature route

Register feature routes through `registerRoutes` so they are mounted before the final 404/error handlers:

```js
import { createApp } from './src/app.js';

const app = createApp({
  config,
  database,
  registerRoutes(app) {
    app.get('/api/example', app.locals.requireAuth, (req, res) => {
      // req.user = { id, name, email, createdAt }
      res.json({ userId: req.user.id });
    });
  },
});
```

`app.locals.requireAuth` includes session loading and current-user verification. The lower-level `requireAuth` export from `src/middleware/auth.js` assumes a session has already been loaded; use the composed helper for feature routes. `database` comes from `connectDatabase(config)` and `config` from `loadConfig(env)`.

For JSON mutations, add an appropriately bounded `express.json()` parser to the feature router. Global `/api` middleware already enforces the allowed Origin, required mutation header, production HTTPS checks, CORS and no-store caching. Authenticate and enforce the feature's ownership/membership rules before accessing private resources. Never trust an arbitrary user ID in a request body.

## Deployment boundaries

The supported initial topology is one Node process. Rate-limit counters are in memory and reset on restart; use a shared store before multiple workers/replicas. Sessions persist in MongoDB.

The provided entrypoint listens over HTTP. Production therefore requires an HTTPS reverse proxy with its exact IPs configured in `TRUST_PROXY`, a restricted authenticated MongoDB account, persistent storage and exact frontend origins. The proxy must overwrite forwarding headers and restrict direct access around it. Without trusted HTTPS forwarding, production auth mutations fail closed with `HTTPS_REQUIRED`.

Social sign-in, email verification, password recovery and two-factor authentication are outside this version's scope.
