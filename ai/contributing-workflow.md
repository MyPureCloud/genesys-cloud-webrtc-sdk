# Contributing Workflow — genesys-cloud-webrtc-sdk

How changes get made and shipped in this repo. Facts here are specific to this
project; follow them exactly.

## Hosting & registry

- **GitHub**: `mypurecloud/genesys-cloud-webrtc-sdk`. Use `gh` for PRs (not
  Bitbucket MCP tools).
- **npm registry**: always install with the **public** registry — this repo is
  not on Nexus:
  ```bash
  npm install --registry=https://registry.npmjs.org
  ```
- Node version: see `.nvmrc` (`nvm use`).

## Branching & PRs

- **Base branch is `develop`**, not `main`/`master`. Open PRs against `develop`;
  confirm with `git ls-remote --heads origin develop`.
- Branch naming: use the Jira ticket key where applicable (e.g. `STREAM-1234`).
- **Update `changelog.md`** on every PR — add a line under the top/unreleased
  section describing the change. Reviewers block PRs missing a changelog entry.
- Keep PRs focused; this SDK is a published package consumed by many apps.

## Before you push — local gates

```bash
npm run lint      # ESLint over src — must pass
npm test          # lint + full unit + IT suite under the 100% coverage gate
```

- The coverage gate is **100%** (branches/functions/lines/statements) in
  `jest.config.js`. New code needs tests or it fails the gate.
- For tests specifically, follow `ai/test-standards.md` (unit = white-box,
  IT = black-box via the mock server).

## CI

- GitHub Actions runs on PRs (`.github/workflows`). Check the run after pushing
  and fix failures before requesting review.
- `pre-push` hook runs `test` (see `package.json`). Don't bypass it.

## Build & release pipeline

`npm run build` runs `scripts/build.ts`, which produces several artifacts:
- `build:cjs` → `dist/cjs` (CommonJS, `main`)
- `build:es` → `dist/es` (ES modules, `module` + `typings`)
- `build:rollup` → bundled ES
- `build:cdn` → webpack CDN bundle under a versioned dir

The build injects the package version into the `__GENESYS_CLOUD_WEBRTC_SDK_VERSION__`
placeholder in the CJS/ES `client` files and the CDN bundles, then copies the
versioned CDN files to the major-version dir and `dist/` root for backward-compat
load paths (`node_modules/genesys-cloud-webrtc-sdk/dist/genesys-cloud-webrtc-sdk.js`).

Do not hand-edit `dist/` — it is generated. Change `src` and rebuild.

## Local demo / manual testing

- `react-demo-app/` is a Vite app for exercising the SDK by hand.
- `test/test-pages/` has build scripts and sample pages (`npm run build:sample`,
  `npm run start:sample`).

## Docs to read first

- [AGENTS.md](../AGENTS.md) — the hub (commands, gotchas).
- [ai/architecture.md](architecture.md) — module map + call flow.
- [ai/conventions.md](conventions.md) — error/HTTP/event/type patterns.
- [ai/test-standards.md](test-standards.md) — unit vs IT, mock-server recipe.
