# Lantern Template

This is the reference package behind the `browser-autograder` starter.

Use `deno task app:new ... --starter=browser-autograder` instead of copying this
directory directly.

It shows one blessed browser-autograder path:

- static frontend files under `dist/`
- one manifest
- one content file
- one preview fixtures file
- one preview tests file
- one reviewed browser grading starter file
- one example evidence artifact
- one runtime seam through `window.GatewayApp`

Its reviewed browser grading contract is explicit:

- `manifest.json` uses `grading.mode = "browser"`
- `manifest.json` grants `submit_evidence_artifact` only alongside
  `finalize_attempt`
- `manifest.authoring.grader_spec_files` is the reviewed spec list
- Lantern runs those files through its Lantern-owned Jasmine harness
- `window.GatewayApp.submitEvidenceArtifact()` is the governed evidence path
- structured JSON is the canonical example evidence format
- supplemental screenshot evidence is optional and uses the same Lantern-owned
  storage, finalize, and audit boundary
- Lantern owns anonymous evidence return; the app does not submit directly to
  the LMS

Scaffold a fresh package:

```sh
deno task app:new /tmp/my-browser-autograder --starter=browser-autograder --app-id=my-autograder --title="My Autograder"
deno task app:validate /tmp/my-browser-autograder
deno task app:test-preview /tmp/my-browser-autograder
deno task app:preview /tmp/my-browser-autograder
```

Then use this directory as the reference for what to edit:

- `manifest.json`
- `content/activity.json`
- `dist/index.html`
- `dist/app.js`
- `preview/fixtures.json`
- `preview/tests.json`
- `grading/specs/checks.spec.js`
- `evidence/example-output.json`

For the full reviewed browser-autograder flow, read:

- [BROWSER_AUTOGRADER_COOKBOOK.md](../../../BROWSER_AUTOGRADER_COOKBOOK.md)
- [AUTHORING.md](../../../AUTHORING.md)

Do not add:

- backend code
- direct LMS API calls
- direct grade writes
- arbitrary outbound HTTP
- standalone fallback paths that bypass Lantern
