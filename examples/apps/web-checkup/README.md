# Web Checkup

This is Lantern's richer browser-autograder reference package for HTML, CSS,
and JavaScript revision work.

Use it when the starter package is too small and you want one concrete example
that already includes:

- `preview/tests.json`
- multiple reviewed grader spec files under `grading/specs/`
- `evidence/example-output.json`
- the same reviewed import path as any other Lantern package

Check it through the shipped local loop:

```sh
deno task app:validate examples/apps/web-checkup
deno task app:test-preview examples/apps/web-checkup
deno task app:preview examples/apps/web-checkup
```

For the full browser-autograder process, read:

- [BROWSER_AUTOGRADER_COOKBOOK.md](../../../BROWSER_AUTOGRADER_COOKBOOK.md)
- [AUTHORING.md](../../../AUTHORING.md)

Its reviewed browser grading contract stays narrow:

- `manifest.json` uses `grading.mode = "browser"`
- `manifest.json` grants `submit_evidence_artifact` only alongside
  `finalize_attempt`
- reviewed browser grading reuses `authoring.grader_spec_files`
- Lantern runs those reviewed files through its Lantern-owned Jasmine harness
- Lantern owns anonymous evidence return instead of giving the app direct LMS
  submission power

The activity itself is calm and institutional: learners inspect a small page
revision checklist, record progress, and finalize the review through Lantern.

This package is intentionally still Tier 0:

- no backend code
- no direct LMS API access
- no arbitrary outbound HTTP
- no direct grade writes
