# Office Hours Web Lab

This is a concrete browser-autograder demo for a Tsugi-style HTML, CSS, and
JavaScript assignment.

It models a realistic use case for Dr. Chuck:

- a learner repairs a small office-hours sign-up page
- Lantern grades the visible output with reviewed Jasmine specs
- Lantern can return anonymous evidence without giving the app LMS identity or
  direct grade-write power

The app stays honest about Lantern's current boundary. It does not execute
arbitrary learner JavaScript. Instead, it demonstrates the governed pattern
Lantern can support today:

- explicit authoring files in `grading/specs/`
- one student workbench that produces reviewable browser output
- browser grading on the same contained runtime seam as preview
- anonymous evidence upload through Lantern-owned storage

Use it when you want an example that is more assignment-shaped than
`template-app` and more concrete than `web-checkup`.

It is still Tier 0:

- no backend code
- no direct LMS API access
- no arbitrary outbound HTTP
- no direct grade writes
