# TypeScript Ladder Game

This package is Lantern's shipped `typescript-ladder-game` reference app.
The learner experience is a ten-step TypeScript correction ladder.

It demonstrates a narrower browser-autograder shape:

- each step shows one reviewed TypeScript snippet
- the learner must correct the current snippet before the next one unlocks
- the difficulty rises from primitive annotations to exhaustive checks
- Lantern grades one reviewed step spec per exercise

If you want to evaluate it quickly as a shipped example, run:

```sh
deno task app:preview examples/apps/typescript-ladder-game
```

If you want to inspect it as a reviewed package, run the same local checks used
for authoring:

```sh
deno task app:validate examples/apps/typescript-ladder-game
deno task app:test-preview examples/apps/typescript-ladder-game
```

For the full package loop, read:

- [AUTHORING.md](../../../AUTHORING.md)
- [BROWSER_AUTOGRADER_COOKBOOK.md](../../../BROWSER_AUTOGRADER_COOKBOOK.md)

The app stays honest about Lantern's current boundary:

- it does not execute arbitrary learner TypeScript
- it compares the learner's edited snippet against the reviewed correction
- it still uses Lantern's browser grader, local state, finalize flow, and
  anonymous evidence return

Use it when you want a governed TypeScript-flavored demo that is simpler and
more legible than the earlier web-page repair example.
