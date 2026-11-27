# Part 1: Boards (Toqa)

Built on top of `feature/auth-backend` (commit `94badc6`). Copy these files into the repo at the same paths.
This version runs on its own, without Sama's invitation code.

## Files

**New**
- `server/src/features/boards/boards.routes.js`: the 5 board endpoints
- `server/src/features/boards/boards.shared.js`: input validation, response shape, loading members
- `server/src/middleware/boardAccess.js`: `requireBoardMember` and `requireBoardOwner` (Sama and Batch C/D reuse these)
- `server/src/middleware/json.js`: JSON body parser + content-type check
- `server/src/routes.js`: where every feature mounts its routes
- `server/test/boards.test.js`: 9 tests
- `client/src/router.js`: tiny hash router (`#/` and `#/b/<id>`)
- `client/src/components/AppHeader.jsx`, `Avatar.jsx`: top bar with account menu and logout
- `client/src/features/boards/Dashboard.jsx`: "Your boards" page
- `client/src/features/boards/CreateBoardPopover.jsx`: create board with background picker
- `client/src/features/boards/BoardPage.jsx`: board header: edit title, members, menu (background, delete)
- `client/src/features/boards/boardsApi.js`, `backgrounds.js`
- `client/src/styles.css`: Trello-like styling

**Changed**
- `server/src/database.js`: `boards` + `boardMembers` collections and indexes
- `server/src/index.js`: passes `registerRoutes` to `createApp`
- `client/src/App.jsx`: signed-in users see the header + dashboard/board page
- `client/src/main.jsx`: imports `styles.css`
- `client/src/features/auth/auth.test.jsx`: expects the dashboard instead of the old "Welcome" screen (**tell Hasan**)

## API

| Method | Path | Who | Result |
|---|---|---|---|
| POST | `/api/boards` `{ title, background? }` | signed in | 201 `{ board }`, creator becomes owner |
| GET | `/api/boards?page=1&limit=50` | signed in | `{ boards, page, limit, hasMore }`, only my boards |
| GET | `/api/boards/:boardId` | member | `{ board, members }` |
| PATCH | `/api/boards/:boardId` `{ title?, background? }` | member | `{ board }` |
| DELETE | `/api/boards/:boardId` | owner | 204, deletes the board and everything on it |

Errors: `BOARD_NOT_FOUND` 404 (also for outsiders), `OWNER_ONLY` 403, `VALIDATION_ERROR` 400.

## What Sama plugs in

- `server/src/routes.js`: mount her members/invitations routers
- `server/src/database.js`: add `boardInvitations` + its indexes
- `boardsApi.js`: add her API calls
- `Dashboard.jsx`: `{/* Sama: <InvitationsList /> goes here. */}`
- `BoardPage.jsx`: `{/* Sama: Share button + <ShareDialog /> go here. */}`, plus "Leave board" in the menu for members

## Questions you will likely get in the discussion

- **Why 404 and not 403 for outsiders?** So nobody can discover which board ids exist.
- **How is "only members see a board" enforced?** `requireBoardMember` loads the board and the membership together; if either is missing it throws 404. Every board route uses it.
- **Why no transactions?** Our MongoDB is a single server; transactions need a replica set. Instead: create = insert board, then membership, and undo the board if the membership fails. Delete = delete the board first (access stops at once), then its members, lists, cards, etc.
- **Why the unique index on `{ boardId, userId }`?** A user can't be a member twice, even if two requests arrive at once.
- **How does pagination work?** Read `limit + 1` memberships; if we got the extra one, `hasMore` is true.

## Verified
23/23 server tests (14 auth + 9 boards), 10/10 client tests, and in the browser: log in, create a board, open it, open the board menu.
