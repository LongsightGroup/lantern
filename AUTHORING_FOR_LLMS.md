# Writing Lantern Apps With LLMs

If you are generating a Lantern app, follow this exactly.

## Goal

Produce one browser-only app package that runs through Lantern's governed
runtime surface.

## Required Output

Create exactly these files unless the user asks for more:

```text
my-app/
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

## Hard Rules

- Use only browser code in `dist/`.
- Assume Lantern injects `window.GatewayApp` and `window.GatewayBootstrap`.
- Do not add backend code.
- Do not call LMS APIs directly.
- Do not fetch arbitrary external URLs.
- Do not write grades directly.
- Do not add a standalone fallback runtime path.
- Put lesson-specific data in `content/activity.json`.
- Keep the app small, obvious, and easy to review.

## Manifest Rules

- `schema_version` must be `"1"`.
- `entrypoint` must be `"/dist/index.html"` or another HTML file under `/dist`.
- `app_id` must be lowercase letters, numbers, and hyphens.
- Keep `capabilities` to the minimum needed.
- Include `preview.fixtures_file` and `preview.tests_file`.

## SDK Surface

The app may use:

- `window.GatewayApp.getLaunchContext()`
- `window.GatewayApp.getActivityContent()`
- `window.GatewayApp.readLocalState()`
- `window.GatewayApp.writeLocalState(value)`
- `window.GatewayApp.emitAttemptEvent(event)`
- `window.GatewayApp.submitScoreProposal(input)`
- `window.GatewayApp.finalizeAttempt(input)`

The app must not expect:

- raw LMS tokens
- arbitrary network access
- database access
- server-side execution inside the package

## Preview Files

`preview/fixtures.json` must include:

- `launch.user_role`
- `launch.course_id`
- `launch.assignment_id`
- `launch.activity_id`
- `attempt_id`
- `local_state`

`preview/tests.json` must be an array of objects like:

```json
[
  {
    "name": "renders title",
    "assert": {
      "selector": "[data-test='app-title']",
      "text": "My App"
    }
  }
]
```

Each test needs:

- `name`
- `assert.selector`

Optional:

- `assert.text`
- `assert.contains`

Use only one of `text` or `contains` per test.

## Best Pattern

Use this structure in `dist/app.js`:

1. Read `window.GatewayApp`.
2. Load launch context, content, and local state.
3. Render one clear learner task.
4. Write local state after meaningful actions.
5. Emit attempt events for answers or progress.
6. Finalize once the task is complete.

## Recommended Prompt Skeleton

Use this when generating a new Lantern app:

```text
Create a Lantern app package by copying the structure of examples/apps/template.

Constraints:
- Browser-only code
- No external network calls
- No backend code
- No fallback runtime path
- Use window.GatewayApp for launch context, content, local state, events, and finalize
- Put lesson data in content/activity.json
- Include preview/fixtures.json and preview/tests.json

Return the full contents of:
- manifest.json
- dist/index.html
- dist/app.js
- content/activity.json
- preview/fixtures.json
- preview/tests.json
```

## Validation

After generating the package, run:

```sh
deno task app:validate /path/to/app
deno task app:preview /path/to/app
```
