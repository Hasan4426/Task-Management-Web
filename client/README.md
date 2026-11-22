# Frontend workspace

This directory is reserved for the React application and is its deployment root.

```text
src/
  features/
    auth/          Registration/login/session UI placeholder
    boards/        Board UI placeholder
    cards/         Card/list UI placeholder
  components/      Shared UI placeholder
  api/             Shared HTTP client placeholder
```

The private package manifest and lockfile reserve this workspace. React, application
source and dev/build scripts have not been added. Initialize the frontend directly
here when implementation begins, preserving the folder layout.

`npm ci` verifies the current dependency-free package. It does not start a website.
Replace `.gitkeep` files as real components and modules are added.
