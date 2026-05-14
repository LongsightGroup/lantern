# Cloudflare D1 Architecture

Lantern's persistence path is Cloudflare-native:

- Cloudflare Workers for compute
- Cloudflare D1 for relational product state
- Cloudflare R2 for reviewed package artifacts and evidence bytes
- Cloudflare Worker Loader / Dynamic Workers for immutable reviewed runtime
  delivery

There is one checked-in persistence implementation: D1. Lantern does not carry
a dual persistence abstraction, an ORM, or any alternate migration path.

## Binding Contract

The Worker must have these bindings:

- `DB`: D1 database binding for all repository-backed product state
- `PACKAGE_ARTIFACTS`: R2 bucket binding for reviewed package snapshots,
  curated reference package sources, and evidence artifacts
- `LOADER`: Worker Loader binding for reviewed Dynamic Worker runtime delivery

The checked-in [wrangler.jsonc](../wrangler.jsonc) intentionally uses public
placeholder values for resource IDs and bucket names. Real Cloudflare account
details, route IDs, bucket names, and secrets stay out of the public repo.

## D1 Schema

Wrangler-managed D1 migrations live in
[`src/db/d1_migrations`](../src/db/d1_migrations).

Schema rules:

- model numeric IDs as `INTEGER PRIMARY KEY AUTOINCREMENT`
- store timestamps as ISO `TEXT`
- store small JSON documents and string arrays as JSON `TEXT`
- parse and stringify JSON at explicit repository boundaries
- use foreign keys, unique constraints, and indexes intentionally
- keep large package bytes and evidence bytes in R2, not D1

## Repository Rules

All repository-backed Worker routes resolve through the `DB` D1 binding.

The D1 repository owns:

- package versions and review decisions
- deployment bindings and LTI profile settings
- one-time LTI login and dynamic registration state
- Deep Linking sessions and reviewed placements
- runtime sessions
- attempts, local state, attempt events, evidence metadata, grade publication,
  and audit events
- preview sessions and preview evidence
- authoring drafts and draft files
- ops control-plane read models

## Runtime Storage Boundary

D1 stores relational state and metadata. R2 stores bytes.

R2 key layouts:

- reviewed snapshots under `var/packages/<app-id>/<version>/...`
- curated reference sources under `reference-packages/<app-id>/source/...`
- evidence artifact bytes under Lantern-owned evidence keys

Reviewed runtime delivery uses the approved package identity to build a
read-only Dynamic Worker envelope. That envelope receives no D1 binding, no LMS
credentials, and no generic outbound capability.

## Local Development

Local full-app development uses Wrangler so the same D1, R2, and Worker Loader
bindings are exercised as the Cloudflare Worker path.

Useful commands:

```sh
deno task local:init
deno task local:bootstrap
deno task local:start
```

`local:bootstrap` applies D1 migrations through Wrangler. `local:start` runs the
Worker through Wrangler.

## Verification

Before finishing persistence or Worker changes, run:

```sh
deno task validate
```

The validation path checks formatting, linting, TypeScript, the Worker bundle,
Worker config bindings, and the test suite. The Worker config check requires
`DB`, `PACKAGE_ARTIFACTS`, and `LOADER`.
