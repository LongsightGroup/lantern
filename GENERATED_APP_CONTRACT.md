# Generated App Contract

Contract id: `lantern-generated-app-contract@0.1.0`

This is the contract for apps created by Lantern App Writer. It is narrower than
the general app package spec because generated code needs a smaller, more
governable target.

The short version:

> A generated app is a reviewed browser activity package. Lantern owns LMS
> launch, identity, storage, grading, runtime delivery, logs, and approval.

## Why This Contract Exists

Lantern should let instructors create useful learning apps without creating new
LMS integration risk for every app. The generated app contract keeps that
possible by making the app responsible for the learning experience only.

Generated apps may provide:

- browser UI
- lesson content
- learner interaction logic
- preview assertions
- structured attempt events through `window.GatewayApp`

Generated apps must not provide:

- LMS integration code
- backend services
- direct storage
- direct grade passback
- arbitrary network access
- Cloudflare Worker or Durable Object code

## Relationship To Other Contracts

This contract sits on top of:

- [APP_PACKAGE_SPEC.md](APP_PACKAGE_SPEC.md), the package format and manifest
  contract
- [sdk/app-sdk.ts](sdk/app-sdk.ts), the GatewayApp SDK type surface
- [schemas/app-manifest.schema.json](schemas/app-manifest.schema.json), the
  manifest schema
- [AUTHORING_FOR_LLMS.md](AUTHORING_FOR_LLMS.md), prompt-facing generation
  guidance

If there is a conflict, the generated app contract is stricter for App Writer
output.

## Required Package Shape

Every generated app package must include:

```text
manifest.json
dist/index.html
dist/pico.min.css
dist/lantern-app.css
dist/app.css
dist/app.js
content/activity.json
preview/fixtures.json
preview/tests.json
```

Optional files depend on the selected starter and grading mode:

```text
scoring/rubric.json
grading/specs/*.js
evidence/example-output.json
```

Allowed generated package paths:

- `manifest.json`
- `dist/*.html`
- `dist/*.js`
- `dist/*.css`
- `content/activity.json`
- `preview/fixtures.json`
- `preview/tests.json`
- `scoring/rubric.json`
- `grading/specs/*.js` for browser autograder packages
- `evidence/example-output.json` for browser autograder packages

Instruction, contract, source, and diagnostics files used by the harness are not
package artifacts.

Examples:

- `AGENTS.md` is instruction, not package.
- `.lantern/contracts/**` is contract context, not package.
- `source/app.ts` is authoring evidence, not package.
- validation diagnostics are evidence, not package.

## Runtime Boundary

The LMS launches Lantern. Lantern launches the reviewed app package.

Generated app code runs as browser code on the reviewed runtime origin. It does
not receive:

- raw LMS access tokens
- LTI launch JWTs
- D1 or R2 bindings
- Cloudflare environment bindings
- Worker Loader control
- direct database handles
- secrets
- arbitrary outbound HTTP capability

Lantern may use Cloudflare Workers, D1, R2, Dynamic Workers, Worker Loader, or
Durable Objects behind the platform boundary. Those implementation choices do
not become generated app capabilities.

## SDK Surface

Generated apps use only `window.GatewayApp`.

Allowed methods:

- `getLaunchContext()`
- `getActivityContent<T>()`
- `readLocalState<T>()`
- `writeLocalState<T>(value)`
- `emitAttemptEvent(event)`
- `submitEvidenceArtifact(input)`
- `submitScoreProposal(input)`
- `runBrowserGrader()`
- `finalizeAttempt(input)`

The app must guard the SDK before use:

```ts
const gateway = window.GatewayApp;
if (!gateway) {
  throw new Error('GatewayApp is required.');
}
```

Manifest capabilities must match SDK use exactly. If code calls
`writeLocalState()`, the manifest must declare `write_local_state`. If code does
not need local state, it must not request that capability.

## State And Progress

Every serious learning app needs state. Generated apps do not choose the storage
substrate.

Use:

- `readLocalState()` to resume the current learner's app state
- `writeLocalState(value)` to save resumable learner progress
- `emitAttemptEvent(event)` for durable, reportable learner actions
- `finalizeAttempt({ completionState: "completed" })` when the activity is done

Do not use:

