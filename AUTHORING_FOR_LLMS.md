# Writing Lantern Apps With LLMs

If you are generating a Lantern app, follow the same reviewed package loop a
human author follows.

## Goal

Produce one browser-only app package that runs through Lantern's governed
runtime surface and matches one of the shipped starter shapes.

## Starter Choice

Use exactly one of these starter IDs:

- `simple-activity`
- `browser-autograder`

Choose `browser-autograder` when the task mentions reviewed HTML, CSS, or
JavaScript checks, Jasmine-style specs, reviewed evidence examples, or a
teacher-authored autograder.

## Scaffold Reference

These are the human-facing commands the generated package should align with:

```sh
deno task app:new /tmp/my-app --starter=simple-activity --app-id=my-app --title="My App"
deno task app:new /tmp/my-app --starter=browser-autograder --app-id=my-app --title="My App"
```

## Required Output

For `simple-activity`, return this package shape unless the user asks for more:

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

For `browser-autograder`, include the reviewed grading artifacts too:

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
  grading/
    specs/
      checks.spec.js
  evidence/
    example-output.json
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
- If `grading.mode` is `"browser"`, set `authoring.kind` to
  `"browser_autograder"`.
- If `grading.mode` is `"browser"`, include reviewed
  `authoring.grader_spec_files` and `authoring.evidence_example_file`.

## SDK Surface

The app may use:

- `window.GatewayApp.getLaunchContext()`
- `window.GatewayApp.getActivityContent()`
- `window.GatewayApp.readLocalState()`
- `window.GatewayApp.writeLocalState(value)`
- `window.GatewayApp.emitAttemptEvent(event)`
- `window.GatewayApp.submitEvidenceArtifact(input)`
- `window.GatewayApp.submitScoreProposal(input)`
- `window.GatewayApp.finalizeAttempt(input)`

If anonymous evidence is part of the reviewed package, prefer structured JSON as
the primary evidence artifact and use `screenshot_png` only as supplemental
screenshot evidence. Lantern owns storage, submission binding, finalize,
grading, and audit for both.

The app must not expect:

- raw LMS tokens
- arbitrary network access
- D1 database access
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

## Browser Autograder Files

If the package uses `browser-autograder`, make these files explicit:

- `grading/specs/checks.spec.js` or additional reviewed spec files listed in
  `authoring.grader_spec_files`
- `evidence/example-output.json` as the structured evidence example
- `preview/tests.json` as the local preview assertion contract

Lantern runs the reviewed grader specs through Lantern's own Jasmine harness.
The package does not get arbitrary server-side execution.

## Best Pattern

Use this structure in `dist/app.js`:

1. Read `window.GatewayApp`.
2. Load launch context, content, and local state.
3. Render one clear learner task.
4. Write local state after meaningful actions.
5. Emit attempt events for answers or progress.
6. If reviewed evidence is required, call `submitEvidenceArtifact()` with
   structured JSON and only add a screenshot when the package contract calls for
   supplemental screenshot evidence.
7. Finalize once the task is complete.

## Recommended Prompt Skeleton

Use this when generating a new Lantern browser autograder:

```text
Create a Lantern reviewed package that matches the browser-autograder starter.

Constraints:
- Browser-only code
- No external network calls
- No backend code
- No fallback runtime path
- Use window.GatewayApp for launch context, content, local state, events,
  submitEvidenceArtifact, and finalize
- Include manifest.json, dist/index.html, dist/app.js, content/activity.json,
  preview/fixtures.json, preview/tests.json, grading/specs/checks.spec.js, and
  evidence/example-output.json
- Keep the package aligned with `deno task app:new /tmp/my-app --starter=browser-autograder --app-id=my-app --title="My App"`
```

For a simpler reviewed activity, use the same constraints but match the
`simple-activity` starter instead.

## Validation Loop

After generating the package, run:

```sh
deno task app:validate /path/to/app
deno task app:test-preview /path/to/app
deno task app:preview /path/to/app
```

Use `app:preview` when you need a live browser URL. `app:test-preview` is the
faster contract check for `preview/tests.json`.
