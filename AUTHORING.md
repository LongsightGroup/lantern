# Authoring Lantern Apps

Lantern app authoring should be one narrow path:

1. Scaffold one reviewed package from a curated starter.
2. Edit content and UI.
3. Validate the package.
4. Execute preview assertions on Lantern's local runtime seam.
5. Open a live preview URL only when that helps.
6. Import the same package into Lantern's governed inventory.

Do not start by reading internal routes or admin code.

## Start Here

List the curated starters:

```sh
deno task app:new --list-starters
```

If you are building a general reviewed activity, scaffold `simple-activity`:

```sh
deno task app:new /tmp/my-lantern-app --starter=simple-activity --app-id=my-app --title="My App"
```

If you are building a reviewed browser autograder, scaffold
`browser-autograder`:

```sh
deno task app:new /tmp/my-browser-autograder --starter=browser-autograder --app-id=my-autograder --title="My Autograder"
```

Then run the same loop for either starter:

```sh
deno task app:validate /tmp/my-browser-autograder
deno task app:test-preview /tmp/my-browser-autograder
deno task app:preview /tmp/my-browser-autograder
```

Use `app:preview` when you want a live browser URL. `app:test-preview` is the
faster contract check for `preview/tests.json`.

If you want the concrete browser-autograder path after scaffolding, read:

- [BROWSER_AUTOGRADER_COOKBOOK.md](BROWSER_AUTOGRADER_COOKBOOK.md)
- [examples/apps/template/README.md](examples/apps/template/README.md)
- [examples/apps/web-checkup/README.md](examples/apps/web-checkup/README.md)
- [examples/apps/typescript-ladder-game/README.md](examples/apps/typescript-ladder-game/README.md)

If you also want Lantern's local admin and package review UI on your machine,
run:

```sh
deno task local:init
deno task local:bootstrap
deno task local:start
```

Then open the localhost URL printed by Wrangler.

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
  grading/
    specs/
      checks.spec.js
  evidence/
    example-output.json
```

`grading/` plus `evidence/` are part of the `browser-autograder` starter. The
`simple-activity` starter omits them. Optional folders like `scoring/` and
extra files under `dist/` are fine, but this is the baseline to optimize for.

## What To Edit

For most new apps, edit these files first:

- `manifest.json`
- `content/activity.json`
- `dist/index.html`
- `dist/app.js`
- `preview/fixtures.json`
- `preview/tests.json`

If you scaffolded `browser-autograder`, also edit:

- `grading/specs/checks.spec.js`
- `evidence/example-output.json`

## Runtime Contract

The app should only talk to Lantern through `window.GatewayApp`.

Use:

- `getLaunchContext()`
- `getActivityContent()`
- `readLocalState()`
- `writeLocalState(value)`
- `emitAttemptEvent(event)`
- `submitEvidenceArtifact(input)`
- `submitScoreProposal(input)`
- `finalizeAttempt(input)`

The contract lives at:

- [APP_PACKAGE_SPEC.md](APP_PACKAGE_SPEC.md)
- [schemas/app-manifest.schema.json](schemas/app-manifest.schema.json)
- [sdk/app-sdk.ts](sdk/app-sdk.ts)

The local preview command injects the same `GatewayApp` browser seam Lantern
uses at runtime. Do not build a second standalone code path inside the app. If
the reviewed package supports anonymous evidence, use `submitEvidenceArtifact()`
to send governed artifacts back to Lantern. Structured JSON is the canonical
evidence example. A `screenshot_png` artifact is optional supplemental
screenshot evidence, not a second submission model. Lantern owns storage,
submission binding, finalize, grading, and audit for both paths.

## Local Commands

List curated starters:

```sh
deno task app:new --list-starters
```

Scaffold one package:

```sh
deno task app:new /path/to/app --starter=simple-activity --app-id=my-app --title="My App"
```

Validate one package:

```sh
deno task app:validate /path/to/app
```

Execute preview assertions:

```sh
deno task app:test-preview /path/to/app
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
- preview tests JSON shape and executable assertion contract
- content JSON when `read_activity_content` is declared

What preview does today:

- injects `window.GatewayApp`
- serves reviewed content JSON
- keeps local state in memory
- records attempt events in memory
- accepts governed evidence artifacts
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
- direct D1 database calls
- arbitrary outbound HTTP
- direct grade writes
- fallback-heavy runtime branches

## Preview Files

`preview/fixtures.json` seeds the local runtime with:

- fake launch context
- fake attempt id
- initial local state

`preview/tests.json` is a simple list of DOM assertions that describe what must
be visible in preview. Run `deno task app:test-preview /path/to/app` to execute
those assertions on Lantern's local preview seam. Keep the checks narrow:
selector existence, exact text, or contains text. This is a reviewed package
checklist, not a second browser automation product.

## Publish And Import

The package directory is the canonical Lantern artifact for authoring, review,
and admin import.

When you want to move a reviewed package into Lantern's governed inventory:

1. Start Lantern locally.
2. Open `/admin/packages/import` on the localhost URL printed by Wrangler.
3. Choose the exact package directory you scaffolded and validated locally.

Lantern validates the manifest and referenced files, stores an immutable
reviewed snapshot under `var/packages/<app-id>/<version>/...`, signs the
reviewed runtime contract for that artifact, and then adds the version to admin
inventory for approval and LMS setup.

Reference apps still live at `/admin/packages/reference`, but they are samples.
The primary operator path is importing your own reviewed package directory.
