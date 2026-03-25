import { renderLayout } from "./layout.ts";

export function renderHomePage(): string {
  return renderLayout(
    "Lantern",
    `<main class="home">
      <section class="home-hero">
        <p class="eyebrow">Lantern</p>
        <h1>Governed learning app runtime for institutions</h1>
        <p>
          Lantern keeps launch validation, grading, and evidence inside one trusted server boundary.
          Teams can review approved app versions and evaluate behavior without exposing LMS credentials
          to downstream app code.
        </p>
      </section>

      <section class="home-grid" aria-label="Lantern capability story">
        <article class="home-card">
          <h2>Governed capabilities</h2>
          <ul>
            <li>Reviewed package versions pinned before classroom launch.</li>
            <li>Gateway-managed scoring and grade publish flow.</li>
            <li>Sandboxed preview sessions that exercise reviewed app behavior safely.</li>
          </ul>
        </article>

        <article class="home-card">
          <h2>Reporting surfaces</h2>
          <ul>
            <li>Placement audit views with reviewed content and current status.</li>
            <li>Reviewer diagnostics for preview runs and bounded evidence events.</li>
            <li>Control-plane inventory for package approvals, deployments, and usage.</li>
          </ul>
        </article>

        <article class="home-card">
          <h2>Governance process</h2>
          <ol>
            <li>Review and approve one exact package version.</li>
            <li>Bind the approved version to deployment and placement records.</li>
            <li>Inspect runtime, grading, and reviewer evidence from SSR operator pages.</li>
          </ol>
        </article>

        <article class="home-card">
          <h2>Evaluator next step</h2>
          <p>
            Open the governed control surface to inspect package approval, placement audit, and preview
            evidence flows.
          </p>
          <p class="home-cta">
            <a href="/admin/packages" class="cta-primary">Open governed control surface</a>
          </p>
        </article>
      </section>
    </main>`,
  );
}
