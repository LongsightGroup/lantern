# Web Checkup

This is a richer Lantern authoring example for HTML, CSS, and JavaScript
revision work.

It demonstrates one explicit authoring path:

- the same `authoring` manifest object as `template-app`
- preview fixtures and preview tests for local authoring
- reviewed browser grading specs for structure and behavior review
- one example evidence artifact returned by the reviewed app flow

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
