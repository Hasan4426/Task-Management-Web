# Trello Clone

Team task management project for Web Development Fall 26.

## Project structure

```text
.github/workflows/   Automated backend tests
client/
  src/
    features/       Working auth UI; boards and cards placeholders
    components/     Shared UI components (placeholder)
    api/            Shared credentialed HTTP client
  package.json
  package-lock.json
server/
  src/
    features/
      auth/         Working authentication routes and password/user helpers
      boards/       Future board feature (placeholder)
      cards/        Future card/list feature (placeholder)
    middleware/     Shared authentication middleware
    config.js
    database.js
    errors.js
    app.js
    index.js
  test/             MongoDB integration tests
  scripts/          Local environment setup
  .env.example
  package.json
  package-lock.json
```

The frontend and backend share this repository and can be deployed independently.

## Development approach

Subteams own complete features. Agree on shared database models and API contracts,
then build backend and frontend in parallel and connect each feature early.
Ahmed owns the authentication backend; Hasan owns its frontend.

## Core scope

- Accounts and profiles
- Private boards and owner-managed membership
- Lists and cards
- Card movement and reordering
- Assignments, due dates, and labels
- Comments and search
- Real-time board updates
- AI summaries of card comment threads

Optional Jira extensions include issue types, backlog and sprints, and workflow rules.

## Status

The authentication backend is implemented in `server/`. See its
[setup, API and run instructions](server/README.md).

The React authentication frontend is implemented without styling. It connects to
the backend for registration, login, session restoration and logout. See
[frontend setup and checks](client/README.md). Profile editing and the other
feature areas remain unimplemented; boards and cards folders are placeholders.

## Automated checks

`.github/workflows/backend-ci.yml` runs Node.js 26 backend tests against an isolated
MongoDB 9.0.8 service on relevant feature/fix branch pushes and pull requests targeting
`develop` or `main`. It uses the same `npm ci` and `npm test` commands as local development.
No deployment occurs in this workflow.

## Team workflow

Use short feature branches and pull requests. Decide task assignments within the team.
Create `feature/...` or `fix/...` branches from `develop`, open reviewed pull requests
back into `develop`, and promote tested milestones to `main`. Branches represent work,
not permanent per-person copies of the project.
Keep secrets and local environment files out of Git. Document actual completed contributions
for the course submission.