- `localStorage`
- `sessionStorage`
- cookies
- IndexedDB
- custom databases
- direct LMS grade APIs
- SCORM, xAPI, cmi5, LRS, or external reporting APIs
- arbitrary `fetch()` for learning records

For instructor reports, generated apps should emit stable attempt events. The
platform normalizes those events into answered, progressed, and completed
learning records for reports and future standards-shaped export. The app should
not invent a class-wide database.

## Attempt Events

Supported event shapes:

```ts
type AttemptEvent =
  | {
    type: 'answer';
    questionId: string;
    answer: string | string[];
    correct?: boolean;
    scoreGiven?: number;
    scoreMaximum?: number;
    timestamp: string;
  }
  | { type: 'progress'; checkpoint: string; value: number; timestamp: string }
  | { type: 'complete'; timestamp: string };
```

Rules:

- Answer events need stable `questionId` values from reviewed content.
- Answer events may include `correct`, `scoreGiven`, and `scoreMaximum` when the
  app can determine them from reviewed content.
- Progress events need a stable checkpoint name and numeric value.
- Complete events contain only `type` and `timestamp`.
- The app should emit events after meaningful learner actions, not on every
  render.
- The app must not emit raw xAPI statements or call SCORM/cmi5/LRS APIs.

## Styling And Design

Generated apps use a self-contained style stack:

1. `dist/pico.min.css`, pinned by Lantern
2. `dist/lantern-app.css`, pinned by Lantern
3. `dist/app.css`, generated app-specific styles

Rules:

- Do not modify `dist/pico.min.css`.
- Do not modify `dist/lantern-app.css`.
- Do not load external fonts, stylesheets, scripts, icons, images, or CDNs.
- Use Pico defaults for ordinary typography, forms, buttons, tables, and
  progress elements.
- Use Lantern learning-app classes for activity frames, choices, feedback,
  progress summaries, and reports.
- Let Pico style radios and checkboxes. Do not partially override native form
  controls.
- Work inside an LMS iframe down to 360px width.

Generated apps should feel like focused learning tools, not landing pages,
marketing pages, LMS clones, or general dashboards.

## Preview Contract

Every generated package must include a runnable preview contract:

- `preview/fixtures.json` provides fake launch context, attempt id, activity
  content, and local state.
- `preview/tests.json` asserts the app renders and proves meaningful behavior.

Preview tests should cover:

- app title
- primary instructions or learner task
- at least one meaningful interaction or visible status update
- completion, report, score, or evidence state when the prompt asks for it

Preview tests are part of the proof loop. The model must repair the app when
preview fails, not remove tests to hide failures.

## Explicitly Forbidden Code

Generated package files must not include:

- `fetch()` calls or external URLs
- remote script, stylesheet, image, font, or icon references
- JavaScript or TypeScript imports
- module exports
- `eval` or `new Function`
- `localStorage` or `sessionStorage`
- `indexedDB`
- Canvas, Moodle, Blackboard, Sakai, or LMS API clients
- SCORM runtime APIs, xAPI/TinCan clients, cmi5 clients, or LRS endpoints
- LTI launch or Deep Linking logic
- grade passback code
- Cloudflare Worker entrypoints
- Durable Object classes or bindings
- D1, R2, KV, Queue, or service bindings
- `env.*` platform binding access

Lantern validation must reject these shapes before a package can be saved or
approved.

## Definition Of Done

A generated app version is not done until Lantern can prove:

1. The initialized workspace exists and records this contract.
2. TypeScript authoring source passes strict typecheck when source files exist.
3. `dist/app.js` is browser-only reviewed code with no imports.
4. Required package files are present.
5. Pinned Pico and Lantern stylesheets are unchanged.
6. `manifest.json` passes schema validation.
7. Manifest capabilities match SDK calls.
8. Static policy checks pass.
9. Package validation passes.
10. Preview/runtime assertions pass.
11. Design and style contract checks pass.
12. A pending package version is saved only after all checks pass.
13. A human reviewer can inspect capabilities, preview evidence, activity logs,
    runtime logs, and package files before approval.

## Review Questions

Reviewers should be able to answer:

- What does this app ask the learner to do?
- What capabilities does it request?
- What learner state does it store?
- What attempt events does it emit?
- Does it finalize attempts?
- Does it request evidence or browser grading?
- Does preview prove the required behavior?
- Is anything elevated enough to require IT/security review?

If the answer is unclear, the version should stay pending or be rejected.
