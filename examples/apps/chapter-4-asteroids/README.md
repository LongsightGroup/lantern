# Chapter 4 Asteroids

This is a playable Tier 0 reference app package.

It shows the intended v1 shape:

- static frontend bundle
- manifest
- content file
- scoring file
- preview fixtures
- preview tests

It also shows the runtime boundary:

- reads content from the gateway when available
- emits durable answer and progress events
- finalizes the attempt through Lantern
- never writes grades directly
- never accesses Canvas tokens or a database

The current demo is a canvas-based mini arcade mission:

- wave-based asteroid interception
- colorful motion and particle effects
- declarative grading that still maps to the reviewed rubric
- responsive controls for keyboard and touch demoing
