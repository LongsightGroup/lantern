# Quick Study

This is a calm Tier 0 reference app package.

It shows a simpler learner-facing shape than the arcade sample:

- static frontend bundle
- manifest
- content file
- preview fixtures
- preview tests

It also demonstrates the governed runtime boundary:

- reads reviewed card content from the gateway when available
- emits answer and progress events as the learner rates each card
- uses Lantern local state for deck memory when available
- finalizes the study session through Lantern
- never writes grades directly
- never accesses LMS tokens or Lantern's D1 database

The current demo is a flashcard deck with a light mastery loop:

- reveal the answer on each card
- mark `Again`, `Almost`, or `Got it`
- build a streak while clearing the tray
- log the completed session back to Lantern
