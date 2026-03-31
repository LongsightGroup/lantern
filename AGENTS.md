# Lantern Agent Guide

## Mission

Lantern is a governed app platform for institution-built and AI-built learning
apps.

The product goal is not:

- a general app hosting platform
- an LMS replacement
- a pile of compatibility shims

The product goal is:

- a safe runtime for small learning apps
- one trusted LMS integration boundary
- one review, approval, grading, and audit boundary

Every change should make the product:

- simpler
- safer
- more legible
- more governable

## Non-Negotiables

- Keep the architecture simple.
- Keep the dependency graph small.
- Prefer one correct path over many code paths.
- Do not add fallback behavior unless explicitly requested.
- Fail clearly instead of silently degrading.
- Do not leak private strategy or ops details into the public repo.

## Public vs Private

The public repo is for:

- runtime contracts
- schemas
- SDKs
- sample apps
- public code

The `private/` repo is for:

- product strategy
- design docs
- Cloudflare setup
- security notes
- pricing and go-to-market
- internal ops details

Rules:

- Never copy private docs into the public repo.
- Never reference private secrets, account details, or infra values in public
  code or docs.
- If a public change depends on private context, summarize only the minimum
  needed.

## Stack Decisions

Default stack:

- Deno
- Hono
- Postgres
- hand-written SQL
- server-rendered HTML
- plain CSS tokens
- HTMX only where it clearly helps

Avoid by default:

- React
- ORMs
- Tailwind
- queue platforms
- fallback-heavy abstractions

If you want to introduce one of these, the burden of proof is high.

## TypeScript Rules

TypeScript must stay strict and boring.

- Prefer explicit types on public interfaces.
- No `any`.
- Use `unknown` only when there is a real boundary and narrow it immediately.
- No `@ts-ignore` or `@ts-expect-error` unless explicitly justified in a
  comment.
- No giant generic cleverness.
- No framework magic where plain functions are clearer.
- Model trusted and untrusted data separately.

At trust boundaries:

- validate inputs
- narrow types
- fail clearly

## Simplicity Rules

When writing code:

- choose the smaller design
- choose fewer layers
- choose fewer dependencies
- choose fewer options

Do not write:

- speculative abstractions
- compatibility shims we do not need yet
- multiple runtime paths “just in case”
- hidden fallback flows
- legacy-preserving code unless explicitly required

Do write:

- straightforward functions
- explicit contracts
- obvious data flow
- small modules

## Runtime and Security Rules

The platform is the trusted boundary.

Generated apps should not get:

- raw LMS tokens
- direct database access
- arbitrary outbound HTTP
- direct grade writes

Default runtime model:

- signed app package
- sandboxed frontend activity
- gateway-managed grading
- gateway-managed storage
- gateway-managed connector access

If a change weakens one of those boundaries, stop and justify it explicitly.

## UI Rules

The UI should feel:

- institutional
- clear
- calm
- more modern than Canvas, but compatible with that world

Do not build:

- a flashy startup dashboard
- a React-heavy front end by reflex
- highly custom one-off UI patterns

Prefer:

- server-rendered pages
- strong information hierarchy
- accessible defaults
- reusable tokens
- quiet visual language

## Linting and Verification

Before finishing TypeScript work, run:

- `deno fmt`
- `deno lint`
- `deno check`

If tests exist for the touched area, run them.

Do not claim something is complete if it has not been typechecked.

## Decision Rule

When in doubt:

1. protect the trust boundary
2. keep the code path singular
3. keep the implementation typed
4. keep the dependency count down
5. choose the option that future maintainers will understand fastest
