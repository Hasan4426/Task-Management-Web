# Batch B — Boards, invitations and members

Built on top of `feature/auth-backend` (commit `94badc6`). Copy the files in this zip into the repo at the same paths.

## Who owns what

| | Part 1 — Boards (you) | Part 2 — Invitations & members (Sama) |
|---|---|---|
| **Server** | `server/src/features/boards/boards.routes.js`<br>`server/src/middleware/boardAccess.js`<br>`server/src/routes.js`, `server/src/index.js` (wiring)<br>`server/src/database.js` (boards + boardMembers indexes) | `server/src/features/boards/invitations.routes.js`<br>`server/src/database.js` (boardInvitations indexes) |
| **Shared server** | `server/src/features/boards/boards.shared.js` (validation + response shapes), `server/src/middleware/json.js` | (same) |
| **Client** | `client/src/features/boards/Dashboard.jsx`<br>`client/src/features/boards/CreateBoardPopover.jsx`<br>`client/src/features/boards/BoardPage.jsx`<br>`client/src/router.js`, `client/src/App.jsx`<br>`client/src/components/AppHeader.jsx`, `Avatar.jsx` | `client/src/features/boards/ShareDialog.jsx`<br>`client/src/features/boards/InvitationsList.jsx` |
| **Shared client** | `client/src/features/boards/boardsApi.js`, `backgrounds.js`, `client/src/styles.css` | (same) |
| **Tests** | `server/test/boards.test.js` — board tests | same file — invitation/member tests |

Also changed: `client/src/main.jsx` (imports styles) and `client/src/features/auth/auth.test.jsx`
(Hasan's tests expected the old "Welcome" screen; now they expect the dashboard). **Tell Hasan about this change.**

## API

All routes need a signed-in session. Errors use the existing format `{ error: { code, message, fields } }`.

| Method | Path | Who | Result |
|---|---|---|---|
| POST | `/api/boards` `{ title, background? }` | anyone signed in | 201 `{ board }`, creator becomes owner |
| GET | `/api/boards?page=1&limit=50` | anyone signed in | `{ boards, page, limit, hasMore }` (only my boards) |
| GET | `/api/boards/:boardId` | member | `{ board, members }` |
| PATCH | `/api/boards/:boardId` `{ title?, background? }` | member | `{ board }` |
| DELETE | `/api/boards/:boardId` | owner | 204, also deletes members, invitations, lists, cards, labels, comments |
| GET | `/api/boards/:boardId/members` | member | `{ members }` |
| DELETE | `/api/boards/:boardId/members/:userId` | owner (anyone), member (only themself = leave) | 204 |
| GET | `/api/boards/:boardId/invitations` | owner | `{ invitations }` pending only |
| POST | `/api/boards/:boardId/invitations` `{ email }` | owner | 201 `{ invitation }`, expires in 7 days |
| DELETE | `/api/boards/:boardId/invitations/:invitationId` | owner | 204 (revoked) |
| GET | `/api/invitations` | anyone signed in | `{ invitations }` sent to my email |
| POST | `/api/invitations/:invitationId/accept` | the invited email | `{ board }` |
| POST | `/api/invitations/:invitationId/decline` | the invited email | 204 |

Error codes: `BOARD_NOT_FOUND` (404, also for outsiders), `OWNER_ONLY` (403), `OWNER_CANNOT_LEAVE` (400),
`ALREADY_MEMBER` / `ALREADY_INVITED` (409), `INVITATION_NOT_FOUND` (404), `MEMBER_NOT_FOUND` (404), `VALIDATION_ERROR` (400).

## Database

- `boards`: `{ _id, title, background, ownerId, createdAt, updatedAt }`
- `boardMembers`: `{ boardId, userId, role: 'owner' | 'member', joinedAt }` — unique `{ boardId, userId }`
- `boardInvitations`: `{ boardId, email, invitedBy, status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired', createdAt, expiresAt, respondedAt }` — unique `{ boardId, email }` only while `pending`

## Decisions to know for the discussion

1. **Outsiders get 404, not 403**, so nobody can tell which board ids exist.
2. **No transactions** (local MongoDB is a single server, not a replica set). Instead:
   - Create board: insert board, then membership; if the membership fails, delete the board again.
   - Delete board: delete the board *first* (access is blocked at once), then its children.
   - Accept: `findOneAndUpdate` with `status: 'pending'` in the filter, so only one request can accept. The unique index stops double membership.
3. **Two invites at the same time:** the partial unique index allows only one pending invitation per email per board.
4. **Invitations are by email**, so you can invite someone before they register. They see it after signing up with that email.
5. **Removed member:** unassigned from this board's cards (`cards.assigneeIds`). **Agree that field name with Batch C.**
6. **Members can rename / change background**; only the owner deletes the board or manages members (like Trello).

## For Batch C and D

Protect any board route with:

```js
import { requireBoardMember } from '../../middleware/boardAccess.js'
router.get('/:boardId/lists', [...requireAuth, requireBoardMember], handler) // req.board, req.membership are set
```

Mount new routers in `server/src/routes.js`. Lists/cards UI goes in `<div className="board-canvas">` in `BoardPage.jsx`.

## Run it

```bash
cd server && npm ci && npm run setup:env && npm run dev
cd client && npm ci && npm run dev        # http://localhost:5173
cd server && npm test                      # needs MongoDB on 127.0.0.1:27017
```

Verified: 29/29 server tests (14 existing auth + 15 new) and 10/10 client tests pass; checked in the browser:
login → dashboard → accept invitation → board page → Share dialog → invite.
