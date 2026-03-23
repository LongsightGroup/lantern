# Chapter 4 Asteroids

This is a minimal Tier 0 sample app package.

It shows the intended v1 shape:

- static frontend bundle
- manifest
- content file
- scoring file
- preview fixtures
- preview tests

It also shows the runtime boundary:

- reads content from the gateway when available
- emits answer events
- finalizes the attempt
- never writes grades directly
- never accesses Canvas tokens or a database
