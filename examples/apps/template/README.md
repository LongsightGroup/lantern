# Lantern Template

This is the smallest Lantern app package intended to be copied.

It shows one blessed path:

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
- `manifest.authoring.grader_spec_files` is the reviewed spec list
- Lantern runs those files through its Lantern-owned Jasmine harness

Start here:

```sh
cp -R examples/apps/template /tmp/my-lantern-app
deno task app:validate /tmp/my-lantern-app
deno task app:preview /tmp/my-lantern-app
```

Then edit:

- `manifest.json`
- `content/activity.json`
- `dist/index.html`
- `dist/app.js`
- `preview/fixtures.json`
- `preview/tests.json`
- `grading/specs/checks.spec.js`
- `evidence/example-output.json`

Do not add:

- backend code
- direct LMS API calls
- direct grade writes
- arbitrary outbound HTTP
- standalone fallback paths that bypass Lantern
