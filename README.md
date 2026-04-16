# Lantern

Lantern runs small learning apps through one LMS integration.

It handles LTI login and launch, Deep Linking, grade publishing, and admin tools
so the app package itself can stay simple.

## Try A Browser Autograder In 2 Minutes

If you want to evaluate Lantern as a JS/TS teaching tool, start here instead of
with the full platform install:

1. Install [Deno](https://deno.com/).
2. Run `deno task app:preview examples/apps/typescript-ladder-game`.
3. Open the localhost URL printed by the command.

This path does not need Postgres, LMS setup, or Cloudflare. It runs the same
browser authoring seam Lantern uses for local package preview, so you can judge
the app model first.

## Run Lantern Locally

When you want the full local admin and review flow, use the built-in local
bootstrap path:

```sh
deno task local:init
createdb lantern
deno task local:bootstrap
deno task local:start
```

Then open `http://localhost:8417/admin/packages`.

For arbitrary reviewed packages, use
`http://localhost:8417/admin/packages/import`. Reference apps remain available
at `http://localhost:8417/admin/packages/reference`.

If `createdb` is not installed on your machine, create a local Postgres database
named `lantern` however you normally manage Postgres and then continue.

What these commands do:

- `local:init` writes `.env.local`, generates a local development signing key,
  and creates Lantern's local artifact directories
- `local:bootstrap` runs migrations and seeds the shipped reference packages,
  including Template App, Web Checkup, and TypeScript Ladder Game
- `local:start` runs Lantern with `.env.local`

If your local Postgres uses a different host, user, password, or database, edit
`.env.local` after `local:init` before running `local:bootstrap`.

## JS/TS Authoring Path

Lantern app authoring is intentionally narrow:

1. Scaffold one reviewed package from a curated starter.
2. Edit HTML, CSS, JavaScript, and JSON content.
3. Validate the package.
4. Execute preview assertions through Lantern's local browser seam.
5. Open a live preview URL only when that helps.
6. Import the same package into Lantern for review and inventory.

Start with:

- [AUTHORING.md](AUTHORING.md)
- [AUTHORING_FOR_LLMS.md](AUTHORING_FOR_LLMS.md)
- [BROWSER_AUTOGRADER_COOKBOOK.md](BROWSER_AUTOGRADER_COOKBOOK.md)
- [examples/apps/template/README.md](examples/apps/template/README.md)
- [examples/apps/web-checkup/README.md](examples/apps/web-checkup/README.md)
- [examples/apps/typescript-ladder-game/README.md](examples/apps/typescript-ladder-game/README.md)

Common path:

```sh
deno task app:new /tmp/my-lantern-app --starter=simple-activity --app-id=my-app --title="My App"
deno task app:validate /tmp/my-lantern-app
deno task app:test-preview /tmp/my-lantern-app
deno task app:preview /tmp/my-lantern-app
```

Use `--starter=browser-autograder` when the reviewed package needs
`grading/specs/*.js` plus `evidence/example-output.json`.

## What Lantern Is Good For

- running small learner-facing apps through one LMS integration
- packaging browser-first learning activities as signed, versioned app packages
- keeping LMS credentials and service calls in Lantern instead of in app code
- supporting Deep Linking without ad hoc placement setup
- publishing grades and roster checks from the server
- giving admins one place to inspect deployments, retries, and audit records

## What Lantern Is Not

- a general app hosting platform
- an LMS replacement
- a pile of compatibility shims for every LMS quirk
- a way to hand raw LMS tokens or database access to generated apps
- a backend framework for arbitrary server code inside app packages

## How It Works

At a high level:

1. An app package is imported, reviewed, and versioned.
2. Lantern stores one exact LMS setup record for each supported deployment.
3. The LMS launches Lantern over LTI 1.3.
4. Lantern validates the launch, creates a runtime session, and loads the app
   package.
5. Lantern, not the app, owns Deep Linking return, placement creation, grade
   publication, and audit records.

This keeps the design simple:

- apps get launch context, content, and the features Lantern exposes to them
- apps do not get raw LMS access tokens
- apps do not get arbitrary outbound HTTP
- apps do not get direct grade-write power
- apps do not get direct database access

## LTI In Reality

Lantern implements LTI against real LMS behavior, not just the clean examples
from the spec.

Examples of realities Lantern already accounts for include:

- exact launch verification against the saved LMS setup
- one JWKS refetch during key rotation races
- Deep Linking replay protection
- sparse or partial AGS line item responses
- one token refresh retry on LMS service `401`s
- proxy-aware public origin resolution for Cloudflare Workers and other reverse
  proxy deployments
- audit events when Lantern has to take a recovery path

The goal is still one correct path. Lantern only adds recovery behavior where
real LMS behavior requires it and where the behavior stays clear.

## Launch State Without Third-Party Cookies

Lantern does not need a browser cookie to track LTI launch `state`.

Instead, Lantern treats `state` as a one-time server-side record:

1. On login initiation, Lantern generates a random `state` and `nonce`.
2. Lantern stores them with the expected LMS identity and launch facts:
   `issuer`, `client_id`, `deployment_id`, `target_link_uri`, expiry, and
   `used_at`.
3. Lantern sends the random `state` and `nonce` to the LMS authorization flow.
4. On the signed launch back, Lantern loads the saved record by `state`.
5. Lantern verifies that the launch JWT matches the saved record, especially
   `nonce`, `deployment_id`, and `target_link_uri`.
6. Lantern atomically marks the state as used so it cannot replay.

This means the browser does not need to hold the real launch state in a
third-party cookie. If the LMS is embedding Lantern in an iframe and the browser
blocks third-party cookies, the launch can still be correlated because the real
state lives in Lantern's database.

## Cloudflare And Proxy Deployment

Lantern is expected to run either directly on Cloudflare Workers or behind a
reverse proxy.

For public LTI URLs, Lantern resolves its public origin in this order:

1. `Forwarded` / `X-Forwarded-*` request headers
2. `APP_ORIGIN`
3. the raw request origin

This keeps LTI config, login redirects, dynamic registration callbacks, and Deep
Linking responses consistent when Lantern is deployed behind Cloudflare or
another proxy.

The repo now treats the Workers entrypoint at [src/worker.ts](src/worker.ts) as
the canonical runtime path. The Deno server entrypoint in [main.ts](main.ts) is
a local adapter for development and tooling. The repo also includes a starter
Wrangler config at [wrangler.jsonc](wrangler.jsonc).

Current Workers boundaries:

- Lantern still owns the top-level reviewed runtime session document, signed
  bootstrap injection, JSON content bridge, local-state/event/evidence/score
  mutations, and audit boundary
- on Workers, immutable reviewed entrypoint HTML, reviewed static assets, and
  reviewed browser-grader files launch through a reviewed-identity-keyed Dynamic
  Worker envelope created from a Worker Loader binding named `LOADER`
- that Dynamic Worker envelope is browser-first and read-only: it serves only
  reviewed immutable bytes, receives no Hyperdrive, LMS, or generic outbound
  capability, and sets `globalOutbound: null`
- reviewed package snapshots are also written to and reloaded from that same
  `PACKAGE_ARTIFACTS` bucket on Workers
- arbitrary reviewed package imports and curated reference app imports follow
  the same governed snapshot flow and land under
  `var/packages/<app-id>/<version>/...`
- repository-backed routes use Postgres through a Hyperdrive binding named
  `HYPERDRIVE`
- curated reference package imports on Workers read source files from
  `PACKAGE_ARTIFACTS` under `reference-packages/<app-id>/source`
- the Wrangler starter enables `nodejs_compat` and Smart Placement because
  Lantern makes multiple database queries per request
- both Wrangler configs now include `worker_loaders` for the `LOADER` binding
  used to cache Dynamic Workers by reviewed runtime identity instead of by
  session id

The R2 bucket should contain two key layouts:

- reviewed snapshots under `var/packages/<app-id>/<version>/...`, for example
  `var/packages/<app-id>/<version>/dist/index.html`
- curated reference package sources under
  `reference-packages/<app-id>/source/...`, for example
  `reference-packages/chapter-4-asteroids/source/manifest.json`

At import time Lantern persists the immutable snapshot, derives the reviewed
artifact digest from stored files, and signs the reviewed runtime contract that
runtime launch later verifies. On Workers, Lantern uses that reviewed identity
to key the Dynamic Worker envelope, so the same approved package bytes can be
reused across sessions without turning reviewed packages into arbitrary
server-side apps. The Worker app path no longer depends on local disk for demo
package import or reviewed runtime delivery. The remaining deployment work is
operational: provision the curated reference package source files into
`PACKAGE_ARTIFACTS` as part of your Cloudflare bootstrap or release flow.

For local Worker development, Wrangler now builds a single generated Worker
artifact through `deno task build:worker` before `dev` or `deploy`. The repo
also enforces `deno task check:worker`, which rebuilds the Worker bundle and
fails if Deno-only runtime references slip back into it. The generated file is
`output/worker.bundle.mjs` and is not checked in.

To run the Worker locally:

- set Worker vars such as `APP_ORIGIN` and `LTI_TOOL_PRIVATE_JWK` with
  `--var ...` flags or `.dev.vars`
- keep the `LOADER` Worker Loader binding present; Lantern uses it for the
  governed Dynamic Worker envelope around immutable reviewed runtime delivery
- prefer exporting `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`
  with your real local Postgres connection string before `wrangler dev --local`;
  Wrangler uses that to override the sample
  `hyperdrive[0].localConnectionString` in `wrangler.jsonc` without editing the
  checked-in file
- if you do not use the override env var, replace `wrangler.jsonc`
  `hyperdrive[0].localConnectionString` with a real local Postgres connection
  string before using repository-backed admin routes like `/admin/packages`
- when using `wrangler dev --local`, make sure that local Hyperdrive connection
  string includes a password segment because Miniflare rejects passwordless DSNs
  even if your local Postgres allows them
- if you want the demo import path to work on Workers, seed
  `PACKAGE_ARTIFACTS/reference-packages/<app-id>/source/...` in your local or
  remote R2 bucket before calling `/admin/packages/import-reference`
- then run `npx wrangler dev --local`

The reviewed runtime contract remains the same across local Deno preview and the
Cloudflare-native Worker path. The browser still sees one Lantern-owned session
document plus the same `GatewayBootstrap` and `GatewayApp` bridge. What changes
on Workers is only the immutable delivery substrate for reviewed browser-first
package bytes. This is a governed reviewed-runtime envelope, not a generic
code-hosting path for arbitrary uploaded server logic.

## Public Entry Points

- Authoring guide: [AUTHORING.md](AUTHORING.md)
- LLM authoring guide: [AUTHORING_FOR_LLMS.md](AUTHORING_FOR_LLMS.md)
- Browser autograder cookbook:
  [BROWSER_AUTOGRADER_COOKBOOK.md](BROWSER_AUTOGRADER_COOKBOOK.md)
- App package contract: [APP_PACKAGE_SPEC.md](APP_PACKAGE_SPEC.md)
- Manifest schema:
  [schemas/app-manifest.schema.json](schemas/app-manifest.schema.json)
- SDK contract: [sdk/app-sdk.ts](sdk/app-sdk.ts)
- Sample app packages:
  [examples/apps/chapter-4-asteroids/README.md](examples/apps/chapter-4-asteroids/README.md)
  and [examples/apps/quick-study/README.md](examples/apps/quick-study/README.md)
  These are governed reference apps, not a generic app gallery.
- Browser autograder demos:
  [examples/apps/web-checkup/README.md](examples/apps/web-checkup/README.md) and
  [examples/apps/typescript-ladder-game/README.md](examples/apps/typescript-ladder-game/README.md)
- Browser-autograder starter reference:
  [examples/apps/template/README.md](examples/apps/template/README.md)
- Canonical Workers entrypoint: [src/worker.ts](src/worker.ts)
- Local Deno app wrapper: [src/app.ts](src/app.ts)
- Local Deno server entrypoint: [main.ts](main.ts)

## Stack

- Deno
- Hono
- Postgres
- hand-written SQL
- server-rendered HTML
- plain CSS tokens

## Local Development

Fast path:

```sh
deno task local:init
createdb lantern
deno task local:bootstrap
deno task local:start
```

Open `http://localhost:8417/admin/packages`.

If `createdb` is not installed, create the `lantern` database through your
normal Postgres tooling before `deno task local:bootstrap`.

Generated local environment:

- `.env.local`: written by `deno task local:init`
- `PORT`: defaults to `8417`
- `APP_ORIGIN`: defaults to `http://localhost:8417`
- `APP_RUNTIME_ORIGIN`: defaults to `http://localhost:8417` so local preview and
  reviewed runtime stay on one origin
- `DATABASE_URL`: defaults to
  `postgres://localhost:5432/lantern?sslmode=disable`
- `LTI_TOOL_PRIVATE_JWK`: generated automatically for local development

Manual minimum environment if you do not use `local:init`:

- `DATABASE_URL`: Postgres connection string
- `DATABASE_CA_CERT`: optional PEM CA certificate for managed Postgres providers
  such as DigitalOcean
- `LTI_TOOL_PRIVATE_JWK`: one RSA private JWK used to publish Lantern's public
  JWKS and sign LTI assertions
- `APP_ORIGIN`: recommended for stable local config and required anywhere
  Lantern must publish fixed public URLs without proxy headers
- `APP_RUNTIME_ORIGIN`: required anywhere Lantern must publish runtime URLs for
  attempts and app sessions

Common commands:

- `deno task local:init`
- `deno task local:migrate`
- `deno task local:seed`
- `deno task local:bootstrap`
- `deno task local:start`
- `deno task local:dev`
- `deno task dev`
- `deno task start`
- `deno task app:new --list-starters`
- `deno task app:new <output-root> --starter=<id> --app-id=<app-id> --title="<title>"`
- `deno task app:validate <package-root>`
- `deno task app:test-preview <package-root>`
- `deno task app:preview <package-root>`
- `deno task fmt`
- `deno task fmt:check`
- `deno task lint`
- `deno task check`
- `deno task check:worker`
- `deno task test`
- `deno task validate`

Default local port: `8417`

## Repo Map

- `src/lti/`: LTI login, launch validation, Deep Linking, service calls, and
  config publishing
- `src/package_review/`: package import, review persistence, placements, runtime
  session persistence, and audit events
- `src/runtime/`: runtime and grade publishing code
- `src/admin/`: server-rendered admin pages
- `sdk/`: app-facing contract
- `examples/`: sample app packages
- `schemas/`: public package schema

## Current Scope

This repo is the public code and docs. It intentionally focuses on:

- runtime interfaces
- schemas
- SDKs
- sample apps
- public implementation code

Private strategy, security notes, infra specifics, pricing, and other internal
operational material stay out of this repo.
