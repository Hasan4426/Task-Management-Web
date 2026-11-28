# Frontend

React authentication UI using the existing Express/MongoDB backend. The interface
uses browser-default HTML controls, without CSS or a styling library.

## Run locally

Use Node.js 26 or newer. Start MongoDB and the backend using
[the backend README](../server/README.md), then:

```bash
cd client
npm ci
npm run dev
```

Open `http://localhost:5173`. The API defaults to `http://localhost:3000`.
The dev server requires port 5173 rather than silently choosing another origin.
To override the API address, copy `.env.example` to `.env` and change
`VITE_API_BASE_URL` (empty means a same-origin `/api` reverse proxy).
The backend's `ALLOWED_ORIGINS` must include the frontend's exact origin.
Use `localhost` consistently for local frontend and API URLs.

```bash
npm test
npm run build
npm run preview
```

Tests exercise the React UI with controlled API responses. They do not replace
the backend's real MongoDB integration tests or browser integration checks.

## Behavior

- Registration sends only name, email and password. Confirmation stays local.
- Login and registration use the real `/api/auth` endpoints and display server errors.
- `/me` restores the user, with explicit loading and retry states. Only a 401 clears
  the session; connection/server failures do not claim the user logged out.
- Successful authentication displays a protected account screen with name and email.
  Replace that landing screen with the board dashboard when it exists.
- The account screen saves display-name changes through `PATCH /api/auth/me`.
  Email is read-only. Refreshing the page restores the saved name through `GET /api/auth/me`.
- Logout handles the empty 204 response. Failed logout preserves the account and offers
  retry. Success unmounts the private screen and clears user state.
- Forms prevent concurrent submissions and honor `Retry-After`, separately for login
  and registration. An account-created/session-failed response moves to login.
- Passwords are sent unchanged, counted as Unicode code points, and never persisted.
  Session cookies belong to the backend; no token storage is used.
- Labels, error summaries, field descriptions and native controls support keyboard use.

## Shared integration points

`src/api/client.js` supplies credentialed requests and the mutation header. Future
protected features should use `apiRequest`; protected API 401s clear authentication.
Login's invalid-credential response is handled locally through `authRequest`.

`src/features/auth/AuthContext.jsx` owns session state. Keep private feature state
inside the authenticated subtree, or clear future external caches on sign-out.
The app rechecks the session on browser page restoration. Login and registration
requests are never automatically retried.

Password recovery, social login, boards and other features are not
implemented by this API and are not presented as working UI flows.

## Manual integration checks

With the real backend running, register and log out, then log in again. Save a new
display name and refresh to confirm that the session restores with the saved name.
Try a duplicate email and incorrect password, then exhaust the login limit.
Stop the backend to check retry behavior. Verify logout followed by Back/refresh
does not reveal the account. Confirm browser storage contains no passwords or tokens.

## Implementation verification

Verified with Node.js 26.13.1: all 10 frontend tests and the production build passed.
The 14 existing backend integration tests passed against an isolated MongoDB 8.2.6.
Headless Chrome exercised the real backend for registration, HttpOnly cookies,
refresh restoration, logout, duplicate emails, incorrect/correct passwords,
invalidated sessions, backend outage/recovery and login rate limiting. No browser
JavaScript errors were observed. Temporary test accounts and databases were removed
with the isolated test instance; these checks do not provision a development database.
