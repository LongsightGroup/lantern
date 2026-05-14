# Browser Autograder Cookbook

This is Lantern's canonical path for reviewed HTML, CSS, and JavaScript
autograders.

Use this pattern when the package needs:

- browser-only learner code
- reviewed grader specs
- governed evidence return
- local preview assertions
- import into Lantern's reviewed package inventory

This is still one reviewed Lantern package. It is not a separate external tool
model.

## Scaffold

Start from the shipped browser-autograder starter:

```sh
deno task app:new /tmp/my-browser-autograder --starter=browser-autograder --app-id=my-autograder --title="My Autograder"
```

If you only need a simpler activity with no reviewed browser grader specs, use
`--starter=simple-activity` instead.

## Package Shape

The browser-autograder starter gives you this reviewed artifact shape:

```text
my-browser-autograder/
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

`web-checkup` in [examples/apps/web-checkup](examples/apps/web-checkup) is the
richer reference package for this shape.

## Manifest Contract

For a reviewed browser autograder, the key manifest fields are:

```json
{
  "grading": {
    "mode": "browser",
    "max_score": 100
  },
  "preview": {
    "fixtures_file": "/preview/fixtures.json",
    "tests_file": "/preview/tests.json"
  },
  "authoring": {
    "kind": "browser_autograder",
    "grader_spec_files": ["/grading/specs/checks.spec.js"],
    "evidence_example_file": "/evidence/example-output.json"
  }
}
```

What that means:

- `grading.mode = "browser"` tells Lantern to run reviewed browser grading
- `preview.tests_file` points to the local preview assertion contract
- `authoring.grader_spec_files` is the only reviewed grader spec source
- `authoring.evidence_example_file` points to the structured evidence example

Lantern runs those reviewed spec files through Lantern's own Jasmine harness.
The package does not get raw LMS tokens, arbitrary outbound HTTP, or server-side
code execution.

## Files To Edit

Edit these first:

- `manifest.json`
- `content/activity.json`
- `dist/index.html`
- `dist/app.js`
- `preview/fixtures.json`
- `preview/tests.json`
- `grading/specs/checks.spec.js`
- `evidence/example-output.json`

`preview/tests.json` is for local preview assertions. Keep it narrow: selector
existence, exact text, or contains text.

`grading/specs/*.js` is for reviewed browser grading. Use Jasmine-style checks
against the contained learner page.

`evidence/example-output.json` is the structured evidence baseline. Optional
screenshots are supplemental artifacts on the same Lantern-owned evidence path,
not a second submission model.

## Local Loop

Validate the package:

```sh
deno task app:validate /tmp/my-browser-autograder
```

Execute the preview assertions:

```sh
deno task app:test-preview /tmp/my-browser-autograder
```

Open a live preview URL when you want to inspect the rendered package:

```sh
deno task app:preview /tmp/my-browser-autograder
```

For a richer shipped example, these commands already work against `web-checkup`:

```sh
deno task app:validate examples/apps/web-checkup
deno task app:test-preview examples/apps/web-checkup
```

## Example: Web Checkup

`web-checkup` shows the same package contract with more than one reviewed grader
spec:

- `grading/specs/structure.spec.js`
- `grading/specs/behavior.spec.js`
- `evidence/example-output.json`
- `preview/tests.json`

That makes it the best reference when the autograder needs multiple reviewed
checks instead of one starter file.

## Import And Review

When the package is ready for governed review:

1. Start Lantern locally with `deno task local:init`,
   `deno task local:bootstrap`, and `deno task local:start`.
2. Open `/admin/packages/import` on the localhost URL printed by Wrangler.
3. Import the exact package directory you validated locally.

Lantern stores an immutable reviewed snapshot, signs the reviewed runtime
contract for that artifact, and adds the version to admin inventory for review,
approval, and LMS setup.

This keeps browser autograders inside Lantern's normal package boundary:

- one reviewed package
- one governed evidence path
- one grading and audit boundary
- one import and approval flow
