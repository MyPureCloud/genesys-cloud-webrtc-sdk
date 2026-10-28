# AGENTS.md

Guidance for AI agents (and humans) working in this repo. This file is the hub —
it links out to the detailed docs under `ai/`.

## What this is

`genesys-cloud-webrtc-sdk` — a **TypeScript browser SDK** wrapping
`genesys-cloud-streaming-client` for WebRTC softphone, video, screen-share, and
screen-recording. Built with Jest + ts-jest, runs under jsdom. Hosted on GitHub.

## Versioning & branching

- **Hosted on GitHub** (`MyPureCloud/genesys-cloud-webrtc-sdk`); use `gh` for PRs.
  Published to the **public npm registry** (not Nexus).
- **Gitflow.** `develop` is the integration branch; feature/fix branches cut from
  and PR back into `develop`; releases flow `develop` → `main`. Open PRs against
  **`develop`**, never `main`/`master`.
- **Semantic Versioning (semver).** Version in `package.json` (`MAJOR.MINOR.PATCH`).
  Breaking API changes bump MAJOR, backward-compatible features MINOR, fixes
  PATCH. The build injects the version into bundles (`scripts/build.ts`), and the
  changelog groups entries under an Unreleased → version compare link.
- **Update `changelog.md`** on every PR (Keep a Changelog format; link the Jira
  key).

## Build / test / lint

```bash
# Install — GitHub repo, use the PUBLIC npm registry (NOT Nexus)
npm install --registry=https://registry.npmjs.org

npm test                 # lint + full unit + IT suite (100% coverage gate)
npm run build            # ts-node scripts/build.ts
npm run lint             # ESLint over src

# Run a subset
npx jest test/integration --runInBand --collectCoverage=false
npx jest test/integration/<file> --runInBand --collectCoverage=false
```

## Conventions

- **Architecture / mental model:** [ai/architecture.md](ai/architecture.md) —
  module map, init lifecycle, inbound event flow, session routing, outward
  boundaries. Read this before changing session/client code.
- **Coding conventions:** [ai/conventions.md](ai/conventions.md) — `SdkError`
  usage, HTTP helpers, event emission, enums, logging, handler patterns.
- **Testing standards:** [ai/test-standards.md](ai/test-standards.md) — unit
  (white-box) vs integration (black-box) tests + the `node:http` mock-server
  recipe. Read before adding or changing tests.
- **Workflow:** [ai/contributing-workflow.md](ai/contributing-workflow.md) —
  branch/PR/changelog/CI, build pipeline, demo apps.
- **Coverage gate is 100%** (branches/functions/lines/statements). The
  hardware/browser layer (media, headset, stats, audio-processor) is
  unit-tested; the logic layer (sessions, client API) is integration-tested.
- **PR base branch is `develop`**, not `main`/`master`.
- **Update `changelog.md`** on every PR.

## Gotchas

- npm registry: always `--registry=https://registry.npmjs.org` (this repo is not
  on Nexus).
- Tests run under **jsdom**; black-box HTTP ITs force the axios node adapter to
  reach the real mock server (details in `ai/test-standards.md`).
- No JVM / Docker needed for any test.
