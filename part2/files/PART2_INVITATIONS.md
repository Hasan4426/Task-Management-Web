# Part 2: Invitations and members (Sama)

**Copy this zip on top of Toqa's Part 1.** It replaces a few of Part 1's files with versions that also include Sama's code.
Part 1 + this zip = the full Batch B (29/29 server tests, 10/10 client tests pass).

## Sama's own files (new)
- `server/src/features/boards/invitations.routes.js`: all member and invitation endpoints
- `client/src/features/boards/ShareDialog.jsx`: "Share board" dialog: invite by email, members, remove, cancel invites
- `client/src/features/boards/InvitationsList.jsx`: "Invitations" box on the dashboard with Accept / Decline

## Part 1 files Sama adds to
- `server/src/database.js`: `boardInvitations` collection + indexes
- `server/src/routes.js`: mounts the two new routers
- `server/src/features/boards/boards.shared.js`: `invitationInput`, `publicInvitation`, `INVITATION_TTL_MS`
- `server/test/boards.test.js`: invitation/member tests (uses the real invite + accept flow)
- `client/src/features/boards/boardsApi.js`: member and invitation API calls
- `client/src/features/boards/Dashboard.jsx`: shows `<InvitationsList />`
- `client/src/features/boards/BoardPage.jsx`: Share button, `<ShareDialog />`, "Leave board" for members
- `client/src/features/auth/auth.test.jsx`: test stub also answers `/api/invitations`

## API

| Method | Path | Who | Result |
|---|---|---|---|
| GET | `/api/boards/:boardId/members` | member | `{ members }` |
| DELETE | `/api/boards/:boardId/members/:userId` | owner (anyone), member (only themself = leave) | 204 |
| GET | `/api/boards/:boardId/invitations` | owner | `{ invitations }`, pending only |
| POST | `/api/boards/:boardId/invitations` `{ email }` | owner | 201 `{ invitation }`, expires in 7 days |
| DELETE | `/api/boards/:boardId/invitations/:invitationId` | owner | 204 (revoked) |
| GET | `/api/invitations` | signed in | `{ invitations }` sent to my email |
| POST | `/api/invitations/:invitationId/accept` | the invited email | `{ board }` |
| POST | `/api/invitations/:invitationId/decline` | the invited email | 204 |

Errors: `ALREADY_MEMBER` / `ALREADY_INVITED` 409, `INVITATION_NOT_FOUND` 404, `MEMBER_NOT_FOUND` 404,
`OWNER_CANNOT_LEAVE` 400, `OWNER_ONLY` 403, `VALIDATION_ERROR` 400.

## Questions Sama will likely get in the discussion
- **What if the owner clicks "Invite" twice at once?** A partial unique index on `{ boardId, email }` where `status: 'pending'` lets only one pending invitation exist; the second insert fails and returns 409.
- **What if someone accepts twice at once?** `findOneAndUpdate` only matches `status: 'pending'`, so only one request can switch it to accepted. The unique `{ boardId, userId }` index also blocks a double membership.
- **Can I accept someone else's invitation?** No. The filter includes `email: req.user.email`.
- **Why invite by email and not user id?** You can invite people before they sign up; they see the invite once they register with that email.
- **What happens when a member is removed?** Their membership is deleted, so `requireBoardMember` blocks them at once, and they're unassigned from the board's cards (`cards.assigneeIds`, agree that name with Batch C).
- **Expired invitations?** They can't be accepted (`expiresAt > now` in the filter), and they are marked `expired` before a new invite so they don't block it.
