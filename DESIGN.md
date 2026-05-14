# Lantern Design Principles

Lantern is a governed app platform for institution-built and AI-built learning
apps. Its interface should make review, approval, launch, grading, and audit
work feel clear and dependable.

This is the public UI design contract for the repo. It should stay focused on
implementation-facing principles and reusable interface rules. Private product
strategy, research, internal operations, and Cloudflare setup details do not
belong here.

## Product Feel

Lantern should feel:

- institutional
- clear
- calm
- trustworthy
- more modern than Canvas, but compatible with that world

Lantern should not feel like:

- a flashy startup dashboard
- a generic app marketplace
- an LMS replacement
- a pile of one-off admin screens

The UI exists to make governed learning-app operations legible. It should help
reviewers and operators understand what is approved, what is live, what changed,
what failed, and what evidence exists.

## Interface Model

Prefer:

- server-rendered HTML
- plain CSS tokens
- strong information hierarchy
- accessible defaults
- reusable page and component patterns
- explicit status, evidence, and next action language
- dense but readable operational pages

Avoid:

- React-heavy front ends by reflex
- Tailwind or utility-heavy styling
- highly custom one-off UI patterns
- decorative effects that compete with operational facts
- marketing-page composition inside the admin product
- hidden fallback flows or ambiguous recovery states

When a page is about governance, the primary facts should be visible before
secondary decoration or explanation.

## Visual Language

Use a quiet institutional palette:

- navy and blue-gray for structure and primary actions
- warm amber only as a restrained brand accent
- green, amber, and red for semantic success, warning, and danger states
- light surfaces with clear borders and enough spacing to scan

The current admin tokens live in
[`src/admin/layout_style_tokens.ts`](src/admin/layout_style_tokens.ts). New
admin UI should use those tokens before introducing new colors, radii, shadows,
or spacing systems.

Default shape:

- cards and controls use small radii
- borders are preferred over heavy shadows
- status badges should be semantic, compact, and readable
- tables and fact grids should optimize for scanning and comparison

## Content Rules

Use plain operational language.

Good Lantern copy:

- names the object being acted on
- states the exact status or blocker
- names the trusted boundary when relevant
- explains failures clearly without exposing secrets
- gives one obvious next step when a next step exists

Avoid copy that:

- implies generated apps have raw LMS, D1 database, or grading access
- hides governance behind vague success states
- invents compatibility promises the system does not actually provide
- exposes private tenant, infrastructure, pricing, or strategy details

## Workflow Rules

Every admin workflow should make these questions easy to answer:

1. What app, version, deployment, LMS slot, attempt, or placement am I looking at?
2. Is it reviewed, approved, live, blocked, or failed?
3. What exact boundary produced this state?
4. What durable evidence exists?
5. What is the one safe next action?

Prefer one correct path over several similar actions. If a task is unavailable,
fail clearly and keep the user inside a Lantern-owned page.

## Accessibility

Accessibility is part of the governance model, not polish.

Design and implementation should preserve:

- semantic headings and landmarks
- keyboard-reachable controls
- visible focus states
- readable contrast
- labels for form controls
- stable layout at narrow and wide viewport sizes
- clear error text near the relevant action

When a reviewed package has accessibility evidence or exceptions, surface that
state before it goes live.

## Review Checklist

Before shipping UI changes, check:

- The page still feels institutional, clear, and calm.
- Primary governance facts are visible without hunting.
- New styles reuse existing tokens and patterns.
- Buttons and links have clear action language.
- Failure states are explicit and do not silently degrade.
- No private strategy, secrets, account details, or infra values appear.
- The change keeps the trusted LMS/runtime/grading boundary legible.
