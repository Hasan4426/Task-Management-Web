# Trello Clone

Team task management project for Web Development Fall 26.

## Project structure

```text
client/   React frontend (planned)
server/   Node.js and Express backend
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

The React frontend and the other feature areas have not been implemented here.

## Team workflow

Use short feature branches and pull requests. Decide task assignments within the team.
Keep secrets and local environment files out of Git. Document actual completed contributions
for the course submission.
