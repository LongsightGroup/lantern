# App Package Spec

This is the concrete v1 contract for apps that run inside the gateway.

Companion artifacts:

- manifest schema:
  [schemas/app-manifest.schema.json](schemas/app-manifest.schema.json)
- SDK contract: [sdk/app-sdk.ts](sdk/app-sdk.ts)
- sample packages:
  [examples/apps/chapter-4-asteroids/README.md](examples/apps/chapter-4-asteroids/README.md)
  and [examples/apps/quick-study/README.md](examples/apps/quick-study/README.md)
  These are governed reference apps, not a hosting surface.

The goal is simple:

- make app generation easy
- make review possible
- make unsafe shortcuts impossible by default

This spec is intentionally narrow. It is for Tier 0 apps only.

## v1 Scope

This spec supports:

- learner-facing course activities
- games
- quizzes
- simulations
- tutors
- practice tools

This spec does not support:

- arbitrary backend code
- direct LMS API access
- direct database access
- arbitrary outbound HTTP
- direct grade writes

## Package Layout

```text
app/
  manifest.json
  dist/
    index.html
    assets/*
  content/
    activity.json
  scoring/
    rubric.json
  preview/
    fixtures.json
    tests.json
  grading/
    specs/
      *.js
  evidence/
    example-output.json
```

Rules:

- `manifest.json` is required
- `dist/index.html` is required
- everything else is optional, but strongly encouraged
- the package is immutable once signed

## Manifest

The manifest is the review contract.

### Required fields

- `schema_version`
- `app_id`
- `version`
- `title`
- `owner`
- `entrypoint`
- `capabilities`
- `roles`
- `grading`

### Optional fields

- `description`
- `icon`
- `install_scope`
- `browser`
- `content_files`
- `preview`
- `authoring`

### Example

