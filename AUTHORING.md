# Authoring Lantern Apps

Lantern app authoring should be one narrow path:

1. Copy the template app package.
2. Edit content and UI.
3. Validate the package.
4. Preview it through Lantern's local runtime seam.

Do not start by reading internal routes or admin code.

## Start Here

Copy the template:

```sh
cp -R examples/apps/template /tmp/my-lantern-app
```

Validate it:

```sh
deno task app:validate /tmp/my-lantern-app
```

Preview it:

```sh
deno task app:preview /tmp/my-lantern-app
```

Open the URL printed by the preview command.

If you want a richer browser-autograder example after the template, read:

- [examples/apps/web-checkup/README.md](/Users/samo/dev/lantern/examples/apps/web-checkup/README.md)
- [examples/apps/office-hours-web-lab/README.md](/Users/samo/dev/lantern/examples/apps/office-hours-web-lab/README.md)

If you also want Lantern's local admin and package review UI on your machine,
run:

```sh
deno task local:init
createdb lantern
deno task local:bootstrap
deno task local:start
```

Then open `http://localhost:8417/admin/packages`.

If `createdb` is not installed, create the `lantern` database through your
normal Postgres tooling before `deno task local:bootstrap`.

## Package Shape

Lantern authoring expects this layout:

```text
app/
  manifest.json
  dist/
    index.html
    app.js
  content/
    activity.json
  preview/
    fixtures.json
    tests.json
```

Optional folders like `scoring/` and extra files under `dist/` are fine, but this
is the baseline to optimize for.

## What To Edit

For most new apps, edit these files first:

- [manifest.json](/Users/samo/dev/lantern/examples/apps/template/manifest.json)
- [content/activity.json](/Users/samo/dev/lantern/examples/apps/template/content/activity.json)
- [dist/index.html](/Users/samo/dev/lantern/examples/apps/template/dist/index.html)
- [dist/app.js](/Users/samo/dev/lantern/examples/apps/template/dist/app.js)
- [preview/fixtures.json](/Users/samo/dev/lantern/examples/apps/template/preview/fixtures.json)
- [preview/tests.json](/Users/samo/dev/lantern/examples/apps/template/preview/tests.json)

## Runtime Contract

The app should only talk to Lantern through `window.GatewayApp`.

Use:

- `getLaunchContext()`
- `getActivityContent()`
- `readLocalState()`
- `writeLocalState(value)`
- `emitAttemptEvent(event)`
- `submitScoreProposal(input)`
- `finalizeAttempt(input)`

The contract lives at:

- [APP_PACKAGE_SPEC.md](/Users/samo/dev/lantern/APP_PACKAGE_SPEC.md)
- [schemas/app-manifest.schema.json](/Users/samo/dev/lantern/schemas/app-manifest.schema.json)
- [sdk/app-sdk.ts](/Users/samo/dev/lantern/sdk/app-sdk.ts)

The local preview command injects the same `GatewayApp` browser seam Lantern uses
at runtime. Do not build a second standalone code path inside the app.

## Local Commands

Validate one package:

```sh
deno task app:validate /path/to/app
```

Start preview on the default port:

```sh
deno task app:preview /path/to/app
```

Choose a port explicitly:

```sh
deno task app:preview /path/to/app --port=8421
```

What validation checks today:

- manifest schema and referenced files
- preview fixtures JSON shape
- preview tests JSON shape
- content JSON when `read_activity_content` is declared

What preview does today:

- injects `window.GatewayApp`
- serves reviewed content JSON
- keeps local state in memory
- records attempt events in memory
- accepts score proposals
- finalizes with a fake result and no LMS side effects

## Design Rules

Keep apps small and browser-first.

Prefer:

- plain HTML, CSS, and JavaScript
- lesson data in `content/`
- one obvious interaction loop
- one clear completion path

Do not add:

- backend code
- direct LMS calls
- direct database calls
- arbitrary outbound HTTP
- direct grade writes
- fallback-heavy runtime branches

## Preview Files

`preview/fixtures.json` seeds the local runtime with:

- fake launch context
- fake attempt id
- initial local state

`preview/tests.json` is a simple list of DOM assertions that describe what must
be visible in preview. Lantern validates this file now so authors and LLMs have
a durable checklist format, even though automated execution is not wired into
the CLI yet.

## Current Publish Gap

The current admin import route only handles Lantern's shipped reference apps at
[src/app_admin_inventory_routes.ts](/Users/samo/dev/lantern/src/app_admin_inventory_routes.ts:33).

That means the repo now has a first-class local authoring path, but not yet a
generic operator-facing publish/import flow for arbitrary new app packages.

Until that lands, treat the package directory itself as the canonical artifact
for local authoring and review.
