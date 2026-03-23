# Lantern

Lantern is the codename for the new governed app platform project.

Current contents:

- public app/package contract docs
- manifest schema
- SDK contract
- one sample app package
- minimal Deno + Hono application scaffold
- GitHub Actions validation workflow

Repo structure:

- public repo: this directory
- private repo: [private/README.md](private/README.md)

Public starting point:

- [APP_PACKAGE_SPEC.md](APP_PACKAGE_SPEC.md)
- [schemas/app-manifest.schema.json](schemas/app-manifest.schema.json)
- [sdk/app-sdk.ts](sdk/app-sdk.ts)
- [examples/apps/chapter-4-asteroids/README.md](examples/apps/chapter-4-asteroids/README.md)
- [src/app.ts](src/app.ts)

Stack:

- Deno
- Hono
- Postgres next
- hand-written SQL next
- server-rendered HTML
- `oxfmt`
- `oxlint`

Commands:

- `deno task dev`
- `deno task fmt`
- `deno task lint`
- `deno task check`
- `deno task test`
- `deno task validate`

Private strategy starting point:

- [private/strategy/PRODUCT_PRD.md](private/strategy/PRODUCT_PRD.md)
- [private/strategy/DESIGN.md](private/strategy/DESIGN.md)
- [private/strategy/APP_RUNTIME_MODEL.md](private/strategy/APP_RUNTIME_MODEL.md)
