# Frontend

Hasan owns the React authentication frontend. This directory is its deployment root.

The frontend application has not been initialized. `package.json` and its lockfile
reserve the workspace; they do not yet install React or provide dev/build scripts.
Initialize the application directly here, preserving this layout rather than creating
a second nested frontend folder.

```text
src/
  features/
    auth/          Registration, login and session state
    boards/        Board screens and interactions
    cards/         Card/list interfaces
  components/      Reusable UI shared across features
  api/             Shared HTTP client and request handling
```

The `.gitkeep` files preserve empty directories on GitHub and can be removed when
real files are added. They are not feature implementations.

Use [the backend README](../server/README.md) for the working authentication API.
During local development, use frontend origin `http://localhost:5173`, API base URL
`http://localhost:3000`, credentialed requests and the required mutation header.