```json
{
  "schema_version": "1",
  "app_id": "chapter-4-asteroids",
  "version": "0.1.0",
  "title": "Chapter 4 Asteroids",
  "description": "Shoot the correct vocabulary target.",
  "owner": {
    "type": "user",
    "id": "instructor_123"
  },
  "entrypoint": "/dist/index.html",
  "roles": ["learner", "instructor"],
  "install_scope": "course",
  "capabilities": [
    "read_launch_context",
    "read_activity_content",
    "submit_attempt_event",
    "submit_evidence_artifact",
    "finalize_attempt",
    "read_local_state",
    "write_local_state"
  ],
  "grading": {
    "mode": "browser",
    "max_score": 100
  },
  "browser": {
    "fullscreen": false,
    "clipboard_write": false
  },
  "content_files": ["/content/activity.json"],
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

## Field Semantics

### `schema_version`

String. Starts at `"1"`.

### `app_id`

Stable logical id for the app across versions.

### `version`

Immutable artifact version. Semver is fine.

### `owner`

Must identify who is responsible for the app.

v1 shape:

```json
{
  "type": "user",
  "id": "user_123"
}
```

### `entrypoint`

Path to the HTML entry file inside the package.

### `roles`

Allowed values in v1:

- `learner`
- `instructor`

### `install_scope`

Allowed values in v1:

- `course`
- `assignment`

Default: `course`

### `capabilities`

Allowed values in v1:

- `read_launch_context`
- `read_activity_content`
- `submit_attempt_event`
- `submit_evidence_artifact`
- `finalize_attempt`
- `read_local_state`
- `write_local_state`

Nothing else is valid in v1.

`submit_evidence_artifact` requires `finalize_attempt`. It maps to
`window.GatewayApp.submitEvidenceArtifact()` and keeps one governed evidence
path. The reviewed app can return structured JSON evidence and, when the review
contract allows it, optional supplemental screenshot artifacts. Lantern still
owns storage, submission binding, finalize, grading, audit, and any later grade
publication.

### `grading.mode`

Allowed values in v1:

- `declarative`
- `manual`
- `completion`
- `browser`

`declarative` means the gateway computes the score from a rubric or rule set.
`browser` means Lantern runs the reviewed `authoring.grader_spec_files` through
a Lantern-owned Jasmine harness on the contained runtime origin.

### `browser`

This is not a permission grant. It is a request for review.

Allowed fields in v1:

- `fullscreen`
- `clipboard_write`

Default is false for both.

### `authoring`

This is an optional artifact contract for reviewed authoring examples. It does
not grant runtime permissions.

Allowed fields in v1:

- `kind`
- `grader_spec_files`
- `evidence_example_file`

Allowed values in v1:

- `kind = "browser_autograder"`

Canonical browser-autograder layout:

- grader specs live under `grading/specs/*.js`
- example evidence lives at `evidence/example-output.json`

These files are reviewable artifacts for teachers and future AI authoring flows.
They do not grant LMS access, outbound HTTP, or direct grade writes.

`authoring.evidence_example_file` should point to a structured JSON example.
That JSON file is the canonical evidence baseline for authors and AI. Optional
supplemental screenshot evidence still uses the same governed
`submitEvidenceArtifact()` path and does not replace structured output as the
primary review contract.

When `grading.mode = "browser"`:

- `grading.max_score` is required
- `grading.rubric_file` is not used
- `authoring.kind` must be `browser_autograder`
- `authoring.grader_spec_files` is the only reviewed grader spec source
- Lantern runs those reviewed files through its Lantern-owned Jasmine harness

## Bootstrap Payload

At launch, the gateway gives the app a short-lived bootstrap payload.

The app does not get LMS tokens or general session power.

### Shape

```json
{
  "launch": {
    "user_role": "learner",
    "course_id": "course_42",
    "assignment_id": "assignment_9",
    "activity_id": "activity_123",
    "submission_mode": "anonymous_submission"
  },
  "app": {
    "app_id": "chapter-4-asteroids",
    "version": "0.1.0",
    "capabilities": [
      "read_launch_context",
      "read_activity_content",
      "submit_attempt_event",
      "finalize_attempt"
    ]
  },
  "session": {
    "attempt_id": "attempt_abc",
    "token": "short-lived-token"
  }
}
```

Rules:

- token must be short-lived
- token must be scoped to this app version and launch
- token must be sent in auth headers for later calls

## SDK Contract

The SDK should be tiny.

## Read APIs

```ts
type LaunchContext = {
  userRole: 'learner' | 'instructor';
  courseId: string;
  assignmentId?: string;
  activityId: string;
  submissionMode: 'standard' | 'anonymous_submission';
};

declare function getLaunchContext(): Promise<LaunchContext>;
declare function getActivityContent<T = unknown>(): Promise<T>;
declare function readLocalState<T = unknown>(): Promise<T | null>;
```

## Write APIs

```ts
type AttemptEvent =
  | {
      type: 'answer';
      questionId: string;
      answer: string | string[];
      timestamp: string;
    }
  | {
      type: 'progress';
      checkpoint: string;
      value: number;
      timestamp: string;
    }
  | {
      type: 'complete';
      timestamp: string;
    };

declare function emitAttemptEvent(event: AttemptEvent): Promise<void>;
declare function finalizeAttempt(input?: {
  completionState?: 'completed' | 'abandoned';
}): Promise<{ accepted: true }>;
declare function writeLocalState<T = unknown>(value: T): Promise<void>;
```

## Explicitly Forbidden SDK Surface

The SDK must not expose:

- `getCanvasAccessToken()`
- `writeGrade()`
- `runSql()`
- `fetch(url)`
- `assumeRole()`
- `readFullRoster()`

If we add those, we have broken the trust boundary.

## Runtime Backend Note

This spec defines the app-facing capability contract, not one required hosting
vendor or transport.

Lantern may realize this contract through different runtime backends as long as
the app sees the same narrow SDK surface and the same trust boundary.

For example, a managed Lantern deployment may choose a capability-based sandbox
such as Cloudflare Dynamic Workers to:

- block arbitrary outbound Internet access
- inject only explicit typed bindings that match Lantern capabilities
- keep LMS credentials and other privileged secrets outside the app sandbox

That does not change the public package contract.

Rules:

- app packages must not depend on Cloudflare-specific APIs, bindings, or worker
  internals
- self-hosted Lantern deployments must be able to honor the same contract
  through a different backend
- Dynamic Workers or any similar sandbox may tighten the implementation, but
  they do not add new app capabilities by themselves

## Scoring Contract

v1 scoring is gateway-owned.

The app may:

- emit answer events
- emit progress events
- mark completion

The gateway may:

- score declaratively
- compute completion credit
- hold for instructor review
- write the final grade to Canvas

The app may not:

- compute an authoritative LMS grade
- send a grade to Canvas directly

## Local State Contract

Local state is for app continuity, not institutional records.

Good uses:

- current level
- checkpoint progress
- unsent answers
- display preferences

Bad uses:

- final grades
- broad roster caches
- secrets
- anything that bypasses gateway audit

## Preview Contract

Every app must run in preview without Canvas.

Preview mode must provide:

- fake launch context
- fake course and assignment ids
- fake learner and instructor roles
- fake attempt ids
- visible capability log
- fake scoring response

This is how authors build fast without weakening the runtime model.

## Review Contract

Before an app version can publish, the platform should have:

- manifest validation passed
- bundle present
- preview runnable
- accessibility checks passed or flagged
- security checks passed or flagged
- artifact signed
- reviewer recorded

## Install Contract

Courses do not install an app id. They install an app version.

That gives us:

- reproducibility
- review history
- rollback
- auditable deployment

## v1 Philosophy

This spec is intentionally strict.

If someone says:

- “I just need a little backend”
- “I just need the raw Canvas token”
- “I just need to call one arbitrary URL”

the answer in v1 should be no.

That discipline is the whole point.
